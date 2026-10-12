from fastapi import APIRouter, Depends, Query

from app.deps import Auth, Services, current_auth, get_services
from app.errors import AppError
from app.schemas import (
    ResolveResponse,
    SearchResponse,
    SongbookCategoryOut,
    SongbookResponse,
    SongbookSongOut,
    VideoOut,
)
from app.youtube import VideoInfo, extract_video_id

router = APIRouter(prefix="/api", tags=["search"])


def video_out(info: VideoInfo) -> VideoOut:
    return VideoOut(
        video_id=info.video_id,
        title=info.title,
        channel=info.channel,
        thumbnail_url=info.thumbnail_url,
        duration_seconds=info.duration_seconds,
        is_karaoke=info.is_karaoke,
        labels=info.labels,
    )


def _limit_key(auth: Auth) -> str:
    if auth.participant:
        return auth.participant.id
    if auth.device:
        return auth.device.id
    return "admin"


@router.get("/search", response_model=SearchResponse)
async def search(
    q: str = Query(min_length=1, max_length=120),
    karaoke: bool = True,
    auth: Auth = Depends(current_auth),
    services: Services = Depends(get_services),
):
    """Search YouTube (requires a party credential so strangers can't burn the API quota)."""
    # A pasted link in the search box resolves directly, costing no search quota.
    video_id = extract_video_id(q)
    if video_id:
        services.limits.resolve.check(_limit_key(auth))
        info = await services.youtube.get_video(video_id)
        return SearchResponse(query=q, results=[video_out(info)])
    services.limits.search.check(_limit_key(auth))
    results = await services.youtube.search(q, karaoke=karaoke)
    return SearchResponse(
        query=services.youtube.build_query(q, karaoke),
        results=[video_out(r) for r in results],
        searches_remaining_today=services.youtube.searches_remaining_today(),
    )


@router.get("/videos/resolve", response_model=ResolveResponse)
async def resolve(
    input: str = Query(min_length=1, max_length=500),
    auth: Auth = Depends(current_auth),
    services: Services = Depends(get_services),
):
    """Validate a pasted YouTube link (or bare video ID) and return its metadata."""
    services.limits.resolve.check(_limit_key(auth))
    video_id = extract_video_id(input, allow_bare_id=True)
    if not video_id:
        raise AppError(
            422,
            "invalid_url",
            "That doesn't look like a YouTube video link. "
            "Copy the link from YouTube's Share button.",
        )
    info = await services.youtube.get_video(video_id)
    return ResolveResponse(video=video_out(info))


@router.get("/songbook", response_model=SongbookResponse)
async def songbook(
    _auth: Auth = Depends(current_auth),
    services: Services = Depends(get_services),
):
    """Curated songs by category, each with a ready-to-queue video. Costs no search quota."""
    book = services.songbook
    songs: list[SongbookSongOut] = []
    for song in book.songs.values():
        video = book.pick(song, services.youtube.is_unplayable)
        info = video and book.video_info(video.video_id)
        if info:
            songs.append(
                SongbookSongOut(
                    id=song.id,
                    title=song.title,
                    artist=song.artist,
                    duet=song.duet,
                    video=video_out(info),
                )
            )
    available = {s.id for s in songs}
    categories = [
        SongbookCategoryOut(
            id=c.id,
            name=c.name,
            description=c.description,
            song_ids=ids,
        )
        for c in book.categories
        if (ids := [i for i in c.song_ids if i in available])
    ]
    return SongbookResponse(categories=categories, songs=songs)
