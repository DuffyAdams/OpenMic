#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
output=$(mktemp -d "${TMPDIR:?Set TMPDIR to a private scratch directory}/openmic-tv-test.XXXXXX")
trap 'rm -rf "$output"' EXIT
kotlinc app/src/main/java/com/openmic/tv/ServerConfig.kt tests/ServerConfigTest.kt tests/stubs/*.kt -include-runtime -d "$output/test.jar"
java -jar "$output/test.jar"
