//! `allow.list` / `settings.conf` parsing.
//!
//! The on-disk shape is line based so both sides can share a file:
//!
//!     # noshot:1:2
//!     # ui:com.example.app|u0
//!     com.example.app
//!     com.example.bank
//!
//! Lines starting with '#' are comments. `# noshot:<ver>` marks a deliberately
//! written file (an empty one included), and `# noshot:<ver>:<n>` additionally
//! declares how many entries were written so a truncated write can be
//! detected. `# ui:` lines carry the WebUI's per-user selection and are
//! ignored by the native side.
//!
//! Besides plain package names we accept `pkg|u999` for a per-user rule.
//! The React UI writes plain names by default.

const std = @import("std");

pub const max_config_bytes = 1 << 20;

pub const target_paths = [_][]const u8{
    "/data/adb/noshot_zygisk/allow.list",
    "/data/adb/modules/noshot_zygisk/allow.list",
};

pub const settings_paths = [_][]const u8{
    "/data/adb/noshot_zygisk/settings.conf",
    "/data/adb/modules/noshot_zygisk/settings.conf",
};

pub const FLAG_SECURE: i32 = 0x2000;

pub const Target = struct {
    pkg: []const u8,
    /// null = all users, otherwise the Android user id (e.g. 0 or 999)
    user: ?u32 = null,
};

pub const Settings = struct {
    flag_secure: bool = true,
    surface_secure: bool = true,
    detect_guard: bool = true,
    log: bool = true,
};

pub const ParseResult = struct {
    targets: []Target,
    valid: bool,
    magic: bool,
    declared: ?usize = null,
    counted: usize = 0,
};

pub fn isPackageName(s: []const u8) bool {
    if (s.len == 0 or s.len > 255) return false;
    var dots: usize = 0;
    var prev_dot = true; // disallow leading '.'
    for (s) |c| {
        if (c == '.') {
            if (prev_dot) return false;
            prev_dot = true;
            dots += 1;
        } else if (c == '_' or (c >= '0' and c <= '9') or (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z')) {
            prev_dot = false;
        } else {
            return false;
        }
    }
    return dots >= 1 and !prev_dot;
}

fn parseUserSuffix(rest: []const u8) ?u32 {
    // rest is the part after '|', e.g. "u999"
    if (rest.len < 2 or rest[0] != 'u') return null;
    return std.fmt.parseInt(u32, rest[1..], 10) catch null;
}

/// Parse an `allow.list` body. Slices in the result point into `text`.
pub fn parseTargets(alloc: std.mem.Allocator, text: []const u8) !ParseResult {
    var list: std.ArrayListUnmanaged(Target) = .empty;
    errdefer list.deinit(alloc);

    var magic = false;
    var declared: ?usize = null;
    var counted: usize = 0;

    var lines = std.mem.splitScalar(u8, text, '\n');
    while (lines.next()) |raw| {
        const line = std.mem.trim(u8, raw, " \t\r");
        if (line.len == 0) continue;

        if (std.mem.startsWith(u8, line, "#")) {
            if (std.mem.startsWith(u8, line, "# ui:")) {
                // The WebUI writes one "# ui:<pkg>|u<id>" line per selection
                // and includes those lines in the magic counter.
                counted += 1;
            } else if (std.mem.startsWith(u8, line, "# noshot:")) {
                magic = true;
                const rest = line["# noshot:".len..];
                if (std.mem.indexOfScalar(u8, rest, ':')) |ci| {
                    declared = std.fmt.parseInt(usize, rest[ci + 1 ..], 10) catch null;
                }
            }
            continue;
        }

        var pkg = line;
        var user: ?u32 = null;
        if (std.mem.indexOfScalar(u8, line, '|')) |bar| {
            pkg = std.mem.trim(u8, line[0..bar], " \t");
            user = parseUserSuffix(std.mem.trim(u8, line[bar + 1 ..], " \t")) orelse continue;
        }
        if (!isPackageName(pkg)) continue;

        try list.append(alloc, .{ .pkg = pkg, .user = user });
        counted += 1;
    }

    const count_ok = if (declared) |d| d == counted else true;
    const valid = (magic or list.items.len > 0) and count_ok;
    return .{
        .targets = try list.toOwnedSlice(alloc),
        .valid = valid,
        .magic = magic,
        .declared = declared,
        .counted = counted,
    };
}

pub fn parseSettings(text: []const u8) Settings {
    var s = Settings{};
    var lines = std.mem.splitScalar(u8, text, '\n');
    while (lines.next()) |raw| {
        const line = std.mem.trim(u8, raw, " \t\r");
        if (line.len == 0 or line[0] == '#') continue;
        const eq = std.mem.indexOfScalar(u8, line, '=') orelse continue;
        const key = std.mem.trim(u8, line[0..eq], " \t");
        const val = std.mem.trim(u8, line[eq + 1 ..], " \t");
        const on = std.mem.eql(u8, val, "1") or std.ascii.eqlIgnoreCase(val, "true") or std.ascii.eqlIgnoreCase(val, "on");
        if (std.mem.eql(u8, key, "flag_secure")) {
            s.flag_secure = on;
        } else if (std.mem.eql(u8, key, "surface_secure")) {
            s.surface_secure = on;
        } else if (std.mem.eql(u8, key, "detect_guard")) {
            s.detect_guard = on;
        } else if (std.mem.eql(u8, key, "log")) {
            s.log = on;
        }
    }
    return s;
}

/// Package part of a zygote process name: "com.foo:remote" -> "com.foo".
pub fn packageOf(process_name: []const u8) []const u8 {
    if (std.mem.indexOfScalar(u8, process_name, ':')) |i| return process_name[0..i];
    return process_name;
}

pub fn userIdOf(uid: i32) u32 {
    if (uid < 0) return 0;
    const u: u32 = @intCast(uid);
    return u / 100000;
}

pub fn matches(targets: []const Target, pkg: []const u8, uid: i32) bool {
    const user = userIdOf(uid);
    for (targets) |t| {
        if (!std.mem.eql(u8, t.pkg, pkg)) continue;
        if (t.user) |tu| {
            if (tu != user) continue;
        }
        return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// tests (run with: zig test src/config.zig)
// ---------------------------------------------------------------------------

test "parses packages, comments and magic" {
    const text =
        \\# noshot:1:4
        \\# ui:com.a|u0
        \\com.a
        \\com.b.c
        \\# random comment
        \\com.d_e.f1
    ;
    const r = try parseTargets(std.testing.allocator, text);
    defer std.testing.allocator.free(r.targets);
    try std.testing.expect(r.valid);
    try std.testing.expectEqual(@as(usize, 3), r.targets.len);
    try std.testing.expectEqualStrings("com.b.c", r.targets[1].pkg);
    try std.testing.expect(r.targets[1].user == null);
}

test "rejects truncated write (declared count mismatch)" {
    const text =
        \\# noshot:1:4
        \\com.a
        \\com.b
    ;
    const r = try parseTargets(std.testing.allocator, text);
    defer std.testing.allocator.free(r.targets);
    try std.testing.expect(!r.valid);
}

test "empty but deliberate file is valid" {
    const r = try parseTargets(std.testing.allocator, "# noshot:1:0\n");
    defer std.testing.allocator.free(r.targets);
    try std.testing.expect(r.valid);
    try std.testing.expectEqual(@as(usize, 0), r.targets.len);
}

test "per-user rule" {
    const r = try parseTargets(std.testing.allocator, "# noshot:1:1\ncom.bank|u999\n");
    defer std.testing.allocator.free(r.targets);
    try std.testing.expect(r.valid);
    try std.testing.expectEqual(@as(?u32, 999), r.targets[0].user);
    try std.testing.expect(matches(r.targets, "com.bank", 999 * 100000 + 10123));
    try std.testing.expect(!matches(r.targets, "com.bank", 0 + 10123));
}

test "real world config from the original WebUI" {
    const text =
        \\# noshot:1:2
        \\# ui:com.google.android.apps.authenticator2|u0
        \\com.google.android.apps.authenticator2
    ;
    const r = try parseTargets(std.testing.allocator, text);
    defer std.testing.allocator.free(r.targets);
    try std.testing.expect(r.valid);
    try std.testing.expectEqual(@as(usize, 1), r.targets.len);
}

test "invalid package names are ignored" {
    try std.testing.expect(!isPackageName(""));
    try std.testing.expect(!isPackageName("nodots"));
    try std.testing.expect(!isPackageName("com..a"));
    try std.testing.expect(!isPackageName("com.a b"));
    try std.testing.expect(isPackageName("com.example.app"));
}

test "process name package extraction" {
    try std.testing.expectEqualStrings("com.foo", packageOf("com.foo:remote"));
    try std.testing.expectEqualStrings("com.foo", packageOf("com.foo"));
}

test "settings" {
    const s = parseSettings("# cfg\nflag_secure=0\nsurface_secure=true\ndetect_guard=off\nlog=1\n");
    try std.testing.expect(!s.flag_secure);
    try std.testing.expect(s.surface_secure);
    try std.testing.expect(!s.detect_guard);
    try std.testing.expect(s.log);
}
