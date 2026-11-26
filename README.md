<img src="assets/icon.png" alt="NoShot" width="420">

# NoShot Zygisk

Developed by **Matsuzaka Yuki and LyraVoid**.

English · [简体中文](README.zh-CN.md)

NoShot Zygisk removes the per-app capture restriction (`FLAG_SECURE`) for the
apps you choose, so screenshots and screen recording work again. Selected apps
are handled inside `system_server`: the window server stops marking their layers
as secure, and the app process is not modified at all.

- **Native** — Zig, about 50 KB per ABI, no `DT_NEEDED` entries, no ART hooking
  engine and no embedded dex.
- **WebUI** — React 19 and Mantine 8 with Material 3 Expressive components,
  bundled into a single `index.html`, available in Chinese, English and Japanese.
- **Config** — `allow.list` and `settings.conf`; the selection is re-resolved on
  save, so it applies to the next window without a reboot.

## Features

- Per-app capture unblocking with zero changes to the target app process.
- Two patch sides per app: `system` (default, `system_server`) and `client`
  (in-process binder hook), selectable per row in the WebUI.
- `client` also covers `SurfaceControl` `SECURE` in both `Transaction.setSecure`
  and `Builder.setSecure(true)` creation flags.
- Optional guard against screenshot-directory `inotify` watches (API v4 hosts).
- Optional suppression of the Android 14+ capture/recording detection callbacks
  (`capture_guard`), with an observe-only level that only counts them.
- Boot-loop guard: three quick hook installs in one boot, with no healthy
  uptime in between, disable the system side by themselves. A deliberate
  `ctl.restart zygote` after a minute of uptime resets the count.
- WebUI: app picker with search and dual-app filter, a separate screen for the
  per-app patch side, status card with the active side, runtime log console,
  diagnostics, theme and language.

## Requirements and installation

- Root with a Zygisk-capable manager (Magisk, KernelSU, APatch or a compatible
  implementation).
- Install the module ZIP through the manager and reboot once so the host
  enumerates it.
- Open the module WebUI, select apps and save. The selection is written to
  `/data/system/noshot_plan` immediately; new windows are handled from then on.

A module update replaces `zygisk/*.so`, so it also needs a reboot. WebUI-only
changes are served from disk and need nothing more than reopening the WebUI.

## How it works

```
Window.setFlags(FLAG_SECURE)
  → WindowManager.layout
  → WindowState.isSecureLocked() = true
  → SurfaceControl.Transaction.setSecure(layer, true)
  → SurfaceControl.nativeSetFlags(t, layer, SECURE, SECURE)   ← system_server
        └── cleared when the layer belongs to a selected app
  → the layer is never marked secure, screenshots capture the frame
```

Layers are attributed once, when they are created
(`SurfaceControl.nativeCreate`):

1. the metadata parcel (`METADATA_OWNER_UID`, key `1`) written by
   `WindowStateAnimator` from the app's `Session`;
2. otherwise the parent layer, whose owner is already known;
3. otherwise the layer name (`<pkg>/<activity>`).

A layer with no trustworthy owner is left alone: nothing is cleared by guesswork.

The `client` mode keeps the in-process path: `BinderProxy.transactNative` clears
bit 13 of the `LayoutParams` carried by `addToDisplay*` / `relayout*`, and
`SurfaceControl.nativeCreate` / `nativeSetFlags` clear `SECURE` there.

## Configuration

| Path | Purpose |
| --- | --- |
| `/data/adb/noshot_zygisk/allow.list` | Target apps and their patch side |
| `/data/adb/noshot_zygisk/settings.conf` | Behavior switches and logging |
| `/data/system/noshot_plan` | Selection resolved for `system_server` (generated) |
| `/data/adb/noshot_zygisk/mode` | Side the system hook reported (generated) |
| `/data/system/noshot_state` | Boot-time decisions of the system side (generated, first 8 KB) |
| `/data/system/noshot_guard` | Capture-callback state: `on` / `observe` / `off` / `unsupported` (generated) |

```
# noshot:2:2
# ui:com.example.app|u0
com.example.app
com.example.bank|u999|client
```

The `# noshot:<ver>:<n>` line records how many entries were written, so a
truncated write is rejected. Lines starting with `#` are ignored by the native
side. A data line is `pkg`, `pkg|u<id>`, `pkg|client` or `pkg|u<id>|client`:

- `system` (default) — handled in `system_server`, the app process stays clean;
- `client` — handled inside the app process, for apps that also create their own
  secure `SurfaceControl` or need the binder-level clear.

`system_server` cannot read `/data/adb`, so the root scripts resolve the
selection into `/data/system/noshot_plan` (`plan.sh`) and copy the reported side
into `/data/adb/noshot_zygisk/mode` for the app processes. Saving in the WebUI
runs `plan.sh`, so a change applies to the next window; hosts that do not run
module scripts at boot keep the plan written by the last save.

```
flag_secure=1       # client mode: clear FLAG_SECURE in the binder parcel
surface_secure=1    # client mode: SurfaceControl SECURE / SKIP_SCREENSHOT
detect_guard=1      # client mode: refuse inotify watches on screenshot dirs
system_hook=1       # system mode: patch in system_server
capture_guard=0     # system mode: 0, observe (count only) or 1 (hide the notices)
log=1               # write logs (tag: NoShot)
```

Recovery switches, no reinstall needed:

| Path | Effect |
| --- | --- |
| `system_hook=0` | system side off, every selected app uses the in-process hook |
| `/data/adb/noshot_zygisk/disable_system` | same, without editing the config |
| `/data/system/noshot_disable` | written by the module itself after three quick failed starts in one boot |

## Build

- Zig **0.17.1** — pinned in `.zigversion` and checked by `scripts/build.sh`;
  Zig is pre-1.0 and minor releases can break the build.
- Node.js **22+** for the WebUI.
- `zip`, or Python as the fallback packer.

```bash
git clone https://github.com/LyraVoid/NoShot.git
cd NoShot
./scripts/build.sh --test
# build/noshot_zygisk_v2.0.0.zip
```

Native only:

```bash
zig build                 # four ABIs → zig-out/zygisk/*.so
SKIP_WEB=1 ./scripts/build.sh
```

## Technical notes

- The module declares no dynamic dependencies: logs go straight to the logd
  socket and `getauxval` is provided locally, so a bare-mapping loader can map
  it without resolving symbols.
- The system hook allocates nothing on the hot path: a fixed open-addressing
  table maps layer handles to owning uids, and the plan file is only re-read
  every couple of seconds.
- JNI calls from the hook are read-only; every failure clears the pending
  exception and falls through to the original method.
- Parcel offsets are fixed for the tested ROM; a different layout fails
  validation and the transaction is passed through unchanged.
- `nm -D --undefined-only` is empty on all four ABIs.

## Known limits

1. Android 14+ `registerScreenCaptureCallback` detection is covered only by
   `capture_guard` on the system side: the callback transactions are recognised
   by their interface token and, at level `1`, dropped before they leave
   system_server. It is off by default, and the levels are `0` (off),
   `observe` (count in the log and the state file, change nothing) and `1`
   (hide the notices). A parcel layout the build does not recognise passes
   through unchanged. It applies to the whole system, not per app: the callback
   parcel carries the target binder but not the target app's identity. The hook
   is installed at boot, so turning it on from `0` needs a framework restart
   (`setprop ctl.restart zygote`); switching between `observe` and `1` takes
   effect on the next callback. No ART hooking is involved.
2. `Builder.setSecure(true)` is covered by `client` mode. In `system` mode only
   the layers `WindowManager` creates are covered; surfaces an app creates for
   itself are outside that scope.
3. An app reading its own `getAttributes().flags` still sees `FLAG_SECURE`.
   That is deliberate: the app sees exactly what it set, which is what "not
   touched" looks like.
4. The system side works per surface owner uid, so it acts only on the apps you
   select; the app process stays unmodified.
5. App names come from the host; without that interface the package name is
   shown.
6. DRM-protected video (Widevine and similar) stays black — that content is not
   composited through the layers this module touches.
7. If a host does not inject `system_server`, the reported side stays `client`
   and selected apps fall back to the in-process hook (unless
   `flag_secure=0`).

## Upgrading from 1.0

`allow.list` from 1.0 keeps working and every entry becomes `system` mode. Apps
that only worked through the in-process hook (they create their own secure
`SurfaceControl`, or need the binder-level clear) may stop working after the
upgrade; switch those rows to `client` in the app list. The home page shows the
side that is actually active.

## Tested

OnePlus 13T, Android 17 (API 37), arm64, Zygisk API v4 host:

- `system_server` hooks installed at boot, selected app's layer no longer
  secure, `screencap` returns the real frame, and the app process reports
  `hooks=0` (nothing installed there);
- an unselected app stays `(Secure)` and its capture is black;
- `client` mode and `system` mode run side by side in one boot session;
- `system_hook=0` falls back to the in-process hook for every selected app;
- config edits apply to the next window without a reboot.

The capture-callback guard (`capture_guard`), all on the same device:

| Level | Screenshot taken with VOLUME_DOWN + POWER | Recording started from another app |
| --- | --- | --- |
| `0` | app's `onScreenCaptured` fires | app's `onScreenRecordingStateChanged(true)` fires |
| `observe` | fires, and the module records `capture n=…` | fires, and the module records `recording … visible=1` |
| `1` | does **not** fire (three shots in a row, count stayed at 0) | does **not** fire, while `dumpsys window` still reports the uid as visible in the recording |

Switching between `0` and `1` through `plan.sh` alone leaves the hook unchanged
(`/data/system/noshot_guard` reports `restart`); `setprop ctl.restart zygote`
applies it. An install after a restart is not counted by the loop guard, and the
fuse written by three quick retries during development was cleared by hand.

## License

AGPL-3.0, see [LICENSE](LICENSE).

Do not use this project to bypass DRM, record paid content, or violate an app's
terms of service.
