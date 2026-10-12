# YouTube playback: feasibility, findings and policy

## Approach

- **Discovery:** YouTube Data API v3 on the server (`search.list` with `type=video`,
  `videoEmbeddable=true`, `videoSyndicated=true`, then `videos.list` for duration, embeddability,
  live status and region restrictions). Without an API key, pasted links are validated with
  YouTube's public oEmbed endpoint.
- **Playback:** the official **YouTube IFrame Player API**, on the TV page served from the party
  server's own origin, inside the Fire TV app's WebView.
- **Nothing is downloaded, cached or proxied.** The server only handles metadata.

## Findings from testing (October 2026)

1. **Many karaoke uploads block embedding.** Sampling popular karaoke results, roughly half
   returned "embedding disabled" (oEmbed `401`; player error `150`). Major-label official music
   videos are often allowed on websites but still fail in embedded/app playback.
   **Mitigations built in:** search requests only embeddable videos; pasted links are checked
   before they're queued (the guest sees "The uploader doesn't allow this video to play outside
   YouTube. Try another version."); anything that still fails at play time is auto-skipped (or
   waits for the host) and the requester's phone offers **Find another version**.
2. **Autoplay in the APK works.** On an Android TV emulator (WebView 91), videos started on their
   own after the up-next countdown, and auto-advance needed no button presses. In a regular
   desktop browser, sound autoplay needs one interaction: the TV page asks for an OK press when a
   song doesn't start within 12 seconds.
3. **The player should come from a real web origin.** YouTube has been rejecting embeds that lack
   a valid Referer/origin (player errors 152/153). Serving `/tv` from the party server avoids the
   `loadDataWithBaseURL` workarounds common in WebView apps. Caddy sends
   `Referrer-Policy: strict-origin-when-cross-origin` so the origin is always included.
4. **Player error codes** reported by the TV: `2` invalid ID · `5` HTML5 player error ·
   `100` removed/private · `101`/`150` embedding disabled · `152`/`153` player configuration ·
   `timeout` (didn't start within 90 s). They appear in **Menu → Diagnostics** and in the
   `playback_events` audit table.

## Phase 0 checklist — run on the actual Fire TV Cube

| # | Test | How | Expected |
|---|---|---|---|
| 1 | Install and launch | `./scripts/install-firetv.sh <ip> <server>` | App opens, shows pairing code |
| 2 | Pair | Scan QR, sign in, confirm | Lobby with join QR |
| 3 | Embedded playback | Queue a known-embeddable karaoke video, press **Start the party** | Intro card, then video plays with sound |
| 4 | Auto-advance | Queue 3–5 songs, let them play (or skip near the end) | Each starts by itself after its intro |
| 5 | Pause / resume | Remote Play/Pause, and host phone | Video pauses/resumes; phones show "Paused" |
| 6 | Blocked video | Paste a link to an embed-disabled video | Rejected on the phone before queueing |
| 7 | Failure at play time | (If any queued video fails) | Banner, auto-skip, requester notified |
| 8 | Audio path | Play a song with mics live | TV audio reaches the external mixer/speakers |
| 9 | Reconnect | Unplug the router for 30 s mid-song | Song keeps playing; "Reconnecting…" strip; queue catches up |
| 10 | TV restart | Home button, reopen the app (or power-cycle) | Resumes the current song near where it was |
| 11 | Long session | 2+ hours of continuous play | No slowdown, no stuck screens |
| 12 | Ads | Note any pre-roll ads | Ads play in the player (they can't be removed); queue continues afterwards |

**Go/no-go:** if 3 and 4 don't hold on the Cube, revisit the playback approach before relying on
it for a party. Record results and any error codes from **Menu → Diagnostics**.

## Policy boundaries

Followed by design (see the [YouTube API Services policies](https://developers.google.com/youtube/terms/developer-policies)):

- No downloading, caching or re-hosting of audiovisual content; no ad blocking or skipping.
- The player is never covered: TV menus, banners and controls take space beside or below the
  video, which shrinks to make room. Singer announcements appear between songs.
- YouTube's own player controls and branding stay visible (`controls=1`); videos are credited
  with the channel name and "on YouTube" on the intro card.
- API data is cached briefly (search results and metadata for one hour by default) and only
  in memory.
- The API key never leaves the server.

## Quota

Default quota is 10,000 units/day. A search costs ~101 units (`search.list` 100 + `videos.list`
1); a pasted-link lookup costs 1 (or 0 via oEmbed). The server stops searching at
`YOUTUBE_DAILY_SEARCH_BUDGET` (default 90) and tells guests to paste links instead; identical
searches within an hour reuse the cached result. Check usage in the Google Cloud console.

The [songbook](songbook.md) uses no quota: its videos are chosen and checked offline, and adding
one needs no lookup. Typed searches show songbook matches first and only call the API when the
guest taps **Search YouTube**.
