"""YouTube discovery: URL parsing, search, and metadata lookup.

Policy boundaries (see docs/youtube-feasibility.md):
* Only metadata is fetched (YouTube Data API / oEmbed). Audiovisual content is never downloaded,
  proxied or cached; the TV streams directly through the official IFrame player.
* Pasted links are parsed locally into a video ID. We never fetch the URL the user pasted; the
  oEmbed request is built from the validated ID.
* API responses are cached in memory for a short time only.
"""

from __future__ import annotations

import hashlib
import html
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from urllib.parse import parse_qs, quote, urlparse

import httpx

from app.config import Settings
from app.errors import AppError

if TYPE_CHECKING:
    from app.songbook import Songbook

log = logging.getLogger(__name__)

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_URL_IN_TEXT_RE = re.compile(
    r"(?:https?://)?(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/\S*",
    re.IGNORECASE,
)
YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}
_PATH_ID_PREFIXES = {"embed", "shorts", "live", "v", "e"}
_ISO_DURATION_RE = re.compile(
    r"^P(?:(?P<d>\d+)D)?(?:T(?:(?P<h>\d+)H)?(?:(?P<m>\d+)M)?(?:(?P<s>\d+)S)?)?$"
)

KARAOKE_CHANNELS = {
    "sing king",
    "karafun",
    "karafun karaoke",
    "stingray karaoke",
    "karaoke version",
    "zzang karaoke",
    "cc karaoke",
    "party tyme karaoke",
    "musisi karaoke",
    "atomic karaoke",
    "global karaoke",
    "songjam: official karaoke",
    "the karaoke channel",
    "sing2music",
    "karaoke hits",
    "lugn",
}


def extract_video_id(text: str, *, allow_bare_id: bool = False) -> str | None:
    """Return the 11-character video ID from a supported YouTube URL (or None).

    Accepts watch, youtu.be, embed, shorts, live, music and nocookie links, with or without a
    scheme, optionally surrounded by other text (e.g. a shared message).
    """
    text = (text or "").strip()
    if not text:
        return None
    if allow_bare_id and VIDEO_ID_RE.match(text):
        return text

    match = _URL_IN_TEXT_RE.search(text)
    if not match:
        return None
    url = match.group(0).rstrip(").,!?'\">")
    if not url.lower().startswith(("http://", "https://")):
        url = "https://" + url
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    host = (parsed.hostname or "").lower()
    if host not in YOUTUBE_HOSTS:
        return None

    candidate: str | None = None
    parts = [p for p in parsed.path.split("/") if p]
    if host.endswith("youtu.be"):
        candidate = parts[0] if parts else None
    elif parts[:1] == ["watch"]:
        candidate = parse_qs(parsed.query).get("v", [None])[0]
    elif len(parts) >= 2 and parts[0] in _PATH_ID_PREFIXES:
        candidate = parts[1]

    if candidate and VIDEO_ID_RE.match(candidate):
        return candidate
    return None


def parse_iso_duration(value: str | None) -> int | None:
    if not value:
        return None
    m = _ISO_DURATION_RE.match(value)
    if not m:
        return None
    parts = {k: int(v) if v else 0 for k, v in m.groupdict().items()}
    total = parts["d"] * 86400 + parts["h"] * 3600 + parts["m"] * 60 + parts["s"]
    return total or None


def label_video(title: str, channel: str) -> tuple[bool, list[str]]:
    """Heuristic "karaoke-version context" for a result."""
    t = title.lower()
    c = channel.lower()
    labels: list[str] = []
    karaoke_channel = c in KARAOKE_CHANNELS or "karaoke" in c
    is_karaoke = karaoke_channel or "karaoke" in t or "sing along" in t or "sing-along" in t
    if is_karaoke:
        labels.append("Karaoke")
    if karaoke_channel:
        labels.append("Karaoke channel")
    if "instrumental" in t or "backing track" in t or "no vocal" in t or "without vocal" in t:
        labels.append("Instrumental")
        is_karaoke = True
    if "backing vocal" in t:
        labels.append("Backing vocals")
    if "lyric" in t:
        labels.append("Lyrics")
    if "duet" in t:
        labels.append("Duet")
    return is_karaoke, labels


@dataclass
class VideoInfo:
    video_id: str
    title: str
    channel: str
    thumbnail_url: str
    duration_seconds: int | None = None
    embeddable: bool = True
    is_karaoke: bool = False
    labels: list[str] = field(default_factory=list)

    @classmethod
    def build(cls, video_id: str, title: str, channel: str, thumbnail_url: str = "", **kw):
        title = html.unescape(title or "").strip()[:200] or "Untitled video"
        channel = html.unescape(channel or "").strip()[:120]
        is_karaoke, labels = label_video(title, channel)
        thumb = thumbnail_url or f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"
        return cls(video_id, title, channel, thumb, is_karaoke=is_karaoke, labels=labels, **kw)


class _TTLCache:
    def __init__(self, ttl_seconds: float, max_items: int = 2000):
        self.ttl = ttl_seconds
        self.max_items = max_items
        self._data: dict[Any, tuple[float, Any]] = {}

    def get(self, key):
        hit = self._data.get(key)
        if not hit:
            return None
        expires, value = hit
        if time.monotonic() > expires:
            self._data.pop(key, None)
            return None
        return value

    def set(self, key, value) -> None:
        if len(self._data) >= self.max_items:
            now = time.monotonic()
            for k in [k for k, (exp, _) in self._data.items() if exp < now]:
                del self._data[k]
            if len(self._data) >= self.max_items:
                self._data.pop(next(iter(self._data)))
        self._data[key] = (time.monotonic() + self.ttl, value)

    def clear(self) -> None:
        self._data.clear()


def search_unavailable(reason: str, message: str) -> AppError:
    return AppError(503, "search_unavailable", message, reason=reason)


def video_unavailable(reason: str, message: str, status: int = 422) -> AppError:
    return AppError(status, "video_unavailable", message, reason=reason)


class YouTubeService:
    API = "https://www.googleapis.com/youtube/v3"
    OEMBED = "https://www.youtube.com/oembed"

    def __init__(
        self,
        settings: Settings,
        http: httpx.AsyncClient | None = None,
        songbook: Songbook | None = None,
    ):
        self.settings = settings
        self.songbook = songbook
        self.provider = self._pick_provider(settings)
        self._http = http or httpx.AsyncClient(
            timeout=httpx.Timeout(8.0, connect=4.0),
            headers={"User-Agent": "OpenMic/1.0 (+metadata lookup)"},
        )
        self._search_cache = _TTLCache(settings.search_cache_ttl_seconds)
        self._video_cache = _TTLCache(settings.search_cache_ttl_seconds, max_items=5000)
        self._budget_day: str | None = None
        self._budget_used = 0
        # Videos the TV reported as unplayable (embedding blocked, removed). Hidden from search
        # results and refused when queued, so guests don't keep picking the same dead ends.
        self._unplayable: set[str] = set()

    @staticmethod
    def _pick_provider(settings: Settings) -> str:
        choice = settings.search_provider.lower()
        if choice == "auto":
            return "youtube" if settings.youtube_api_key else "oembed"
        if choice == "youtube" and not settings.youtube_api_key:
            log.warning("SEARCH_PROVIDER=youtube but YOUTUBE_API_KEY is empty; search disabled")
            return "oembed"
        if choice == "none":
            return "oembed"
        return choice  # youtube | mock

    @property
    def search_enabled(self) -> bool:
        return self.provider in ("youtube", "mock")

    def searches_remaining_today(self) -> int | None:
        if self.provider != "youtube":
            return None
        self._roll_budget()
        return max(0, self.settings.youtube_daily_search_budget - self._budget_used)

    async def close(self) -> None:
        await self._http.aclose()

    def remember(self, info: VideoInfo) -> None:
        self._video_cache.set(info.video_id, info)

    def mark_unplayable(self, video_id: str) -> None:
        self._unplayable.add(video_id)

    def is_unplayable(self, video_id: str) -> bool:
        return video_id in self._unplayable

    # --- Search -----------------------------------------------------------------------------

    @staticmethod
    def build_query(query: str, karaoke: bool) -> str:
        q = " ".join(query.split())[:100]
        if karaoke and "karaoke" not in q.lower():
            q = f"{q} karaoke"
        return q

    async def search(self, query: str, karaoke: bool = True) -> list[VideoInfo]:
        q = self.build_query(query, karaoke)
        if not q:
            return []
        if not self.search_enabled:
            raise search_unavailable(
                "not_configured",
                "Search isn't set up on this server yet. Paste a YouTube link instead.",
            )
        key = (q.lower(), self.settings.youtube_region_code)
        results = self._search_cache.get(key)
        if results is None:
            if self.provider == "mock":
                results = self._mock_search(q)
            else:
                results = await self._youtube_search(q)
            for info in results:
                self.remember(info)
            self._search_cache.set(key, results)
        return [r for r in results if r.video_id not in self._unplayable]

    def _roll_budget(self) -> None:
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        if today != self._budget_day:
            self._budget_day = today
            self._budget_used = 0

    async def _youtube_search(self, q: str) -> list[VideoInfo]:
        self._roll_budget()
        if self._budget_used >= self.settings.youtube_daily_search_budget:
            raise search_unavailable(
                "daily_limit",
                "We've hit today's search limit. Paste a YouTube link instead.",
            )
        params = {
            "part": "snippet",
            "q": q,
            "type": "video",
            "maxResults": 15,
            "videoEmbeddable": "true",
            "videoSyndicated": "true",
            "key": self.settings.youtube_api_key,
        }
        if self.settings.youtube_region_code:
            params["regionCode"] = self.settings.youtube_region_code
        self._budget_used += 1
        data = await self._api_get("search", params)
        ids = [
            item["id"]["videoId"]
            for item in data.get("items", [])
            if item.get("id", {}).get("videoId")
        ]
        if not ids:
            return []
        details = await self._videos_list(ids)
        return [details[i] for i in ids if i in details]

    async def _videos_list(self, ids: list[str]) -> dict[str, VideoInfo]:
        data = await self._api_get(
            "videos",
            {
                "part": "snippet,contentDetails,status",
                "id": ",".join(ids),
                "key": self.settings.youtube_api_key,
            },
        )
        region = self.settings.youtube_region_code.upper()
        out: dict[str, VideoInfo] = {}
        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            status = item.get("status", {})
            details = item.get("contentDetails", {})
            if snippet.get("liveBroadcastContent") in ("live", "upcoming"):
                continue
            if not status.get("embeddable", True) or status.get("privacyStatus") == "private":
                continue
            restriction = details.get("regionRestriction") or {}
            if region and (
                region in restriction.get("blocked", [])
                or ("allowed" in restriction and region not in restriction["allowed"])
            ):
                continue
            thumbs = snippet.get("thumbnails", {})
            thumb = (thumbs.get("medium") or thumbs.get("high") or thumbs.get("default") or {}).get(
                "url", ""
            )
            out[item["id"]] = VideoInfo.build(
                item["id"],
                snippet.get("title", ""),
                snippet.get("channelTitle", ""),
                thumb,
                duration_seconds=parse_iso_duration(details.get("duration")),
            )
        return out

    async def _api_get(self, endpoint: str, params: dict) -> dict:
        try:
            resp = await self._http.get(f"{self.API}/{endpoint}", params=params)
        except httpx.HTTPError as exc:
            log.warning("youtube api network error: %s", type(exc).__name__)
            raise search_unavailable("network", "YouTube search is unreachable right now.") from exc
        if resp.status_code == 200:
            return resp.json()
        reason = ""
        try:
            reason = resp.json()["error"]["errors"][0]["reason"]
        except (ValueError, KeyError, IndexError, TypeError):
            pass
        log.warning("youtube api error status=%s reason=%s", resp.status_code, reason)
        if reason in ("quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"):
            raise search_unavailable(
                "quota", "YouTube's daily search quota is used up. Paste a YouTube link instead."
            )
        if reason in ("keyInvalid", "accessNotConfigured", "forbidden", "ipRefererBlocked"):
            raise search_unavailable(
                "misconfigured", "YouTube search is misconfigured on the server."
            )
        raise search_unavailable("upstream", "YouTube search failed. Please try again.")

    # --- Single-video lookup ----------------------------------------------------------------

    async def get_video(self, video_id: str) -> VideoInfo:
        if not VIDEO_ID_RE.match(video_id or ""):
            raise AppError(422, "invalid_video", "That isn't a valid YouTube video.")
        if video_id in self._unplayable:
            raise video_unavailable(
                "embed_disabled",
                "This video already failed on the TV — the uploader blocks playback outside "
                "YouTube. Try another version.",
            )
        if self.songbook and (known := self.songbook.video_info(video_id)):
            return known  # checked when the songbook was built; no lookup needed
        cached = self._video_cache.get(video_id)
        if cached is not None:
            return cached

        if self.provider == "mock":
            info = self._mock_video(video_id)
        elif self.provider == "youtube":
            try:
                details = await self._videos_list([video_id])
            except AppError:
                info = await self._oembed(video_id)  # quota trouble: fall back to oEmbed
            else:
                if video_id not in details:
                    raise video_unavailable(
                        "unavailable",
                        "That video can't be played here (private, removed, live, or "
                        "embedding disabled). Try another version.",
                    )
                info = details[video_id]
        else:
            info = await self._oembed(video_id)
        self.remember(info)
        return info

    async def _oembed(self, video_id: str) -> VideoInfo:
        try:
            resp = await self._http.get(
                self.OEMBED,
                params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
            )
        except httpx.HTTPError as exc:
            raise video_unavailable(
                "lookup_failed", "Couldn't reach YouTube to check that video.", status=502
            ) from exc
        if resp.status_code == 200:
            data = resp.json()
            return VideoInfo.build(
                video_id,
                data.get("title", ""),
                data.get("author_name", ""),
                data.get("thumbnail_url", ""),
            )
        if resp.status_code == 401:
            raise video_unavailable(
                "embed_disabled",
                "The uploader doesn't allow this video to play outside YouTube. "
                "Try another version.",
            )
        if resp.status_code in (400, 403, 404):
            raise video_unavailable("not_found", "That video is private or no longer exists.")
        raise video_unavailable(
            "lookup_failed", "Couldn't check that video right now. Try again.", status=502
        )

    # --- Mock provider (tests, offline demos) -----------------------------------------------

    @staticmethod
    def _mock_thumbnail(video_id: str) -> str:
        """A small inline placeholder image: fake IDs have no real YouTube thumbnail."""
        hue = int(hashlib.sha256(video_id.encode()).hexdigest()[:4], 16) % 360
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'>"
            f"<rect width='16' height='9' fill='hsl({hue},38%,26%)'/>"
            f"<circle cx='8' cy='4.5' r='2.2' fill='hsl({(hue + 40) % 360},55%,68%)'/></svg>"
        )
        return "data:image/svg+xml," + quote(svg, safe="=:/',() ")

    @staticmethod
    def _mock_id(seed: str) -> str:
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
        digest = hashlib.sha256(seed.encode()).digest()
        return "".join(alphabet[b % 64] for b in digest[:11])

    def _mock_search(self, q: str) -> list[VideoInfo]:
        base = q.replace(" karaoke", "").strip().title() or "Song"
        styles = [
            ("Karaoke Version", "Sing King"),
            ("Karaoke with Lyrics", "KaraFun"),
            ("Instrumental with Backing Vocals", "Stingray Karaoke"),
            ("Official Music Video", "Artist Channel"),
            ("Lower Key Karaoke", "ZZang KARAOKE"),
            ("Acoustic Karaoke", "Karaoke Hits"),
        ]
        return [
            VideoInfo.build(
                vid,
                f"{base} ({style})",
                channel,
                self._mock_thumbnail(vid),
                duration_seconds=180 + i * 17,
            )
            for i, (style, channel) in enumerate(styles)
            for vid in [self._mock_id(f"{q}:{i}")]
        ]

    def _mock_video(self, video_id: str) -> VideoInfo:
        lowered = video_id.lower()
        if lowered.startswith("blocked"):
            raise video_unavailable("embed_disabled", "The uploader doesn't allow embedding.")
        if lowered.startswith("missing"):
            raise video_unavailable("not_found", "That video is private or no longer exists.")
        return VideoInfo.build(
            video_id,
            f"Test Song {video_id}",
            "Mock Karaoke",
            self._mock_thumbnail(video_id),
            duration_seconds=200,
        )
