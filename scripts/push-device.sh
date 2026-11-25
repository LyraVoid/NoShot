#!/usr/bin/env bash
# Push the flashable zip to a connected device (optional helper).
# Install it from the KernelSU / Magisk / APatch manager afterwards.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$(ls -t "$ROOT"/build/noshot_zygisk_v*.zip 2>/dev/null | head -1 || true)"
if [ -z "$ZIP" ]; then
    echo "no zip in build/; run scripts/build.sh first" >&2
    exit 1
fi
adb push "$ZIP" /sdcard/Download/
echo "pushed: $(basename "$ZIP") -> /sdcard/Download/"
echo "open the KernelSU/Magisk manager and install it from there"
