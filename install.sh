#!/bin/bash
# Build nplay and install it to /Applications, then relaunch. macOS only.
#
#   ./install.sh               # build (release) + quit + install + relaunch
#   ./install.sh --skip-build  # reinstall the last build without rebuilding
#
# Or via npm:  npm run install:app
#
# Why this exists rather than `make install`: that target is Linux's — it drops a
# bare binary in ~/.local/bin next to a .desktop entry. On macOS that gives you
# no Info.plist, no icon, no bundle identifier and nothing Finder or the Dock
# will treat as an app. macOS wants the .app bundle, which means a full
# `tauri build` rather than the `--no-bundle` one `make build` does.
set -euo pipefail
cd "$(dirname "$0")"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "install.sh is macOS-only (installs a .app to /Applications)." >&2
  echo "On Linux use: make install" >&2
  exit 1
fi

APP_NAME="nplay.app"
BUILT="src-tauri/target/release/bundle/macos/$APP_NAME"

if [[ "${1:-}" != "--skip-build" ]]; then
  echo "--- Building nplay (release) ---"
  npm run tauri build
fi

if [[ ! -d "$BUILT" ]]; then
  echo "No built app at $BUILT — run without --skip-build first." >&2
  exit 1
fi

echo "--- Quitting running nplay (if any) ---"
osascript -e 'quit app "nplay"' 2>/dev/null || pkill -x nplay 2>/dev/null || true
sleep 1

echo "--- Installing to /Applications ---"
rm -rf "/Applications/$APP_NAME"
cp -R "$BUILT" "/Applications/$APP_NAME"

echo "--- Relaunching ---"
open "/Applications/$APP_NAME"

VER=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  "/Applications/$APP_NAME/Contents/Info.plist" 2>/dev/null || echo "?")
echo "Installed + relaunched: /Applications/$APP_NAME (v$VER)"

echo
echo "Note: this app shells out to ffmpeg and aubio. An app launched"
echo "from Finder does not inherit your shell PATH, so these are resolved by"
echo "absolute path (see src-tauri/src/tools.rs). If one is installed somewhere"
echo "unusual, set NDISC_TOOL_FFMPEG=/full/path/to/ffmpeg and relaunch."
