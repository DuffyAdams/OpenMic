import json

import pytest

from app.songbook import BUNDLED, Songbook
from app.youtube import VIDEO_ID_RE
from tests.conftest import auth, make_settings

BOOK = {
    "categories": [
        {"id": "crowd-pleasers", "name": "Crowd Pleasers", "description": "Everybody knows it",
         "songs": ["mr-brightside-the-killers", "shallow-lady-gaga", "lost-song"]},
        {"id": "duets", "name": "Duets", "description": "", "songs": ["shallow-lady-gaga"]},
        {"id": "empty", "name": "Empty", "description": "", "songs": ["lost-song"]},
    ],
    "songs": [
        {"id": "mr-brightside-the-killers", "title": "Mr. Brightside", "artist": "The Killers",
         "duet": False, "videos": [
             {"id": "bookA000001", "title": "The Killers - Mr. Brightside (Karaoke Version)",
              "channel": "Zoom Karaoke Official", "duration": 225},
             {"id": "bookA000002", "title": "Mr. Brightside Karaoke", "channel": "Party Tyme",
              "duration": 249},
         ]},
        {"id": "shallow-lady-gaga", "title": "Shallow", "artist": "Lady Gaga & Bradley Cooper",
         "duet": True, "videos": [
             {"id": "bookB000001", "title": "Shallow (Karaoke)", "channel": "Sing2Music",
              "duration": 215},
         ]},
        {"id": "lost-song", "title": "Lost", "artist": "Nobody", "duet": False, "videos": []},
    ],
}


@pytest.fixture
def settings(tmp_path):
    path = tmp_path / "songbook.json"
    path.write_text(json.dumps(BOOK))
    # No search provider: anything that isn't in the songbook would need a network lookup.
    return make_settings(tmp_path, songbook_path=str(path), search_provider="none")


@pytest.fixture
def no_lookups(client, monkeypatch):
    async def fail(video_id):
        raise AssertionError(f"unexpected YouTube lookup for {video_id}")

    monkeypatch.setattr(client.app.state.services.youtube, "_oembed", fail)


def test_songbook_lists_playable_songs_by_category(party):
    guest = party.api.join(party.code, "Ana")
    r = party.api.c.get("/api/songbook", headers=auth(guest.token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert [c["name"] for c in body["categories"]] == ["Crowd Pleasers", "Duets"]
    assert body["categories"][0]["song_ids"] == ["mr-brightside-the-killers", "shallow-lady-gaga"]
    songs = {s["id"]: s for s in body["songs"]}
    assert set(songs) == {"mr-brightside-the-killers", "shallow-lady-gaga"}
    first = songs["mr-brightside-the-killers"]
    assert first["video"]["video_id"] == "bookA000001"
    assert first["video"]["title"] == "Mr. Brightside – The Killers"
    assert first["video"]["channel"] == "Zoom Karaoke Official"
    assert "Karaoke channel" in first["video"]["labels"]
    assert songs["shallow-lady-gaga"]["duet"] is True


def test_songbook_requires_a_party_credential(client):
    assert client.get("/api/songbook").status_code == 401


def test_queueing_a_songbook_song_needs_no_lookup(party, no_lookups):
    guest = party.api.join(party.code, "Ana")
    res = party.api.add(guest.token, party.sid, "bookA000001")
    assert res["item"]["title"] == "Mr. Brightside – The Killers"
    assert res["item"]["channel"] == "Zoom Karaoke Official"
    assert res["item"]["duration_seconds"] == 225


def test_dead_videos_fall_back_to_backups(party, client, no_lookups):
    youtube = client.app.state.services.youtube
    youtube.mark_unplayable("bookA000001")
    youtube.mark_unplayable("bookB000001")
    guest = party.api.join(party.code, "Ana")

    body = client.get("/api/songbook", headers=auth(guest.token)).json()
    songs = {s["id"]: s for s in body["songs"]}
    assert songs["mr-brightside-the-killers"]["video"]["video_id"] == "bookA000002"
    assert "shallow-lady-gaga" not in songs  # no working version left
    assert [c["name"] for c in body["categories"]] == ["Crowd Pleasers"]

    # A phone that loaded the songbook earlier still sends the dead ID; it gets the backup.
    res = party.api.add(guest.token, party.sid, "bookA000001")
    assert res["item"]["video_id"] == "bookA000002"


def test_missing_or_broken_file_means_empty_songbook(tmp_path):
    assert len(Songbook.load(tmp_path / "nope.json")) == 0
    broken = tmp_path / "broken.json"
    broken.write_text("{not json")
    book = Songbook.load(broken)
    assert len(book) == 0 and book.categories == []


def test_bundled_songbook_is_valid():
    data = json.loads(BUNDLED.read_text())
    ids = [s["id"] for s in data["songs"]]
    assert len(ids) == len(set(ids))
    for song in data["songs"]:
        assert song["title"] and song["artist"]
        for video in song["videos"]:
            assert VIDEO_ID_RE.match(video["id"]), video
    for category in data["categories"]:
        assert set(category["songs"]) <= set(ids), category["name"]
    book = Songbook.load(BUNDLED)
    assert len(book) > 0 and all(c.song_ids for c in book.categories)
