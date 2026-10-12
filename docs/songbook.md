# The songbook

The songbook is a curated list of popular karaoke songs, sorted into categories (Crowd Pleasers,
Duets, 80s, Power Ballads, …). Guests see it on the Search tab and can add a song with two taps,
without typing a search.

Every song comes with up to three karaoke videos chosen ahead of time, each checked to play
outside YouTube, which is the step where many karaoke uploads fail (see
[youtube-feasibility.md](youtube-feasibility.md)). Two things follow:

- **No quota.** Browsing the songbook or adding a song from it never calls the YouTube Data API.
  When a guest types in the search box, songbook matches appear instantly, and pressing Enter shows
  them instead of running a search. YouTube is only searched when they tap **Search YouTube**.
- **Backups.** If a video fails on the TV (removed, or embedding turned off), the server marks it
  unplayable and from then on gives guests the song's next video. A phone that still shows the old
  video gets the backup when it adds the song.

The songbook works without a YouTube API key too, so a party with no key still has about 400 songs
ready to go.

## Files

| File | What it is |
|---|---|
| `services/api/songbook/songs.yaml` | The song list and categories. Edit this one. |
| `services/api/app/songbook.json` | Generated: songs with their videos. Loaded by the server at startup. |
| `scripts/build-songbook.py` | Finds and checks videos for the songs in `songs.yaml`. |

Set `SONGBOOK_PATH` to load a different JSON file. A missing file just means no songbook.

## Adding or changing songs

1. Edit `services/api/songbook/songs.yaml`. Songs are written `Title - Artist`, and a song can be
   listed in several categories.
2. Run `make songbook`. It only looks up songs that don't have videos yet, so it's quick.
3. Check what it picked (the output lists the channels), then commit both files and restart the
   server.

To choose a video yourself, use the long form. Pinned videos are used in the order given:

```yaml
- {song: "Shallow - Lady Gaga & Bradley Cooper", videos: [VIDEO_ID, VIDEO_ID]}
```

If the script finds the wrong song or nothing at all, give it better search words:

```yaml
- {song: "Golden - HUNTR/X", search: "golden kpop demon hunters karaoke"}
```

## How the script picks videos

It searches YouTube with [yt-dlp](https://github.com/yt-dlp/yt-dlp), with no API key and no quota,
for "artist title karaoke". It then ranks results that are karaoke versions of the right song
(the title words, and the artist for one-word titles, must match). It prefers karaoke channels,
popular uploads and the original key, and skips live versions, remixes, lessons, key changes and
"Topic" audio uploads. Each candidate is checked with YouTube's oEmbed endpoint and then yt-dlp's
own playability check (embeddable, not age-restricted, not live) until three pass.

It saves after every song, so it can be stopped and restarted. A full run of about 400 songs takes
about an hour. A video that fails a check during a network hiccup is just skipped, so follow a
full run with `--fill`. If YouTube starts asking for a bot check, the script stops; run it again
later.

```bash
make songbook                                # songs without videos
make songbook ARGS=--check                   # re-check all saved videos, replace dead ones
make songbook ARGS=--fill                    # look again for songs with fewer than 3 videos
make songbook ARGS="--only brightside --refresh"   # search one song again from scratch
```

Running `--check` every month or so catches removed videos before a party does.

yt-dlp reads YouTube's website rather than the official API, which YouTube's Terms of Service
don't permit for automated access. It only runs on your own machine when you rebuild the
songbook, reads metadata only, and is never part of the server. The party itself still uses only
the official API and the IFrame player.
