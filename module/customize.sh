#!/system/bin/sh
# Module installer for Magisk, KernelSU and APatch.
# The WebUI runs inside the manager; no separate APK is shipped.

SKIPUNZIP=0
MODDIR=${MODPATH:-/data/adb/modules_update/noshot_zygisk}
CONF_DIR=/data/adb/noshot_zygisk
CONF_FILE=$CONF_DIR/allow.list
SETTINGS_FILE=$CONF_DIR/settings.conf

VERSION="$(sed -n 's/^version=//p' "$MODPATH/module.prop" 2>/dev/null | head -1)"
ui_print "----------------------------------------"
ui_print " NoShot Zygisk${VERSION:+ $VERSION}"
ui_print " Per-app FLAG_SECURE remover"
ui_print " Matsuzaka Yuki / LyraVoid"
ui_print "----------------------------------------"

# 1) Config lives outside the module so updates keep the user selection.
mkdir -p "$CONF_DIR"
[ -f "$CONF_FILE" ] || printf '# noshot:1:0\n' > "$CONF_FILE"
[ -f "$SETTINGS_FILE" ] || {
    printf '# noshot settings v1\nflag_secure=1\nsurface_secure=1\ndetect_guard=1\nlog=1\n' > "$SETTINGS_FILE"
}
chmod 0755 "$CONF_DIR"
chmod 0644 "$CONF_FILE" "$SETTINGS_FILE"

# 2) Example config shipped inside the module.
mkdir -p "$MODPATH/config"

# 3) Permissions.
set_perm_recursive "$MODPATH" 0 0 0755 0644
[ -d "$MODPATH/webroot" ] && set_perm_recursive "$MODPATH/webroot" 0 0 0755 0644
[ -d "$MODPATH/zygisk" ]  && set_perm_recursive "$MODPATH/zygisk" 0 0 0755 0644

# 4) Scripts.
for f in post-fs-data.sh service.sh; do
    [ -f "$MODPATH/$f" ] && set_perm "$MODPATH/$f" 0 0 0755
done

# 5) Drop the stale incompatible-module marker.
rm -f "$MODPATH/zygisk/unloaded" 2>/dev/null
rm -f /data/adb/modules/noshot_zygisk/zygisk/unloaded 2>/dev/null
rm -f /data/adb/modules_update/noshot_zygisk/zygisk/unloaded 2>/dev/null

ui_print "- Compatible with Magisk, KernelSU and APatch"
ui_print "- Native library: Zig, no libc dependency"
ui_print "- Config: $CONF_FILE"
ui_print "- Open the module WebUI to select apps"
ui_print "- Reboot to apply"
ui_print "- Done"
