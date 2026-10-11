import httpx
import pytest

from app.errors import AppError
from app.youtube import (
    YouTubeService,
    extract_video_id,
    label_video,
    parse_iso_duration,
)
from tests.conftest import make_settings

VID = "dQw4w9WgXcQ"


@pytest.mark.parametrize(
    "text",
    [
        f"https://www.youtube.com/watch?v={VID}",
        f"https://youtube.com/watch?v={VID}&t=42s",
        f"https://m.youtube.com/watch?feature=share&v={VID}",
        f"https://music.youtube.com/watch?v={VID}&list=RDAMVM",
        f"https://youtu.be/{VID}",
        f"https://youtu.be/{VID}?si=AbCdEf123",
        f"youtu.be/{VID}",
        f"www.youtube.com/watch?v={VID}",
        f"https://www.youtube.com/embed/{VID}?autoplay=1",
        f"https://www.youtube-nocookie.com/embed/{VID}",
        f"https://www.youtube.com/shorts/{VID}",
        f"https://www.youtube.com/live/{VID}?feature=share",
        f"Check this one out!! https://youtu.be/{VID} so good",
        f"(https://www.youtube.com/watch?v={VID})",
    ],
)
def test_extract_video_id_supported_forms(text):
    assert extract_video_id(text) == VID


@pytest.mark.parametrize(
    "text",
    [
        "",
        "Mr Brightside karaoke",
        "https://vimeo.com/123456",
        f"https://evil.example.com/watch?v={VID}",
        f"https://youtube.com.evil.com/watch?v={VID}",
        "https://www.youtube.com/watch?v=short",
        "https://www.youtube.com/channel/UC123",
        "https://www.youtube.com/playlist?list=PL123",
        "javascript:alert(1)",
    ],
)
def test_extract_video_id_rejects(text):
    assert extract_video_id(text) is None


def test_bare_ids_only_when_allowed():
    assert extract_video_id(VID) is None
    assert extract_video_id(VID, allow_bare_id=True) == VID


@pytest.mark.parametrize(
    ("iso", "seconds"),
    [
        ("PT4M13S", 253),
        ("PT1H2M3S", 3723),
        ("PT45S", 45),
        ("PT3M", 180),
        ("P0D", None),
        ("P1DT1S", 86401),
        ("garbage", None),
        (None, None),
    ],
)
def test_parse_iso_duration(iso, seconds):
    assert parse_iso_duration(iso) == seconds


def test_labels():
    is_k, labels = label_video("Mr. Brightside (Karaoke Version) with Lyrics", "Sing King")
    assert is_k and "Karaoke" in labels and "Karaoke channel" in labels and "Lyrics" in labels
    is_k, labels = label_video("Mr. Brightside (Official Music Video)", "The Killers")
    assert not is_k and labels == []
    is_k, labels = label_video("Song - Instrumental with Backing Vocals", "Someone")
    assert is_k and "Instrumental" in labels and "Backing vocals" in labels


def test_build_query():
    assert YouTubeService.build_query("Mr  Brightside", True) == "Mr Brightside karaoke"
    assert YouTubeService.build_query("dancing queen KARAOKE", True) == "dancing queen KARAOKE"
    assert YouTubeService.build_query("dancing queen", False) == "dancing queen"


def _service(tmp_path, handler, **overrides) -> YouTubeService:
    settings = make_settings(tmp_path, **overrides)
    return YouTubeService(settings, http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_oembed_success_and_cache(tmp_path):
    calls = []

    def handler(request: httpx.Request):
        calls.append(request)
        assert request.url.host == "www.youtube.com"
        assert request.url.params["url"] == f"https://www.youtube.com/watch?v={VID}"
        return httpx.Response(
            200,
            json={
                "title": "Song &amp; Dance (Karaoke)",
                "author_name": "Sing King",
                "thumbnail_url": "https://i.ytimg.com/vi/x/hqdefault.jpg",
            },
        )

    yt = _service(tmp_path, handler, search_provider="auto", youtube_api_key="")
    assert yt.provider == "oembed" and not yt.search_enabled
    info = await yt.get_video(VID)
    assert info.title == "Song & Dance (Karaoke)" and info.is_karaoke
    await yt.get_video(VID)
    assert len(calls) == 1  # cached


@pytest.mark.parametrize(
    ("status", "reason"), [(401, "embed_disabled"), (404, "not_found"), (500, "lookup_failed")]
)
async def test_oembed_errors(tmp_path, status, reason):
    yt = _service(tmp_path, lambda r: httpx.Response(status), search_provider="none")
    with pytest.raises(AppError) as exc:
        await yt.get_video(VID)
    assert exc.value.extra["reason"] == reason


async def test_search_disabled_without_key(tmp_path):
    yt = _service(tmp_path, lambda r: httpx.Response(500), search_provider="auto")
    with pytest.raises(AppError) as exc:
        await yt.search("anything")
    assert exc.value.code == "search_unavailable"
    assert exc.value.extra["reason"] == "not_configured"


def _api_handler(request: httpx.Request):
    if request.url.path.endswith("/search"):
        assert request.url.params["videoEmbeddable"] == "true"
        assert request.url.params["q"] == "dancing queen karaoke"
        return httpx.Response(
            200,
            json={
                "items": [
                    {"id": {"videoId": v}}
                    for v in ("aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd")
                ]
            },
        )
    if request.url.path.endswith("/videos"):

        def item(vid, embeddable=True, live="none", title="Dancing Queen (Karaoke)"):
            return {
                "id": vid,
                "snippet": {
                    "title": title,
                    "channelTitle": "Sing King",
                    "liveBroadcastContent": live,
                    "thumbnails": {"medium": {"url": f"https://img/{vid}.jpg"}},
                },
                "contentDetails": {"duration": "PT3M52S"},
                "status": {"embeddable": embeddable, "privacyStatus": "public"},
            }

        return httpx.Response(
            200,
            json={
                "items": [
                    item("aaaaaaaaaaa"),
                    item("bbbbbbbbbbb", embeddable=False),
                    item("ccccccccccc", live="live"),
                    item("ddddddddddd", title="Dancing Queen &#39;76"),
                ]
            },
        )
    return httpx.Response(404)


async def test_youtube_search_filters_and_maps(tmp_path):
    yt = _service(
        tmp_path,
        _api_handler,
        search_provider="auto",
        youtube_api_key="k",
        youtube_daily_search_budget=5,
    )
    assert yt.provider == "youtube"
    results = await yt.search("dancing queen")
    assert [r.video_id for r in results] == ["aaaaaaaaaaa", "ddddddddddd"]
    assert results[0].duration_seconds == 232
    assert results[1].title == "Dancing Queen '76"
    assert yt.searches_remaining_today() == 4
    await yt.search("dancing queen")  # cached: no quota used
    assert yt.searches_remaining_today() == 4
    # metadata from search is reused when the song is queued
    assert (await yt.get_video("aaaaaaaaaaa")).title == "Dancing Queen (Karaoke)"


async def test_youtube_daily_budget(tmp_path):
    yt = _service(
        tmp_path,
        _api_handler,
        search_provider="youtube",
        youtube_api_key="k",
        youtube_daily_search_budget=0,
    )
    with pytest.raises(AppError) as exc:
        await yt.search("dancing queen")
    assert exc.value.extra["reason"] == "daily_limit"


async def test_youtube_quota_error(tmp_path):
    def handler(request):
        return httpx.Response(403, json={"error": {"errors": [{"reason": "quotaExceeded"}]}})

    yt = _service(tmp_path, handler, search_provider="youtube", youtube_api_key="k")
    with pytest.raises(AppError) as exc:
        await yt.search("dancing queen")
    assert exc.value.extra["reason"] == "quota"
