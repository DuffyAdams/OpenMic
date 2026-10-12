#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["yt-dlp", "pyyaml"]
# ///
"""Build the songbook: find embeddable karaoke videos for every song in songs.yaml.

Uses yt-dlp to search YouTube (no API key, no quota) and YouTube's oEmbed endpoint to confirm each
video may play outside YouTube. Only metadata is read; nothing is downloaded. The result,
services/api/app/songbook.json, is committed and loaded by the server at startup.

    make songbook                   # find videos for songs that don't have any yet
    make songbook ARGS=--check      # re-check every saved video, replace dead ones
    make songbook ARGS=--fill       # also look again for songs with fewer than 3 videos
    make songbook ARGS="--only brightside --refresh"

Progress is saved after every song, so an interrupted run picks up where it stopped.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import yaml
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "services/api/songbook/songs.yaml"
OUTPUT = ROOT / "services/api/app/songbook.json"
OEMBED = "https://www.youtube.com/oembed"

CANDIDATES = 12  # search results to consider per song
MIN_SECONDS, MAX_SECONDS = 90, 16 * 60
STOPWORDS = {"the", "a", "an", "of", "to", "in", "on", "and", "my", "with", "for", "me", "i"}
# Words in a video title that mean it isn't a straight karaoke track (unless the song has them).
REJECT_WORDS = set(
    "reaction tutorial lesson live remix nightcore medley mashup shorts 8d slowed hour "
    "parody".split()
)
REJECT_PHRASES = (
    "sped up", "no lyrics", "without lyrics", "how to sing", "male part only",
    "female part only", "(male part", "(female part", "vocal only", "vocals only",
)
KEY_CHANGE = re.compile(
    r"\b(lower|higher|male|female) key\b|\bkey of\b|\b[+-]\d\b|\bsemitone|\bkey ?change\b"
)
# YouTube slowing us down (not a verdict on the video): back off and retry.
THROTTLED = re.compile(r"not a bot|confirm you|\b429\b|too many requests|rate.?limit", re.I)
BACKOFF_SECONDS = (60, 120, 240, 480)


# --- Text matching ---------------------------------------------------------------------------


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"in['’](?=\s|$)", "ing", text)  # livin' -> living
    text = text.replace("&", " and ").replace(".", "")
    text = re.sub(r"['’`]", "", text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def tokens(text: str) -> list[str]:
    return norm(text).split()


def slug(text: str) -> str:
    return norm(text).replace(" ", "-")


def main_artist(artist: str) -> str:
    return re.split(r"\s+(?:ft\.|feat\.|featuring)\s+", artist, maxsplit=1, flags=re.IGNORECASE)[0]


# --- Song list -------------------------------------------------------------------------------


@dataclass
class Song:
    id: str
    title: str
    artist: str
    duet: bool = False
    pinned: list[str] = field(default_factory=list)
    search: str = ""

    @property
    def query(self) -> str:
        return self.search or f"{main_artist(self.artist)} {self.title} karaoke"


def load_source() -> tuple[list[dict], dict[str, Song]]:
    data = yaml.safe_load(SOURCE.read_text())
    categories: list[dict] = []
    songs: dict[str, Song] = {}
    for cat in data["categories"]:
        ids: list[str] = []
        for entry in cat["songs"]:
            spec = entry if isinstance(entry, dict) else {"song": entry}
            text = str(spec["song"])
            if " - " not in text:
                sys.exit(f'songs.yaml: "{text}" must be written "Title - Artist"')
            title, artist = (part.strip() for part in text.rsplit(" - ", 1))
            song_id = slug(f"{title} {main_artist(artist)}")
            song = songs.setdefault(song_id, Song(song_id, title, artist))
            song.duet = song.duet or bool(cat.get("duet"))
            song.pinned = spec.get("videos") or song.pinned
            song.search = spec.get("search") or song.search
            if song_id not in ids:
                ids.append(song_id)
        categories.append(
            {
                "id": slug(cat["name"]),
                "name": cat["name"],
                "description": cat.get("description", ""),
                "songs": ids,
            }
        )
    return categories, songs


# --- YouTube lookups ---------------------------------------------------------------------------


class BotCheck(Exception):
    """YouTube keeps throttling or wants a sign-in to prove we're human: stop, try again later."""


class Finder:
    def __init__(self, backups: int):
        self.backups = backups
        opts = {"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True}
        self.search_dl = YoutubeDL({**opts, "extract_flat": "in_playlist"})
        self.video_dl = YoutubeDL({**opts, "ignore_no_formats_error": True})
        # Channels whose uploads keep failing the embed check get skipped (Sing King, KaraFun…).
        self.channel_blocked: dict[str, int] = {}
        self.channel_ok: set[str] = set()
        self.strikes = 0  # throttling responses in a row

    def backoff(self, why: str) -> None:
        if self.strikes >= len(BACKOFF_SECONDS):
            raise BotCheck(why)
        wait = BACKOFF_SECONDS[self.strikes]
        self.strikes += 1
        print(f"  … YouTube is throttling ({why[:80]}); waiting {wait}s", flush=True)
        time.sleep(wait)

    def search(self, query: str) -> list[dict]:
        while True:
            try:
                info = self.search_dl.extract_info(f"ytsearch{CANDIDATES}:{query}", download=False)
                self.strikes = 0
                return [e for e in info.get("entries") or [] if e and e.get("id")]
            except DownloadError as exc:
                self.backoff(str(exc))

    def oembed_ok(self, video_id: str) -> bool:
        query = urllib.parse.urlencode({"url": f"https://www.youtube.com/watch?v={video_id}"})
        url = f"{OEMBED}?{query}&format=json"
        req = urllib.request.Request(url, headers={"User-Agent": "OpenMic songbook builder"})
        while True:
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    self.strikes = 0
                    return resp.status == 200
            except urllib.error.HTTPError as exc:
                if exc.code in (400, 401, 403, 404):
                    return False  # 401 = embedding disabled; others = private or gone
                self.backoff(f"oEmbed HTTP {exc.code}")
            except urllib.error.URLError as exc:
                self.backoff(f"oEmbed {exc.reason}")

    def details(self, video_id: str) -> dict | None:
        """Full metadata if the video can play embedded for everyone; None otherwise."""
        while True:
            try:
                d = self.video_dl.extract_info(
                    f"https://www.youtube.com/watch?v={video_id}", download=False
                )
                self.strikes = 0
                break
            except DownloadError as exc:
                message = str(exc)
                if THROTTLED.search(message):
                    self.backoff(message)
                    continue
                # Age-restricted, region-blocked, removed… Shown so silent failures can't hide.
                print(f"    skip {video_id}: {message.removeprefix('ERROR: ')[:100]}", flush=True)
                return None
        if not d.get("playable_in_embed") or d.get("age_limit"):
            return None
        if d.get("live_status") not in (None, "not_live", "was_live"):
            return None
        if d.get("availability") not in (None, "public", "unlisted"):
            return None
        return d

    def verify(self, video_id: str, channel: str = "") -> dict | None:
        if not self.oembed_ok(video_id):
            if channel:
                self.channel_blocked[channel] = self.channel_blocked.get(channel, 0) + 1
            return None
        d = self.details(video_id)
        if d and channel:
            self.channel_ok.add(channel)
        return d

    def skip_channel(self, channel: str) -> bool:
        return channel not in self.channel_ok and self.channel_blocked.get(channel, 0) >= 2

    def find(self, song: Song, keep: list[dict]) -> list[dict]:
        """Top up `keep` (already-verified videos) to `self.backups` videos for this song."""
        found = list(keep)
        have = {v["id"] for v in found}
        scored = [(score(song, e, i), e) for i, e in enumerate(self.search(song.query))]
        ranked = sorted(((p, e) for p, e in scored if p is not None), key=lambda pair: -pair[0])
        for _points, entry in ranked:
            if len(found) >= self.backups:
                break
            channel = entry.get("channel") or entry.get("uploader") or ""
            if entry["id"] in have or self.skip_channel(channel):
                continue
            d = self.verify(entry["id"], channel)
            if d:
                found.append(video_record(d))
                have.add(entry["id"])
        return found


def score(song: Song, entry: dict, rank: int) -> float | None:
    """Rank a search result for a song; None = not a usable karaoke version."""
    title = entry.get("title") or ""
    channel = entry.get("channel") or entry.get("uploader") or ""
    t = norm(title)
    words = set(t.split())
    song_words = set(tokens(f"{song.title} {song.artist}"))  # Bill Medley isn't a medley
    duration = entry.get("duration")
    if duration and not MIN_SECONDS <= duration <= MAX_SECONDS:
        return None
    if any(w in words and w not in song_words for w in REJECT_WORDS):
        return None
    if any(p in title.lower() for p in REJECT_PHRASES):
        return None
    if channel.lower().endswith(" - topic"):
        return None  # auto-generated audio uploads: a still image, no lyrics on screen

    core = re.sub(r"\([^)]*\)", " ", song.title)  # "(I've Had) The Time of My Life"
    required = [w for w in tokens(core) if w not in STOPWORDS] or tokens(core)
    if not all(w in words for w in required):
        return None
    # A custom search can name what uploads use instead of the artist ("popular wicked karaoke").
    hints = tokens(song.artist) + [w for w in tokens(song.search) if w not in song_words]
    artist_words = [w for w in hints if w not in STOPWORDS | {"karaoke"} and len(w) > 1]
    artist_hit = any(w in words for w in artist_words)
    if len(required) <= 1 and not artist_hit:
        return None  # one-word titles ("Crazy", "Hello") need the artist to match too

    c = channel.lower()
    karaoke = "karaoke" in t or "karaoke" in c or "sing along" in t or "singalong" in t
    if not karaoke and not ("instrumental" in t and "lyric" in t):
        return None  # lyric videos and official videos still have the original vocals

    points = 60.0 + (15 if artist_hit else 0) + (15 if "karaoke" in c else 0) + max(0, 10 - rank)
    points += min(25.0, 4 * math.log10((entry.get("view_count") or 0) + 1))
    if KEY_CHANGE.search(title.lower()):
        points -= 25
    if "original key" in title.lower():
        points += 5
    if "duet" in words and not song.duet:
        points -= 10
    if "acoustic" in words or "piano" in words:
        points -= 10
    if re.search(r"(?<!no )\b(lead|guide) vocals?\b|\bwith vocals?\b", title.lower()):
        points -= 40  # the original singer is still on the track
    return points


def video_record(d: dict) -> dict:
    return {
        "id": d["id"],
        "title": d.get("title") or "",
        "channel": d.get("channel") or d.get("uploader") or "",
        "duration": d.get("duration"),
    }


# --- Main --------------------------------------------------------------------------------------


def load_output() -> dict:
    if OUTPUT.exists():
        return json.loads(OUTPUT.read_text())
    return {"songs": []}


def save(categories: list[dict], songs: dict[str, Song], results: dict[str, dict]) -> None:
    out = {
        "updated": date.today().isoformat(),
        "categories": categories,
        "songs": [
            {
                "id": s.id,
                "title": s.title,
                "artist": s.artist,
                "duet": s.duet,
                "checked": results.get(s.id, {}).get("checked"),
                "videos": results.get(s.id, {}).get("videos", []),
            }
            for s in songs.values()
        ],
    }
    tmp = OUTPUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    os.replace(tmp, OUTPUT)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="re-check saved videos too")
    parser.add_argument("--refresh", action="store_true", help="search again, ignore saved videos")
    parser.add_argument("--fill", action="store_true", help="top up songs with too few backups")
    parser.add_argument("--only", help="only songs whose title or artist contains this text")
    parser.add_argument("--limit", type=int, help="stop after this many songs")
    parser.add_argument("--backups", type=int, default=3, help="videos to keep per song")
    args = parser.parse_args()

    categories, songs = load_source()
    previous = {s["id"]: s for s in load_output().get("songs", [])}
    results = {
        sid: {"videos": p.get("videos", []), "checked": p.get("checked")}
        for sid, p in previous.items()
        if sid in songs
    }
    todo = [
        s
        for s in songs.values()
        if not args.only or norm(args.only) in norm(f"{s.title} {s.artist}")
    ]
    finder = Finder(args.backups)
    today = date.today().isoformat()
    done = 0
    print(f"{len(songs)} songs in {len(categories)} categories; output: {OUTPUT.relative_to(ROOT)}")
    try:
        for song in todo:
            saved = results.get(song.id, {}).get("videos", [])
            if song.pinned:
                if not args.check and [v["id"] for v in saved] == song.pinned:
                    continue
                videos = []
                for vid in song.pinned:
                    d = finder.verify(vid)
                    if d:
                        videos.append(video_record(d))
                    else:
                        print(f"  ! pinned video {vid} for {song.title} can't play embedded")
            elif args.refresh:
                videos = finder.find(song, [])
            elif args.check and saved:
                alive = [v for v in saved if finder.oembed_ok(v["id"])]
                videos = alive if len(alive) == len(saved) else finder.find(song, alive)
            elif not saved or (args.fill and len(saved) < args.backups):
                videos = finder.find(song, saved)
            else:
                continue
            results[song.id] = {"videos": videos, "checked": today}
            save(categories, songs, results)
            done += 1
            label = f"{song.title} – {song.artist}"
            if videos:
                print(f"  ✓ {label}: " + ", ".join(v["channel"] for v in videos))
            else:
                print(f"  ✗ {label}: no playable karaoke version found")
            if args.limit and done >= args.limit:
                break
            time.sleep(random.uniform(2.0, 4.0))
    except BotCheck:
        print("\nYouTube keeps throttling us. Progress is saved; run again in an hour or so.")
        return 2
    except KeyboardInterrupt:
        print("\nStopped. Progress is saved; run again to continue.")
        return 130
    finally:
        save(categories, songs, results)

    missing = [s for s in songs.values() if not results.get(s.id, {}).get("videos")]
    print(f"\nUpdated {done} songs. {len(songs) - len(missing)}/{len(songs)} have videos.")
    if missing:
        print("No video yet (pin one with `videos:` or adjust with `search:` in songs.yaml):")
        for s in missing:
            print(f"  - {s.title} - {s.artist}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
