#!/usr/bin/env bash
# Build every Android ABI, the React WebUI and the flashable module zip.
#
#   ./scripts/build.sh            # native + web + zip
#   SKIP_WEB=1 ./scripts/build.sh # reuse the existing web/dist
#   ./scripts/build.sh --test     # also run the Zig parser tests
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ZIG="${ZIG:-zig}"
PINNED_ZIG="$(tr -d '[:space:]' < "$ROOT/.zigversion")"
ACTUAL_ZIG="$("$ZIG" version 2>/dev/null || echo unknown)"
if [ "${ALLOW_ZIG_VERSION:-0}" != "1" ] && [ "$ACTUAL_ZIG" != "$PINNED_ZIG" ]; then
    echo "!! Zig $PINNED_ZIG required (found $ACTUAL_ZIG); Zig is pre-1.0 and changes between minor releases." >&2
    echo "!! Set ALLOW_ZIG_VERSION=1 to build anyway." >&2
    exit 1
fi

VERSION="$(sed -n 's/^version=//p' module/module.prop | head -1 | tr -d '\r')"
VERSION="${VERSION#v}"
ZIP_NAME="noshot_zygisk_v${VERSION}.zip"

run_tests=0
for arg in "$@"; do
    [ "$arg" = "--test" ] && run_tests=1
done

echo "==> Zig native libraries"
"$ZIG" build
if [ "$run_tests" = "1" ]; then
    echo "==> Unit tests"
    "$ZIG" build test
fi

if [ "${SKIP_WEB:-0}" != "1" ]; then
    echo "==> WebUI (React + Mantine M3E)"
    cd web
    if [ ! -d node_modules ]; then
        npm install --no-audit --no-fund
    fi
    npm run build
    cd "$ROOT"
fi

if [ ! -f web/dist/index.html ]; then
    echo "!! web/dist/index.html missing (run without SKIP_WEB or build web/ first)" >&2
    exit 1
fi

echo "==> Stage module"
STAGE="$ROOT/build/noshot_zygisk"
rm -rf "$STAGE"
mkdir -p "$STAGE/zygisk" "$STAGE/webroot"
cp -R module/. "$STAGE/"
cp zig-out/zygisk/*.so "$STAGE/zygisk/"
cp -R web/dist/. "$STAGE/webroot/"

# Mark the reworked WebUI as such; harmless for the manager.
cat > "$STAGE/webroot/version.json" <<EOF
{"name":"NoShot WebUI","version":"$VERSION","native":"zig","ui":"react+mantine-m3e"}
EOF

chmod 755 "$STAGE/customize.sh" "$STAGE/post-fs-data.sh" "$STAGE/service.sh" "$STAGE/plan.sh"
chmod 644 "$STAGE/module.prop" "$STAGE"/webroot/* 2>/dev/null || true
chmod 755 "$STAGE/webroot" "$STAGE/zygisk"
chmod 644 "$STAGE/zygisk/"*.so "$STAGE"/config/* 2>/dev/null || true

echo "==> Package"
rm -f "$ROOT/build/$ZIP_NAME"
if command -v zip >/dev/null; then
    ( cd "$STAGE" && zip -qr "$ROOT/build/$ZIP_NAME" . -x '.*' -x '*/.*' )
else
    ( cd "$STAGE" && python3 - "$ROOT/build/$ZIP_NAME" <<'PY'
import os, sys, zipfile

with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            if f.startswith("."):
                continue
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, "."))
PY
    )
fi

echo "built: build/$ZIP_NAME"
du -h "$ROOT/build/$ZIP_NAME"
