#!/system/bin/sh
# Runs before Zygote: make sure the config directory exists and is writable.
CONF_DIR=/data/adb/noshot_zygisk
CONF_FILE=$CONF_DIR/allow.list
SETTINGS_FILE=$CONF_DIR/settings.conf

mkdir -p "$CONF_DIR"
[ -f "$CONF_FILE" ] || printf '# noshot:1:0\n' > "$CONF_FILE"
[ -f "$SETTINGS_FILE" ] || {
    printf '# noshot settings v1\nflag_secure=1\nsurface_secure=1\ndetect_guard=1\nlog=1\n' > "$SETTINGS_FILE"
}
chmod 0755 "$CONF_DIR"
chmod 0644 "$CONF_FILE" "$SETTINGS_FILE"

# Drop the stale incompatible-module marker before Zygote starts.
rm -f /data/adb/modules/noshot_zygisk/zygisk/unloaded 2>/dev/null
rm -f /data/adb/modules_update/noshot_zygisk/zygisk/unloaded 2>/dev/null

exit 0
