# Fire TV app

Target: **Fire TV Cube (3rd gen, 2022)**, Fire OS 7 (Android 9). Works on other Fire TV / Android
TV devices running Android 7.1+. It does **not** run on newer *Vega OS* Fire TV devices, which
can't install Android APKs.

## How it works

The APK is a thin Kotlin shell (no third-party libraries, ~85 KB release build). It opens
`<server>/tv` in a WebView and:

- allows media to start without a tap (`mediaPlaybackRequiresUserGesture = false`), so the queue
  auto-advances;
- forwards every remote key to the page (`window.__tvKey('up' | 'select' | 'back' | 'menu' | …)`)
  so the page fully controls navigation — focus never gets stuck inside the YouTube iframe;
- keeps the screen awake, hides system bars, and blocks navigation away from your server;
- shows a native "Can't reach the party server" screen with auto-retry and **Change server**;
- recovers if the WebView renderer crashes;
- exposes `window.OpenMicNative` to the page: `exitApp()`, `appVersion()`, `openSettings()`,
  `reload()`.

The TV interface itself lives in the web app (`apps/web/src/routes/tv`, `src/lib/tv`). Update the
server and the TV picks up the new interface on next launch.

## Build

Requirements: JDK 17+ and the Android SDK (`ANDROID_HOME`, or `sdk.dir` in
`apps/fire-tv/local.properties`). Android Studio provides both; or install the command-line tools.

```bash
cd apps/fire-tv
./gradlew assembleDebug                      # app/build/outputs/apk/debug/openmic-tv-1.0.0-debug.apk
./gradlew assembleRelease                    # minified; signed with the debug key unless configured
./gradlew assembleRelease -PkaraokeServerUrl=https://karaoke.example.com   # skip the setup screen
./gradlew lintDebug
```

To sign releases with your own key, create `apps/fire-tv/keystore.properties` (git-ignored):

```properties
storeFile=release.jks
storePassword=…
keyAlias=openmic
keyPassword=…
```

(Create the keystore with `keytool -genkeypair -v -keystore release.jks -alias openmic
-keyalg RSA -keysize 2048 -validity 10000`.) Android only installs an update over an existing app
signed with the same key; switching keys requires uninstalling first.

## Install (sideload over Wi-Fi)

1. On the Fire TV: **Settings → My Fire TV → About**, click the device name 7 times to unlock
   Developer options. Then **My Fire TV → Developer options → ADB debugging: ON**.
2. Find the TV's IP: **Settings → My Fire TV → About → Network**.
3. From your computer (same network):

```bash
./scripts/install-firetv.sh 192.168.1.50 https://karaoke.example.com
```

The first connection shows an "Allow USB debugging?" prompt on the TV — choose **Allow**.

Manual equivalent:

```bash
adb connect 192.168.1.50:5555
adb install -r apps/fire-tv/app/build/outputs/apk/release/openmic-tv-1.0.0-release.apk
adb shell am start -n com.openmic.tv/.MainActivity --es server_url https://karaoke.example.com
```

`--es server_url …` can be sent at any time to change the server. You can also type it on the TV:
the setup screen appears on first launch, and later under **Menu → Server settings**, or **Menu**
on the "can't reach server" screen.

## First launch

1. The TV shows **Pair this TV** with a code and QR code.
2. Scan the QR code with your phone (or open `<server>/admin`), sign in with the admin password,
   confirm the code.
3. The TV opens the party lobby. Pairing is remembered; next time it goes straight to the lobby.

## Remote control

| Button | Lobby / menus | During a song |
|---|---|---|
| D-pad | Move focus | Show playback controls |
| OK (center) | Activate | Show controls (OK again on **Pause** toggles) |
| Menu (☰) | Open/close menu | Open menu (video shrinks to the left) |
| Back | Close menu / dialog; in the lobby, asks to exit | Closes overlays; never quits mid-song |
| Play/Pause | — | Pause / resume |
| Fast-forward | — | Asks to skip (Cancel is pre-selected) |
| Rewind | — | Restart the song |

Menus, banners and controls never cover the video: the video shrinks to make room for the side
panel or the bottom strip, keeping YouTube's player and branding unobstructed.

## Verified behaviour

Tested on an Android TV emulator (Android 12, WebView 91) with this APK against a live server:
first-run server setup via ADB extra, pairing, lobby rendering, Menu/Back/OK/D-pad/Play-Pause/
Fast-forward routing, real YouTube playback starting automatically after the intro countdown,
progress reporting, pause and resume from the remote, skip with confirmation, and Back not exiting
during playback. **Still to verify on the actual Cube** — see the Phase 0 checklist in
[youtube-feasibility.md](youtube-feasibility.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Can't reach the party server" | Check the URL (**Change server**). For LAN mode, the TV and server must be on the same network. |
| Songs don't start by themselves | In a desktop browser that's expected (press OK once); in the APK, open **Menu → Diagnostics** and check the player log. |
| "This video can't play here" | The uploader blocks embedded playback. The app skips it (or waits for the host); the guest gets a "pick another version" prompt. |
| App missing from the home row | Look in **Apps → Your Apps Library**; long-press to move it. |
| Debugging | Debug builds allow Chrome remote debugging: `chrome://inspect` with the TV connected over ADB. `adb logcat -s OpenMic` shows native logs. |
