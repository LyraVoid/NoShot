import type { PatchMode, Settings } from "./types";

/** Must match src/config.zig. First writable / valid path wins. */
export const CONF_PATHS = [
  "/data/adb/noshot_zygisk/allow.list",
  "/data/adb/modules/noshot_zygisk/allow.list",
];

export const SETTINGS_PATHS = [
  "/data/adb/noshot_zygisk/settings.conf",
  "/data/adb/modules/noshot_zygisk/settings.conf",
];

export const MODULE_ID = "noshot_zygisk";
export const MODULE_DIR = `/data/adb/modules/${MODULE_ID}`;
export const CONF_DIR = "/data/adb/noshot_zygisk";
export const APP_VERSION = "2.0.0";

/** system_server state, written by the native module at boot. */
export const MODE_PATH = "/data/system/noshot_mode";

const PKG_RE = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/;

export function isPackageName(s: string): boolean {
  return PKG_RE.test(s) && s.length <= 255;
}

export type ParsedConf = {
  pkgs: Set<string>;
  modes: Map<string, PatchMode>;
  keys: Set<string>;
  valid: boolean;
  magic: boolean;
  declared: number | null;
  counted: number;
};

/**
 * Mirrors src/config.zig. The WebUI's own "# ui:" lines are counted towards
 * the magic counter (the WebUI writes them that way), plain package
 * lines are what the native side actually consumes.
 */
export function parseConf(text: string): ParsedConf {
  const pkgs = new Set<string>();
  const modes = new Map<string, PatchMode>();
  const keys = new Set<string>();
  let magic = false;
  let declared: number | null = null;
  let counted = 0;

  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#")) {
      if (line.startsWith("# ui:")) {
        counted++;
        const key = line.slice(5).trim();
        if (key) keys.add(key);
      } else if (line.startsWith("# noshot:")) {
        magic = true;
        const rest = line.slice("# noshot:".length);
        const c = rest.indexOf(":");
        if (c >= 0) {
          const n = Number.parseInt(rest.slice(c + 1), 10);
          if (Number.isFinite(n)) declared = n;
        }
      }
      continue;
    }

    const [rawPkg, ...suffixes] = line.split("|");
    const pkg = rawPkg.trim();
    let mode: PatchMode = "system";
    let ok = true;
    for (const raw of suffixes) {
      const field = raw.trim();
      if (!field) continue;
      if (field.toLowerCase() === "client") mode = "client";
      else if (!/^u\d+$/.test(field)) ok = false;
    }
    if (!ok || !isPackageName(pkg)) continue;
    pkgs.add(pkg);
    modes.set(pkg, mode);
    counted++;
  }

  const countOk = declared === null || declared === counted;
  return {
    pkgs,
    modes,
    keys,
    valid: (magic || pkgs.size > 0) && countOk,
    magic,
    declared,
    counted,
  };
}

/** Serialised shape of `allow.list`, magic line included. */
export function buildConf(pkgs: Iterable<string>, modes: Map<string, PatchMode> = new Map()): string {
  const list = [...new Set(pkgs)].filter(isPackageName).sort();
  const lines = [`# noshot:2:${list.length * 2}`];
  for (const p of list) lines.push(`# ui:${p}|u0`);
  for (const p of list) lines.push(modes.get(p) === "client" ? `${p}|client` : p);
  return lines.join("\n") + "\n";
}

export function parseSettingsText(text: string): Settings {
  const s: Settings = {
    flagSecure: true,
    surfaceSecure: true,
    detectGuard: true,
    systemHook: true,
    log: true,
  };
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().toLowerCase();
    const on = val === "1" || val === "true" || val === "on";
    if (key === "flag_secure") s.flagSecure = on;
    else if (key === "surface_secure") s.surfaceSecure = on;
    else if (key === "detect_guard") s.detectGuard = on;
    else if (key === "system_hook") s.systemHook = on;
    else if (key === "log") s.log = on;
  }
  return s;
}

export function buildSettings(s: Settings): string {
  return [
    "# noshot settings v2",
    `flag_secure=${s.flagSecure ? 1 : 0}`,
    `surface_secure=${s.surfaceSecure ? 1 : 0}`,
    `detect_guard=${s.detectGuard ? 1 : 0}`,
    `system_hook=${s.systemHook ? 1 : 0}`,
    `log=${s.log ? 1 : 0}`,
    "",
  ].join("\n");
}
