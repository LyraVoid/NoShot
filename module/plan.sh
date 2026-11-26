#!/system/bin/sh
# Resolve allow.list into the plan system_server reads, and publish the
# system_server state where app processes can read it.
#
#   /data/system/noshot_plan   hook/log/gen + uid + pkg lines
#   /data/adb/noshot_zygisk/mode  system | client
#
# Run from post-fs-data, service.sh, the WebUI after a save and by hand.

CONF_DIR=/data/adb/noshot_zygisk
CONF_FILE=$CONF_DIR/allow.list
SETTINGS_FILE=$CONF_DIR/settings.conf
MODE_FILE=$CONF_DIR/mode
SYSTEM_MODE=/data/system/noshot_mode
PLAN=/data/system/noshot_plan
PACKAGES=/data/system/packages.list
USERS=8

[ -f "$CONF_FILE" ] || exit 0

hook=1
grep -qs '^system_hook=0' "$SETTINGS_FILE" && hook=0
[ -e "$CONF_DIR/disable_system" ] && hook=0
log=1
grep -qs '^log=0' "$SETTINGS_FILE" && log=0
capture=off
case "$(grep -s '^capture_guard=' "$SETTINGS_FILE" | tail -1 | cut -d= -f2 | tr -d ' \r')" in
    1|on|true) capture=on ;;
    observe) capture=observe ;;
esac
gen=$(stat -c %Y "$CONF_FILE" 2>/dev/null)
[ -n "$gen" ] || gen=0
settings_gen=$(stat -c %Y "$SETTINGS_FILE" 2>/dev/null)
if [ -n "$settings_gen" ] && [ "$settings_gen" -gt "$gen" ] 2>/dev/null; then
    gen=$settings_gen
fi

tmp="$PLAN.tmp"
{
    echo "hook=$hook"
    echo "log=$log"
    echo "capture=$capture"
    echo "gen=$gen"
} > "$tmp" 2>/dev/null || exit 1

while IFS= read -r raw; do
    line=$(printf '%s' "$raw" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    [ -n "$line" ] || continue
    case "$line" in \#*) continue ;; esac
    case "$line" in *"|client"*) continue ;; esac

    pkg=$(printf '%s' "$line" | cut -d'|' -f1)
    field2=$(printf '%s' "$line" | cut -d'|' -f2)
    user=""
    case "$field2" in
        u[0-9]*) user=${field2#u} ;;
    esac

    uid=$(grep -m1 -E "^$pkg " "$PACKAGES" 2>/dev/null | cut -d' ' -f2)
    [ -n "$uid" ] || continue

    echo "pkg=$pkg" >> "$tmp"
    if [ -n "$user" ] && [ "$user" -ge 0 ] 2>/dev/null; then
        echo "uid=$((uid + user * 100000))" >> "$tmp"
    else
        u=0
        while [ "$u" -lt "$USERS" ]; do
            echo "uid=$((uid + u * 100000))" >> "$tmp"
            u=$((u + 1))
        done
    fi
done < "$CONF_FILE"

chmod 0644 "$tmp" 2>/dev/null
mv -f "$tmp" "$PLAN" 2>/dev/null || exit 1

if [ -f "$SYSTEM_MODE" ]; then
    if grep -qs '^system' "$SYSTEM_MODE"; then
        side=system
    else
        side=client
    fi
    for target in "$MODE_FILE" /data/adb/modules/noshot_zygisk/mode; do
        printf '%s\n' "$side" > "$target" 2>/dev/null
        chmod 0644 "$target" 2>/dev/null
    done
fi

exit 0
