#!/system/bin/sh
# Some ROMs skip post-fs-data; re-check the directory and permissions here.
CONF_DIR=/data/adb/noshot_zygisk
CONF_FILE=$CONF_DIR/allow.list
SETTINGS_FILE=$CONF_DIR/settings.conf

[ -d "$CONF_DIR" ] || mkdir -p "$CONF_DIR"
[ -f "$CONF_FILE" ] || printf '# noshot:1:0\n' > "$CONF_FILE"
[ -f "$SETTINGS_FILE" ] || {
    printf '# noshot settings v1\nflag_secure=1\nsurface_secure=1\ndetect_guard=1\nlog=1\n' > "$SETTINGS_FILE"
}
chmod 0644 "$CONF_FILE" "$SETTINGS_FILE" 2>/dev/null

# Keep module.prop's description in sync with the runtime state.
MODULE_DIR=/data/adb/modules/noshot_zygisk
PROP="$MODULE_DIR/module.prop"
BASE="Per-app FLAG_SECURE remover - binder-level clear, no ART hooks"
if [ -f "$PROP" ]; then
    if grep -Eq '^description=' "$PROP"; then
        if [ -e "$MODULE_DIR/disable" ] || [ -e "$MODULE_DIR/remove" ]; then
            state="⛔ disabled"
        elif pidof zygiskd64 >/dev/null 2>&1 || pidof zygiskd32 >/dev/null 2>&1; then
            if logcat -d -s NoShot 2>/dev/null | grep -q 'module loaded pid='; then
                state="✅ active"
            else
                state="🟡 installed, not loaded"
            fi
        else
            state="⚠️ zygisk daemon not running"
        fi
        tmp="${PROP}.tmp"
        if sed "s#^description=.*#description=${BASE} | ${state}#" "$PROP" > "$tmp" 2>/dev/null; then
            cat "$tmp" > "$PROP"
        fi
        rm -f "$tmp"
        chmod 0644 "$PROP" 2>/dev/null
    fi
fi

exit 0
