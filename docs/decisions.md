# Design decisions and changes from the plan

The [original plan](../karaoke-system-development-plan.md) was followed closely. These are the
places where the build differs, and why.

## 1. TV interface: web page in a native shell, not Jetpack Compose

**Plan:** Kotlin + Jetpack Compose TV UI, with a WebView only for the YouTube player.
**Built:** a small Kotlin app whose WebView loads the TV interface (`/tv`) from the party server.

Why:
- YouTube's embedded player now expects to run on a real web origin with a valid Referer. A page
  served by your own server satisfies that without fragile `loadDataWithBaseURL` tricks.
- One UI codebase and design system for phones and TV; TV interface updates ship with the server,
  no APK reinstall.
- The whole TV experience can be tested in a desktop browser and in automated browser tests
  (`/tv?player=fake`), which is how it was verified here.
- The native shell still does everything only native code can: autoplay without a tap, full
  remote-key routing (including Back, Menu and media keys), keep-awake, offline/retry screen,
  first-run server setup, renderer-crash recovery.

## 2. Database: PostgreSQL in production, SQLite elsewhere

PostgreSQL remains the production database (Docker Compose). The same code also runs on SQLite,
used for development, tests and the no-Docker home-network mode (`scripts/lan.sh`). The test suite
passes on both (`TEST_DATABASE_URL` selects Postgres).

## 3. One `caddy` service serves the web app

**Plan:** `api`, `web`, `postgres`, `caddy`. **Built:** the web app is compiled to static files and
baked into the Caddy image, so there's no Node process in production. Added a `backup` service.

## 4. Host access

**Plan:** "host pairing with a secure code or host login." **Built:** both, plus a third path:
- **Admin password** at `/admin` — pairs TVs, opens host controls for any party.
- **TV pairing code** — a new TV shows a code/QR; the admin approves it once.
- **Host invite from the TV menu** — a 15-minute QR code only visible to whoever holds the remote,
  so a friend can run the party without the admin password.

Hosts are participants with `role=host`, so they can queue their own songs too. The host controls
live in a **Host** tab of the same phone app guests use.

## 5. Playback state is declarative

Pause/resume and restart are fields in the party snapshot (`paused`, `restart_seq`) that the TV
reconciles, rather than fire-and-forget commands. A TV that reconnects or restarts converges on
the correct state automatically. Skip carries `expected_item_id` so racing commands can't skip two
songs. (Plan §5's edge cases are all covered by tests.)

## 6. Every broadcast is a full snapshot

Instead of deltas plus "request a snapshot when you miss one," the server always sends the whole
(small) party state with a version number. Clients keep the newest. Simpler and impossible to
desynchronise.

## 7. Search without an API key

Without `YOUTUBE_API_KEY`, pasted links are validated via YouTube's oEmbed endpoint (no key, no
quota), and the guest search tab becomes a guided "find it on YouTube → Share → Copy link → paste"
flow. This makes the system usable on day one.

## 8. Additions beyond the plan

- **Wait-time estimates** on each queued song and "You're up next!" / "You're on!" phone alerts
  (with vibration on Android).
- **"Find another version"** prompt when a guest's video fails; **"Sing again"** for past songs.
- **Up-next reminder** on the TV 35 seconds before a song ends.
- **Auto-skip broken videos** (default on; host can switch to "wait for me").
- **Karaoke labels** on results (karaoke channel, lyrics, instrumental) and a warning when a
  result looks like the original track with vocals.
- **"Already in queue"** hint for duplicate picks.
- **Resume after TV restart** at the last reported position.
- **Idle parties auto-end** after 12 hours; the TV opens a fresh lobby 60 s after a party ends.
- **Diagnostics panel** in the TV menu (connection, player state, event log) for Phase 0 testing.
- **Nightly database backups** with retention, plus backup/restore scripts.

## 9. Not built (non-goals or later)

Per the plan's non-goals: no native phone apps, no vocal removal/scoring/recording, no YouTube
downloading, no ad blocking, no licensed local media library (Media3) yet, and the system needs the
server to be reachable (cloud or home network). A "fair rotation" queue mode was considered but
the plan specifies strict FIFO; hosts can reorder manually.
