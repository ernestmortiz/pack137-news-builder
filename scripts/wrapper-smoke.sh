#!/usr/bin/env bash
# Builds the desktop app (debug, no installer) and runs tests/wrapper/smoke.mjs against it under
# a virtual display. Linux only. Needs: Rust, the webkit2gtk-4.1 dev libraries, xvfb, the WebDriver
# pieces (webkit2gtk-driver), and tauri-driver:
#   cargo install tauri-driver --version 2.1.0 --locked
# Set SKIP_BUILD=1 to reuse the app that is already built.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v tauri-driver >/dev/null || { echo "tauri-driver is missing. Run: cargo install tauri-driver --version 2.1.0 --locked" >&2; exit 2; }
command -v WebKitWebDriver >/dev/null || { echo "WebKitWebDriver is missing. Run: sudo apt-get install webkit2gtk-driver" >&2; exit 2; }
command -v xvfb-run >/dev/null || { echo "xvfb-run is missing. Run: sudo apt-get install xvfb" >&2; exit 2; }

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  npx tauri build --debug --no-bundle
fi

run_smoke() {
  xvfb-run -a --server-args="-screen 0 1400x1000x24" node tests/wrapper/smoke.mjs
}

echo "== Run 1: a computer with a Downloads folder"
run_smoke
echo
echo "== Run 2: a computer with no Downloads folder (files must go to the home folder)"
SMOKE_NO_DOWNLOADS=1 run_smoke
