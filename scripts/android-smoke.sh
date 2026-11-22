#!/usr/bin/env bash
# Runs tests/wrapper/android-smoke.mjs against the app on a running Android emulator. The emulator
# must already be booted (in CI, reactivecircus/android-emulator-runner does that and then calls
# this script). Needs adb and Node 22, and `npm run build` to have run (the test compares the
# page's policy with dist/index.html).
#
#   scripts/android-smoke.sh path/to/x86_64-debug.apk
set -euo pipefail
cd "$(dirname "$0")/.."

apk="${1:?Usage: scripts/android-smoke.sh path/to/x86_64-debug.apk}"
[ -f "${apk}" ] || { echo "No such APK: ${apk}" >&2; exit 2; }
command -v adb >/dev/null || { echo "adb is missing. Put the Android SDK platform-tools on PATH." >&2; exit 2; }
[ -f dist/index.html ] || { echo "dist/index.html is missing. Run: npm run build" >&2; exit 2; }

adb wait-for-device
adb devices -l
# Boot is finished when the package manager answers.
until adb shell pm path android >/dev/null 2>&1; do sleep 2; done

exec node tests/wrapper/android-smoke.mjs "${apk}"
