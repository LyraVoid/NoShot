<img src="assets/icon.png" alt="NoShot" width="96" height="96">

# NoShot Zygisk

Developed by **Matsuzaka Yuki and LyraVoid**.

English · [简体中文](README.zh-CN.md)

NoShot Zygisk removes the per-app capture restriction (`FLAG_SECURE`) for the
apps you choose, so screenshots and screen recording work again. The bit is
cleared in the outgoing binder transaction, which means the window server never
sees the window as protected.

- **Native** — Zig, about 29 KB per ABI, no `DT_NEEDED` entries, no ART hooking
  engine and no embedded dex.
- **WebUI** — React 19 and Mantine 8 with Material 3 Expressive components,
  bundled into a single `index.html`, available in Chinese, English and Japanese.
- **Config** — `allow.list` and `settings.conf`, read per process; changes apply
  the next time the app starts.

## Features

- Per-app capture unblocking; every other window flag is left untouched.
- Optional suppression of `SurfaceControl` `SECURE` / `SKIP_SCREENSHOT` flags.
- Optional guard against screenshot-directory `inotify` watches (API v4 hosts).
- Non-target processes unload the module right after specialization.
- WebUI: app picker with search and dual-app filter, status card, runtime log
  console, diagnostics, theme and language.

## Requirements and installation

- Root with a Zygisk-capable manager (Magisk, KernelSU, APatch or a compatible
  implementation).
- Install the module ZIP through the manager and reboot once so the host
  enumerates it.
- Open the module WebUI, select apps and save. Stop the apps from the home page
  (or open them again) to pick up the new selection.

A module update replaces `zygisk/*.so`, so it also needs a reboot. WebUI-only
changes are served from disk and need nothing more than reopening the WebUI.

## How it works

```
Window.setFlags(FLAG_SECURE)
  → WindowManager.layout
  → BinderProxy.transactNative        ← intercepted here
  → IWindowSession parcel
       int32 1, width, height, x, y, type, flags
                                        └── clears bit 13 (0x2000)
  → the window server never marks the window as protected
```

Only `addToDisplay*` and `relayout*` transactions carry a `LayoutParams`; the
hook validates `width/height/x/y/type/flags` before writing and sends the parcel
unchanged when anything does not match.

## Configuration

| Path | Purpose |
| --- | --- |
| `/data/adb/noshot_zygisk/allow.list` | Target apps |
| `/data/adb/noshot_zygisk/settings.conf` | Behavior switches and logging |
| `/data/adb/modules/noshot_zygisk/allow.list` | Fallback location |

```
# noshot:1:2
# ui:com.example.app|u0
com.example.app
com.example.bank
```

The `# noshot:<ver>:<n>` line records how many entries were written, so a
truncated write is rejected by the WebUI. Lines starting with `#` are ignored by
the native side; `pkg|u999` limits an entry to one Android user.

```
flag_secure=1       # clear FLAG_SECURE in the binder parcel
surface_secure=1    # SurfaceControl SECURE / SKIP_SCREENSHOT
detect_guard=1      # refuse inotify watches on screenshot directories
log=1               # write logs (tag: NoShot)
```

## Build

- Zig **0.17.1** — pinned in `.zigversion` and checked by `scripts/build.sh`;
  Zig is pre-1.0 and minor releases can break the build.
- Node.js **22+** for the WebUI.
- `zip`, or Python as the fallback packer.

```bash
git clone https://github.com/LyraVoid/NoShot.git
cd NoShot
./scripts/build.sh --test
# build/noshot_zygisk_v1.0.0.zip
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
- Parcel offsets are fixed for the tested ROM; a different layout fails
  validation and the transaction is passed through unchanged.
- `nm -D --undefined-only` is empty on all four ABIs.

## Known limits

1. Android 14+ `registerScreenCaptureCallback` detection is not covered.
2. Surfaces created with `SurfaceControl.Builder.setSecure(true)` are not
   handled.
3. An app reading its own `getAttributes().flags` still sees `FLAG_SECURE`.
4. `system_server` is never modified; patches are per app.
5. App names come from the host; without that interface the package name is
   shown.

## Tested

OnePlus 13T, Android 17 (API 37), arm64, Zygisk API v4 host: module load,
target matching, three hooks installed, and the target window's `FLAG_SECURE`
cleared so system screenshots capture the frame.

## License

AGPL-3.0, see [LICENSE](LICENSE).

Do not use this project to bypass DRM, record paid content, or violate an app's
terms of service.
