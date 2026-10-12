"""The songbook: curated songs guests can browse, each with pre-chosen karaoke videos.

Built offline by scripts/build-songbook.py from songbook/songs.yaml into app/songbook.json. Adding a
songbook song never costs search quota, and its metadata comes from the file, so queueing one needs
no YouTube lookup either. Each song carries backup videos: whichever is first and not reported
unplayable by a TV is the one guests get.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from app.youtube import VIDEO_ID_RE, VideoInfo

log = logging.getLogger(__name__)

BUNDLED = Path(__file__).resolve().parent / "songbook.json"


@dataclass(frozen=True)
class SongbookVideo:
    video_id: str
    title: str  # the upload's own title, used for karaoke labels
    channel: str
    duration_seconds: int | None


@dataclass(frozen=True)
class Song:
    id: str
    title: str
    artist: str
    duet: bool
    videos: tuple[SongbookVideo, ...]

    @property
    def display_title(self) -> str:
        return f"{self.title} – {self.artist}"


@dataclass(frozen=True)
class Category:
    id: str
    name: str
    description: str
    song_ids: tuple[str, ...]


class Songbook:
    def __init__(self, categories: list[Category], songs: list[Song]):
        self.songs = {s.id: s for s in songs if s.videos}
        self.categories = [
            Category(c.id, c.name, c.description, ids)
            for c in categories
            if (ids := tuple(i for i in c.song_ids if i in self.songs))
        ]
        self._by_video = {v.video_id: s for s in self.songs.values() for v in s.videos}

    @classmethod
    def load(cls, path: str | Path = "") -> Songbook:
        """Read a songbook file. A missing or broken file means an empty songbook, not a crash."""
        path = Path(path or BUNDLED)
        try:
            data = json.loads(path.read_text())
            return cls.from_dict(data)
        except FileNotFoundError:
            log.info("no songbook at %s", path)
        except (ValueError, KeyError, TypeError) as exc:
            log.warning("songbook %s is invalid: %s", path, exc)
        return cls([], [])

    @classmethod
    def from_dict(cls, data: dict) -> Songbook:
        songs = [
            Song(
                id=s["id"],
                title=s["title"],
                artist=s["artist"],
                duet=bool(s.get("duet")),
                videos=tuple(
                    SongbookVideo(
                        v["id"], v.get("title", ""), v.get("channel", ""), v.get("duration")
                    )
                    for v in s.get("videos", [])
                    if VIDEO_ID_RE.match(v.get("id", ""))
                ),
            )
            for s in data.get("songs", [])
        ]
        categories = [
            Category(c["id"], c["name"], c.get("description", ""), tuple(c.get("songs", [])))
            for c in data.get("categories", [])
        ]
        return cls(categories, songs)

    def __len__(self) -> int:
        return len(self.songs)

    def pick(self, song: Song, is_unplayable: Callable[[str], bool]) -> SongbookVideo | None:
        """The song's first video that no TV has reported as unplayable."""
        return next((v for v in song.videos if not is_unplayable(v.video_id)), None)

    def substitute(self, video_id: str, is_unplayable: Callable[[str], bool]) -> str:
        """Swap a dead songbook video for the same song's next working backup.

        Phones load the songbook once, so a guest may pick a video that failed on the TV since.
        Video IDs that aren't in the songbook pass through unchanged.
        """
        song = self._by_video.get(video_id)
        if song is None or not is_unplayable(video_id):
            return video_id
        backup = self.pick(song, is_unplayable)
        return backup.video_id if backup else video_id

    def video_info(self, video_id: str) -> VideoInfo | None:
        song = self._by_video.get(video_id)
        if song is None:
            return None
        video = next(v for v in song.videos if v.video_id == video_id)
        info = VideoInfo.build(
            video_id, video.title, video.channel, duration_seconds=video.duration_seconds
        )
        info.title = song.display_title
        return info
