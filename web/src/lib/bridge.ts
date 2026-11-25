import type { AppEntry, Settings, ZygiskStatus } from "./types";
import {
  APP_VERSION,
  CONF_PATHS,
  MODULE_DIR,
  SETTINGS_PATHS,
  buildConf,
  buildSettings,
  parseConf,
  parseSettingsText,
} from "./conf";

/* ---------------------------------------------------------------------------
 * Host bridge: the WebUI host may expose one of three `exec` shapes. Probe
 * once, remember the fastest one that answers, and reuse it.
 *
 *   sync      exec(cmd) -> stdout
 *   callback  exec(cmd, fnName) -> void
 *   promise   exec(cmd) -> Promise<string>
 * ------------------------------------------------------------------------- */

type ExecMode = "sync" | "callback";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const host: any = typeof window !== "undefined" ? (window as any).ksu : undefined;

export const isHost = !!(host && typeof host.exec === "function");
export const isDemo = !isHost;

let execMode: ExecMode | null = null;
let modeProbe: Promise<ExecMode> | null = null;
let cbSeq = 0;

function extractString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("{") && t.includes('"stdout"')) {
      try {
        const o = JSON.parse(t);
        if (o && typeof o.stdout === "string") return o.stdout;
      } catch {
        /* not JSON */
      }
    }
    return v;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["stdout", "result", "out"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
  }
  return "";
}

function maybe<T>(v: T | Promise<T>): Promise<T> {
  return v && typeof (v as Promise<T>).then === "function"
    ? (v as Promise<T>)
    : Promise.resolve(v);
}

function callPlain(cmd: string): Promise<string> {
  return new Promise((resolve) => {
    let r: unknown;
    try {
      r = host.exec(cmd);
    } catch {
      resolve("");
      return;
    }
    maybe(r as Promise<unknown>)
      .then((v) => resolve(extractString(v)))
      .catch(() => resolve(""));
  });
}

function callCallback(cmd: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve) => {
    const name = `__noshot_cb_${++cbSeq}`;
    let done = false;
    const w = window as unknown as Record<string, unknown>;
    const finish = (v: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        delete w[name];
      } catch {
        /* ignore */
      }
      resolve(extractString(v));
    };
    const timer = setTimeout(() => finish(""), timeoutMs);
    w[name] = (code: unknown, stdout: unknown, stderr: unknown) => {
      // callback shape: (exitCode, stdout, stderr)
      if (typeof stdout === "string" && stdout.length) finish(stdout);
      else if (typeof stderr === "string" && stderr.length) finish(stderr);
      else finish(code ?? "");
    };
    let r: unknown;
    try {
      r = host.exec(cmd, name);
    } catch {
      finish("");
      return;
    }
    maybe(r as Promise<unknown>)
      .then((v) => {
        const s = extractString(v);
        if (s.length) finish(s);
      })
      .catch(() => finish(""));
  });
}

async function detectMode(): Promise<ExecMode> {
  if (execMode) return execMode;
  if (!modeProbe) {
    modeProbe = (async (): Promise<ExecMode> => {
      const a = await callPlain("echo NOSHOT_PROBE_SYNC");
      if (a.includes("NOSHOT_PROBE_SYNC")) return "sync";
      const b = await callCallback("echo NOSHOT_PROBE_CB", 2500);
      if (b.includes("NOSHOT_PROBE_CB")) return "callback";
      return "sync";
    })();
  }
  execMode = await modeProbe;
  return execMode;
}

export async function exec(cmd: string): Promise<string> {
  if (!isHost) return "";
  const mode = await detectMode();
  if (mode === "callback") return callCallback(cmd);
  return callPlain(cmd);
}

/* ------------------------------------------------------------------ files */

function q(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

const norm = (s: string) => String(s ?? "").replace(/\r/g, "").replace(/\s+$/g, "");

function readEncoded(path: string): string {
  return `base64 ${q(path)} 2>/dev/null | tr -d '\\n'`;
}

function decodeText(encoded: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

export async function readText(path: string): Promise<string> {
  if (!isHost) return "";
  try {
    if (typeof host.readFile === "function") {
      const r = await maybe(host.readFile(path));
      if (typeof r === "string" && r.length) return r;
    }
  } catch {
    /* fall through to shell */
  }
  return decodeText(await exec(`${readEncoded(path)}; printf '\\n'`));
}

/** Read several candidate files in one shell round-trip. */
export async function readCandidates(paths: string[]): Promise<{ path: string; text: string }[]> {
  if (!isHost) return [];
  const body = paths.map((path) => `${readEncoded(path)}; printf ':'`).join("; ");
  const out = await exec(`${body}; printf '\\n'`);
  const parts = out.split(":");
  if (parts.length !== paths.length + 1 || parts.at(-1)?.trim()) return [];
  return paths.map((path, i) => ({ path, text: decodeText(parts[i]) }));
}

export async function writeText(path: string, text: string): Promise<boolean> {
  if (!isHost) return false;
  try {
    if (typeof host.writeFile === "function") {
      const r = await maybe(host.writeFile(path, text));
      if (r !== false) {
        const back = await readText(path);
        if (norm(back) === norm(text)) return true;
      }
    }
  } catch {
    /* fall through to shell */
  }
  const dir = path.slice(0, path.lastIndexOf("/"));
  const b64 = b64utf8(text);
  const cmd =
    `mkdir -p ${q(dir)} 2>/dev/null; ` +
    `printf '%s' ${q(b64)} | base64 -d > ${q(path)} 2>/dev/null && echo __NOSHOT_WRITE_OK__`;
  const out = await exec(cmd);
  if (!out.includes("__NOSHOT_WRITE_OK__")) return false;
  const back = await readText(path);
  return norm(back) === norm(text);
}

/* ----------------------------------------------------------------- config */

export type LoadedConf = { pkgs: Set<string>; path: string | null; text: string };

export async function loadConf(): Promise<LoadedConf> {
  if (isDemo) {
    const cached = safeGet("noshot_demo_targets");
    const pkgs = new Set<string>(
      cached !== null
        ? (JSON.parse(cached) as string[])
        : ["com.tencent.mm", "com.eg.android.AlipayGphone"],
    );
    return { pkgs, path: CONF_PATHS[0], text: buildConf(pkgs) };
  }

  const files = await readCandidates(CONF_PATHS);
  for (const f of files) {
    const parsed = parseConf(f.text);
    if (parsed.valid) {
      safeSet("noshot_conf_cache", f.text);
      return { pkgs: parsed.pkgs, path: f.path, text: f.text };
    }
  }
  const cached = safeGet("noshot_conf_cache");
  if (cached) {
    const parsed = parseConf(cached);
    if (parsed.valid) return { pkgs: parsed.pkgs, path: null, text: cached };
  }
  return { pkgs: new Set(), path: null, text: "" };
}

export async function saveConf(pkgs: Set<string>): Promise<string | null> {
  const text = buildConf(pkgs);
  if (isDemo) {
    safeSet("noshot_demo_targets", JSON.stringify([...pkgs]));
    return CONF_PATHS[0];
  }
  for (const path of CONF_PATHS) {
    if (await writeText(path, text)) {
      safeSet("noshot_conf_cache", text);
      return path;
    }
  }
  return null;
}

export async function loadSettings(): Promise<Settings> {
  if (isDemo) {
    const cached = safeGet("noshot_demo_settings");
    if (cached) return { ...parseSettingsText(""), ...JSON.parse(cached) };
    return parseSettingsText("");
  }
  const files = await readCandidates(SETTINGS_PATHS);
  for (const f of files) {
    if (f.text.trim()) return parseSettingsText(f.text);
  }
  return parseSettingsText("");
}

export async function saveSettings(s: Settings): Promise<boolean> {
  if (isDemo) {
    safeSet("noshot_demo_settings", JSON.stringify(s));
    return true;
  }
  const text = buildSettings(s);
  for (const path of SETTINGS_PATHS) {
    if (await writeText(path, text)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------- apps */

const DEMO_APPS: AppEntry[] = [
  { pkg: "com.tencent.mm", label: "微信", version: "8.0.58", users: [0] },
  { pkg: "com.eg.android.AlipayGphone", label: "支付宝", version: "10.6.90", users: [0] },
  { pkg: "com.icbc", label: "中国工商银行", version: "9.2.1", users: [0, 10] },
  { pkg: "com.chase.sig.android", label: "Chase", version: "5.20.1", users: [0] },
  { pkg: "com.ss.android.ugc.aweme", label: "抖音", version: "33.0.0", users: [0] },
  { pkg: "tv.danmaku.bili", label: "哔哩哔哩", version: "8.20.0", users: [0] },
  { pkg: "com.taobao.taobao", label: "淘宝", version: "10.40.0", users: [0, 10] },
  { pkg: "com.jingdong.app.mall", label: "京东", version: "13.1.0", users: [0] },
  { pkg: "com.xingin.xhs", label: "小红书", version: "8.30.0", users: [0] },
  { pkg: "com.sankuai.meituan", label: "美团", version: "12.20.0", users: [0] },
  { pkg: "com.unionpay", label: "云闪付", version: "10.0.6", users: [0, 10] },
  { pkg: "com.netflix.mediaclient", label: "Netflix", version: "8.120.0", users: [0] },
  { pkg: "com.google.android.apps.authenticator2", label: "Authenticator", version: "7.0", users: [0] },
  { pkg: "org.telegram.messenger", label: "Telegram", version: "11.2.0", users: [0] },
];

type RawInfo = {
  packageName?: string;
  appLabel?: string;
  label?: string;
  versionName?: string;
  uid?: number | null;
  userId?: number | null;
  isSystem?: boolean | null;
  error?: string;
};

function parseJsonArray(v: unknown): unknown[] {
  let val: unknown = v;
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(val)) {
    const o = val as Record<string, unknown>;
    if (o && Array.isArray(o.data)) val = o.data;
    else if (o && Array.isArray(o.result)) val = o.result;
    else return [];
  }
  return Array.isArray(val) ? val : [];
}

async function bridgeListPackages(): Promise<string[]> {
  if (!isHost) return [];
  try {
    const pm = typeof host.pm === "function" ? host.pm() : undefined;
    const fn = pm?.listPackages ?? host.listPackages;
    if (typeof fn !== "function") return [];
    let raw: unknown;
    try {
      raw = await maybe(fn.call(pm ?? host, "user"));
    } catch {
      raw = await maybe(fn.call(pm ?? host));
    }
    return parseJsonArray(raw)
      .map((x) => (typeof x === "string" ? x : (x as RawInfo)?.packageName))
      .filter((x): x is string => !!x);
  } catch {
    return [];
  }
}

async function bridgeInfos(pkgs: string[]): Promise<RawInfo[]> {
  if (!isHost || pkgs.length === 0) return [];
  const pm = typeof host.pm === "function" ? host.pm() : undefined;
  const fn = pm?.getPackagesInfo ?? host.getPackagesInfo;
  if (typeof fn !== "function") return [];
  const out: RawInfo[] = [];
  for (let i = 0; i < pkgs.length; i += 150) {
    const chunk = pkgs.slice(i, i + 150);
    try {
      const r = await maybe(fn.call(pm ?? host, JSON.stringify(chunk)));
      out.push(...(parseJsonArray(r) as RawInfo[]));
    } catch {
      /* try next chunk */
    }
  }
  return out;
}

const APP_CACHE_MS = 30_000;
let appCache: { at: number; stamp: string; apps: AppEntry[] } | null = null;

async function appStamp(): Promise<string> {
  return (await exec("stat -c %Y /data/app 2>/dev/null")).trim();
}

export async function loadApps(force = false): Promise<AppEntry[]> {
  if (isDemo) return DEMO_APPS.map((a) => ({ ...a, users: [...a.users] }));

  const stamp = await appStamp();
  if (!force && appCache && appCache.stamp === stamp && Date.now() - appCache.at < APP_CACHE_MS) {
    return appCache.apps;
  }

  const users = new Map<string, Set<number>>();
  const out = await exec("pm list packages -3 -U 2>/dev/null");
  for (const raw of out.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("package:")) continue;
    const body = line.slice("package:".length);
    const [pkg, uidPart] = body.split(/\s+uid:/);
    if (!pkg) continue;
    const set = users.get(pkg) ?? new Set<number>();
    for (const uid of String(uidPart ?? "").split(",")) {
      const n = Number.parseInt(uid, 10);
      if (Number.isFinite(n) && n > 0) set.add(Math.floor(n / 100000));
    }
    if (set.size === 0) set.add(0);
    users.set(pkg, set);
  }

  if (users.size < 3) {
    for (const pkg of await bridgeListPackages()) {
      if (!users.has(pkg)) users.set(pkg, new Set([0]));
    }
  }

  const pkgs = [...users.keys()];
  const infos = await bridgeInfos(pkgs);
  const byPkg = new Map<string, RawInfo>();
  for (const info of infos) {
    if (!info?.packageName || info.error) continue;
    const prev = byPkg.get(info.packageName);
    if (!prev) {
      byPkg.set(info.packageName, info);
    }
    const user = Number(info.userId ?? (info.uid ? Math.floor(Number(info.uid) / 100000) : NaN));
    if (Number.isFinite(user) && user >= 0) {
      const set = users.get(info.packageName) ?? new Set<number>();
      set.add(user);
      users.set(info.packageName, set);
    }
  }

  const collator = new Intl.Collator("zh-Hans-CN", { sensitivity: "base" });
  const apps = pkgs
    .map((pkg): AppEntry => {
      const info = byPkg.get(pkg);
      return {
        pkg,
        label: info?.appLabel || info?.label || pkg,
        version: info?.versionName,
        system: info?.isSystem ?? false,
        users: [...(users.get(pkg) ?? new Set([0]))].sort((a, b) => a - b),
      };
    })
    .sort((a, b) => collator.compare(a.label, b.label) || collator.compare(a.pkg, b.pkg));

  appCache = { at: Date.now(), stamp, apps };
  return apps;
}

/* ----------------------------------------------------------------- status */

export async function zygiskStatus(): Promise<ZygiskStatus> {
  if (isDemo) return { host: "active", module: "loaded" };
  const script = [
    "h=unknown; m=unknown",
    `if [ -r /data/adb/modules ] && [ -x /data/adb/modules ]; then m=missing; fi`,
    `for d in zygisksu zygisk_next rezygisk neozygisk folkzygisk; do [ -d /data/adb/modules/$d ] && [ ! -e /data/adb/modules/$d/disable ] && h=present; done`,
    `s=/data/adb/ksu/.zygisk/state.json; boot=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null); if [ -n "$boot" ] && grep -Fq "$boot" "$s" 2>/dev/null && grep -Eq '"injected"[[:space:]]*:[[:space:]]*true' "$s" && { pidof zygiskd64 >/dev/null || pidof zygiskd32 >/dev/null; }; then h=active; fi`,
    `for f in ${MODULE_DIR}/zygisk/*.so; do [ -f "$f" ] && m=installed && break; done`,
    // logcat rotates fast, so "loaded" is latched per boot and per library build
    // instead of depending on a line that may already have scrolled away.
    `marker=${MODULE_DIR}/.loaded; so=$(ls ${MODULE_DIR}/zygisk/arm64-v8a.so 2>/dev/null); stamp="$boot $(stat -c %Y "$so" 2>/dev/null)"`,
    `if [ -e ${MODULE_DIR}/disable ] || [ -e ${MODULE_DIR}/remove ]; then m=disabled; elif [ "$m" = installed ]; then if logcat -d -s NoShot 2>/dev/null | grep -q 'module loaded pid='; then m=loaded; h=active; printf '%s\\n' "$stamp" > "$marker" 2>/dev/null; elif [ "$(cat "$marker" 2>/dev/null)" = "$stamp" ]; then m=loaded; h=active; fi; fi`,
    `case "$m" in loaded) st="✅ active";; installed) st="🟡 installed, not loaded";; disabled) st="⛔ disabled";; missing) st="❌ library missing";; *) if [ "$h" = active ]; then st="⚠️ unknown state"; else st="⚠️ zygisk not running"; fi;; esac`,
    `prop=${MODULE_DIR}/module.prop; if [ -f "$prop" ] && grep -Eq '^description=' "$prop"; then tmp="$prop.tmp"; sed "s#^description=.*#description=Per-app FLAG_SECURE remover - binder-level clear, no ART hooks | \${st}#" "$prop" > "$tmp" 2>/dev/null && cat "$tmp" > "$prop"; rm -f "$tmp"; chmod 0644 "$prop" 2>/dev/null; fi`,
    `echo "NOSHOT:$h:$m"`,
  ].join("; ");
  const out = await exec(script);
  const match = /NOSHOT:(active|present|unknown):(loaded|installed|disabled|missing|unknown)\b/.exec(out);
  return match
    ? { host: match[1] as ZygiskStatus["host"], module: match[2] as ZygiskStatus["module"] }
    : { host: "unknown", module: "unknown" };
}

const LOG_TAG = "NoShot";
const LOG_PREFIX = "NOSHOT_LOG:";
const LOG_LINES = 400;

export async function fetchLogs(): Promise<string | null> {
  if (isDemo) {
    return [
      "--------- beginning of main",
      "11-25 15:42:10.183  4211  4211 I NoShot : module loaded pid=4211 api=4",
      "11-25 15:42:10.184  4211  4211 I NoShot : pre proc=com.tencent.mm uid=10233 target=1 cfg=(flag=1 surface=1 detect=1 log=1)",
      "11-25 15:42:10.306  4211  4211 I NoShot : hook installed: BinderProxy.transactNative",
      "11-25 15:42:10.307  4211  4211 I NoShot : hook installed: SurfaceControl.nativeSetFlags",
      "11-25 15:42:10.308  4211  4211 I NoShot : PLT hook registered: inotify_add_watch (dev=fe0000 ino=2314)",
      "11-25 15:42:10.309  4211  4211 I NoShot : post proc=com.tencent.mm hooks=3",
      "11-25 15:42:12.771  4211  4230 I NoShot : FLAG_SECURE stripped (transact=3 size=196 off=132 flags=0x2200)",
    ].join("\n");
  }
  const out = await exec(
    `if logs=$(logcat -d -v time -s ${LOG_TAG} 2>/dev/null | tail -n ${LOG_LINES}); then ` +
      `printf '${LOG_PREFIX}'; printf '%s\\n' "$logs" | sed '/^--------- /d' | base64 | tr -d '\\n'; printf '\\n'; fi`,
  );
  if (!out.startsWith(LOG_PREFIX)) return null;
  return decodeText(out.slice(LOG_PREFIX.length)).trimEnd();
}

export async function diagnose(): Promise<string> {
  if (isDemo) {
    return [
      "uid=0(root)",
      "release=17 sdk=37 abi=arm64-v8a",
      `module=${MODULE_DIR} (预览模式)`,
      `config=${CONF_PATHS[0]}`,
      "shell=preview",
    ].join("\n");
  }
  const body = [
      'echo "uid=$(id -u) root=$(id -un 2>/dev/null)"',
      'echo "release=$(getprop ro.build.version.release) sdk=$(getprop ro.build.version.sdk) abi=$(getprop ro.product.cpu.abi)"',
      `echo "module=${MODULE_DIR}"; ls -l ${MODULE_DIR}/zygisk 2>/dev/null`,
      `echo "config:"; ls -l ${CONF_PATHS[0]} ${SETTINGS_PATHS[0]} 2>/dev/null; cat ${CONF_PATHS[0]} 2>/dev/null`,
      "echo \"logcat_lines=$(logcat -d -t 5 2>/dev/null | wc -l)\"",
    ].join("; ");
  return decodeText(await exec(`{ ${body}; } | base64 | tr -d '\\n'; printf '\\n'`));
}

/* ------------------------------------------------------------------ actions */

export async function stopApps(pkgs: string[], usersByPkg: Map<string, number[]>): Promise<number> {
  if (isDemo) return pkgs.length;
  const cmds: string[] = [];
  let n = 0;
  for (const pkg of pkgs) {
    const users = usersByPkg.get(pkg) ?? [0];
    for (const user of users) {
      cmds.push(`am force-stop --user ${user} ${q(pkg)}`);
      n++;
    }
  }
  if (cmds.length === 0) return 0;
  await exec(cmds.join("; ") + "; echo __NOSHOT_STOP_DONE__");
  return n;
}

export function openExternal(url: string): void {
  try {
    if (isHost && typeof host.openExternal === "function") {
      host.openExternal(url);
      return;
    }
  } catch {
    /* fall through */
  }
  const download = (window as unknown as {
    ksu_download?: { openExternal?: (href: string) => void };
  }).ksu_download;
  if (download && typeof download.openExternal === "function") {
    download.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}

export function toastHost(msg: string): void {
  try {
    if (isHost && typeof host.toast === "function") host.toast(msg);
  } catch {
    /* ignore */
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export async function moduleVersion(): Promise<string> {
  if (!isHost) return APP_VERSION;
  try {
    if (typeof host.moduleInfo === "function") {
      const r = await maybe(host.moduleInfo());
      const o = typeof r === "string" ? JSON.parse(r) : r;
      if (o?.version) return String(o.version);
    }
  } catch {
    /* ignore */
  }
  const version = await exec(`sed -n 's/^version=//p' ${q(`${MODULE_DIR}/module.prop`)} 2>/dev/null`);
  return version.trim() || "未知";
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function safeSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
