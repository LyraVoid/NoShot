#!/system/bin/sh
# Runs before Zygote: make sure the config directory exists and is writable.
CONF_DIR=/data/adb/noshot_zygisk
CONF_FILE=$CONF_DIR/allow.list
SETTINGS_FILE=$CONF_DIR/settings.conf

mkdir -p "$CONF_DIR"
[ -f "$CONF_FILE" ] || printf '# noshot:2:0\n' > "$CONF_FILE"
[ -f "$SETTINGS_FILE" ] || {
    printf '# noshot settings v2\nflag_secure=1\nsurface_secure=1\ndetect_guard=1\nsystem_hook=1\nlog=1\n' > "$SETTINGS_FILE"
}
chmod 0755 "$CONF_DIR"
chmod 0644 "$CONF_FILE" "$SETTINGS_FILE"

# The state files describe the previous boot until system_server runs again.
rm -f /data/system/noshot_state 2>/dev/null
printf 'client\n' > /data/system/noshot_mode 2>/dev/null
sh /data/adb/modules/noshot_zygisk/plan.sh 2>/dev/null

# Drop the stale incompatible-module marker before Zygote starts.
rm -f /data/adb/modules/noshot_zygisk/zygisk/unloaded 2>/dev/null
rm -f /data/adb/modules_update/noshot_zygisk/zygisk/unloaded 2>/dev/null

exit 0
