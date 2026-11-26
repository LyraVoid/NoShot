#!/usr/bin/env bash
# Verify the capture guard on a device.
#
#   ./scripts/verify-capture.sh           # observe round, then report
#   ./scripts/verify-capture.sh --on      # suppress round (needs a restart)
#   ./scripts/verify-capture.sh --off     # back to off
#   ./scripts/verify-capture.sh --status  # only read the current state
#
# The test app is not shipped; point it at your own app with
#   TEST_PKG=com.example.app
# and take a screenshot (VOLUME_DOWN + POWER) or start a screen recording while
# it is in the foreground. Without a test app only the module side is checked.
set -uo pipefail

CONF=/data/adb/noshot_zygisk/settings.conf
PLAN_SCRIPT=/data/adb/modules/noshot_zygisk/plan.sh
GUARD=/data/system/noshot_guard
STATE=/data/system/noshot_state
LEVEL=observe
TEST_PKG="${TEST_PKG:-}"

for arg in "$@"; do
    case "$arg" in
        --on) LEVEL=1 ;;
        --off) LEVEL=0 ;;
        --observe) LEVEL=observe ;;
        --status) LEVEL=status ;;
        *) echo "unknown option: $arg" >&2; exit 2 ;;
    esac
done

adb wait-for-device >/dev/null || exit 1
if ! adb shell id | grep -q 'uid=0'; then
    echo "!! need a root shell: run 'adb root' first" >&2
    exit 1
fi

report() {
    local guard plan mode state
    guard=$(adb shell "cat $GUARD 2>/dev/null" | tr -d '\r')
    plan=$(adb shell "grep '^capture=' /data/system/noshot_plan 2>/dev/null" | tr -d '\r')
    mode=$(adb shell "cat /data/system/noshot_mode 2>/dev/null" | tr -d '\r')
    echo "guard=${guard:-(missing)}   plan=${plan:-(missing)}   mode=${mode:-(missing)}"
    state=$(adb shell "grep -E '^(capture|recording) ' $STATE 2>/dev/null | tail -n 6" | tr -d '\r')
    [ -n "$state" ] && echo "$state"
}

if [ "$LEVEL" = "status" ]; then
    report
    exit 0
fi

echo "==> capture_guard=$LEVEL"
adb shell "grep -v '^capture_guard=' $CONF > /tmp/noshot_s.t 2>/dev/null; \
    printf 'capture_guard=%s\n' '$LEVEL' >> /tmp/noshot_s.t; \
    chmod 0644 /tmp/noshot_s.t; mv -f /tmp/noshot_s.t $CONF; \
    sh $PLAN_SCRIPT" >/dev/null
sleep 5

# The hook is installed at boot only; 0 <-> 1 needs a framework restart.
if [ "$LEVEL" != "observe" ]; then
    echo "==> restarting the framework"
    adb shell 'setprop ctl.restart zygote' >/dev/null 2>&1
    sleep 25
    adb wait-for-device >/dev/null
    sleep 8
fi

report

if [ -z "$TEST_PKG" ]; then
    cat <<'EOS'

==> no TEST_PKG set, module side only.
    Re-run with TEST_PKG=<package> to also count what the app receives, or
    take a screenshot yourself and re-run with --status.
EOS
    exit 0
fi

echo "==> driving $TEST_PKG"
adb shell 'input keyevent 224; wm dismiss-keyguard' >/dev/null 2>&1
sleep 1
adb shell "am force-stop $TEST_PKG" >/dev/null 2>&1
sleep 1
adb logcat -c
adb shell "monkey -p $TEST_PKG -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1
sleep 4
focus=$(adb shell 'dumpsys window | grep mCurrentFocus' | tr -d '\r')
case "$focus" in
    *"$TEST_PKG"*) ;;
    *)
        echo "!! $TEST_PKG is not in the foreground, the capture would hit another layer:"
        echo "   $focus"
        echo "   unlock the device and re-run."
        exit 1
        ;;
esac
adb shell 'input keycombination -t 120 KEYCODE_VOLUME_DOWN KEYCODE_POWER' >/dev/null 2>&1
sleep 4
echo "--- app callbacks in logcat:"
adb logcat -d | grep -iE "screen.?captur|REC_STATE" | tail -n 5
report
