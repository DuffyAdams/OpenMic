#!/usr/bin/env bash
# Build the Fire TV app, install it over Wi-Fi ADB, and point it at your server.
#   ./scripts/install-firetv.sh 192.168.1.50 https://karaoke.example.com
# Enable on the TV first: Settings → My Fire TV → Developer options → ADB debugging
# (tap "About → Fire TV Cube" 7 times to reveal Developer options).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tv_ip="${1:?Usage: install-firetv.sh <fire-tv-ip> [server-url]}"
server="${2:-}"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
adb="$ANDROID_HOME/platform-tools/adb"
command -v adb >/dev/null && adb="$(command -v adb)"

(cd "$root/apps/fire-tv" && ./gradlew assembleRelease --console=plain -q ${server:+-PkaraokeServerUrl=$server})
apk=$(ls "$root"/apps/fire-tv/app/build/outputs/apk/release/*.apk | head -1)

"$adb" connect "$tv_ip:5555"
echo "If the TV asks to allow USB debugging, choose Allow (tick 'Always allow')."
"$adb" -s "$tv_ip:5555" wait-for-device
"$adb" -s "$tv_ip:5555" install -r "$apk"
"$adb" -s "$tv_ip:5555" shell am start -n com.openmic.tv/.MainActivity ${server:+--es server_url "$server"}
echo "Installed $(basename "$apk") on $tv_ip."
