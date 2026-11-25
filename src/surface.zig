//! SurfaceControl secure-flag suppression.
//!
//! Some apps (video players, DRM clients) do not rely on the window's
//! FLAG_SECURE only: they call `SurfaceControl.Transaction.setSecure(true)`
//! which ends up in the JNI native method `SurfaceControl.nativeSetFlags`.
//! Clearing the SECURE bit (0x80) from both arguments keeps every other flag
//! intact and stops the surface from becoming unreadable.

const std = @import("std");
const jni = @import("jni.zig");
const api = @import("api.zig");
const log = @import("log.zig");

const SECURE: i32 = 0x00000080;

const OrigFn = *const fn (*jni.JNIEnv, jni.jclass, jni.jlong, jni.jlong, jni.jint, jni.jint) callconv(.c) void;

var orig: ?*anyopaque = null;
var installed: bool = false;
var cleared: usize = 0;

pub fn install(api_table: *api.ApiTable, env: *jni.JNIEnv) bool {
    if (installed) return true;
    const hook = api_table.hook_jni_native_methods orelse return false;

    var methods = [_]jni.JNINativeMethod{
        .{
            .name = "nativeSetFlags",
            .signature = "(JJII)V",
            .fn_ptr = @ptrCast(@constCast(&hookNativeSetFlags)),
        },
    };
    hook(env, "android/view/SurfaceControl", &methods, 1);
    orig = methods[0].fn_ptr;
    installed = orig != null;
    if (installed) {
        log.info("hook installed: SurfaceControl.nativeSetFlags", .{});
    } else {
        log.warn("hook skipped: SurfaceControl.nativeSetFlags", .{});
    }
    return installed;
}

fn hookNativeSetFlags(
    env: *jni.JNIEnv,
    cls: jni.jclass,
    transaction: jni.jlong,
    surface: jni.jlong,
    flags: jni.jint,
    mask: jni.jint,
) callconv(.c) void {
    var f = flags;
    var m = mask;
    if ((m & SECURE) != 0) {
        f &= ~SECURE;
        m &= ~SECURE;
        cleared += 1;
        if (cleared <= 4) log.info("SurfaceControl SECURE suppressed (flags=0x{x} mask=0x{x})", .{ flags, mask });
    }
    const orig_fn: OrigFn = @ptrCast(@alignCast(orig orelse return));
    orig_fn(env, cls, transaction, surface, f, m);
}
