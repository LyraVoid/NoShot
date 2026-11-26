<img src="assets/icon.png" alt="NoShot" width="420">

# NoShot Zygisk

由 **Matsuzaka Yuki 和 LyraVoid** 开发。

[English](README.md) · 简体中文

NoShot Zygisk 按应用解除截屏限制（`FLAG_SECURE`），让你勾选的应用重新可以截图和录屏。
勾选的应用由 `system_server` 处理：窗口服务端不再把它们的图层标记为安全，应用进程本身一行代码都不改。

- **原生**：Zig，单个 ABI 约 50 KB，零 `DT_NEEDED`，不内嵌 ART hook 引擎与 dex。
- **WebUI**：React 19 + Mantine 8 + Material 3 Expressive 组件，打包成单个
  `index.html`，支持中文、English、日本語。
- **配置**：`allow.list` 与 `settings.conf`；保存时会重新解析选择，新窗口立即生效，不用重启。

## 功能

- 按应用解除截屏限制，被选应用进程零改动。
- 每个应用可选两种处理方式：`system`（默认，`system_server`）与 `client`（应用内 binder hook），
  在 WebUI 的应用行里切换。
- `client` 同时覆盖 `SurfaceControl` 的 `Transaction.setSecure` 与
  `Builder.setSecure(true)` 创建参数里的 `SECURE`。
- 可选：拒绝截图目录的 `inotify` 监视（需要 API v4 宿主）。
- 开机循环保护：连续两次未能正常完成开机，系统侧会自动停用。
- WebUI：应用勾选（搜索、分身筛选）、每行的处理方式菜单、显示当前生效方式的状态卡、
  运行日志、诊断信息、配色与语言。

## 运行要求与安装

- 已 root，且管理器具备 Zygisk 能力（Magisk、KernelSU、APatch 或兼容实现）。
- 通过管理器安装模块 ZIP，重启一次让宿主枚举到它。
- 打开模块 WebUI，勾选应用并保存。选择会立刻写入 `/data/system/noshot_plan`，之后新建的窗口即按新配置处理。

模块更新会替换 `zygisk/*.so`，同样需要重启；只改 WebUI 时直接热替换文件，重开 WebUI 即可。

## 工作原理

```
Window.setFlags(FLAG_SECURE)
  → WindowManager.layout
  → WindowState.isSecureLocked() = true
  → SurfaceControl.Transaction.setSecure(layer, true)
  → SurfaceControl.nativeSetFlags(t, layer, SECURE, SECURE)   ← system_server
        └── 图层属于已选应用时清掉这一位
  → 图层从未被标记为安全，截图能拿到画面
```

图层在创建时确定归属（`SurfaceControl.nativeCreate`），顺序是：

1. metadata Parcel 里的 `METADATA_OWNER_UID`（键 `1`，由 `WindowStateAnimator` 从应用的 `Session` 写入）；
2. 否则沿用父图层的归属；
3. 否则看图层名（`<包名>/<Activity>`）。

三条都不可信时不动这个图层：不靠猜测清除任何标记。

`client` 方式保留应用内路径：`BinderProxy.transactNative` 清掉 `addToDisplay*` / `relayout*`
里 `LayoutParams` 的第 13 位，`SurfaceControl.nativeCreate` / `nativeSetFlags` 清掉 `SECURE`。

## 配置

| 路径 | 用途 |
| --- | --- |
| `/data/adb/noshot_zygisk/allow.list` | 目标应用与各自的处理方式 |
| `/data/adb/noshot_zygisk/settings.conf` | 行为开关与日志 |
| `/data/system/noshot_plan` | 供 `system_server` 读取的选择（自动生成） |
| `/data/adb/noshot_zygisk/mode` | 系统侧报告的处理方式（自动生成） |
| `/data/system/noshot_state` | 系统侧的启动决策记录（自动生成，最多 8 KB） |

```
# noshot:2:2
# ui:com.example.app|u0
com.example.app
com.example.bank|u999|client
```

`# noshot:<ver>:<n>` 记录本次写入的条目数，写一半的文件会被判为无效。`#` 开头的行原生侧一律忽略。
数据行可以是 `pkg`、`pkg|u<id>`、`pkg|client` 或 `pkg|u<id>|client`：

- `system`（默认）：在 `system_server` 里处理，应用进程保持干净；
- `client`：在应用进程里处理，给自建 secure `SurfaceControl` 或依赖 binder 清除的应用。

`system_server` 读不了 `/data/adb`，所以由 root 侧脚本 `plan.sh` 把选择解析成
`/data/system/noshot_plan`，再把系统侧报告的处理方式抄到 `/data/adb/noshot_zygisk/mode` 给应用进程看。
在 WebUI 里保存就会执行 `plan.sh`，新配置对下一个窗口生效；不支持开机执行模块脚本的宿主会沿用它最后一次保存的 plan。

```
flag_secure=1       # client：在 binder 事务里清 FLAG_SECURE
surface_secure=1    # client：SurfaceControl SECURE / SKIP_SCREENSHOT
detect_guard=1      # client：拒绝截图目录的 inotify 监视
system_hook=1       # system：在 system_server 里处理
log=1               # 写日志（tag: NoShot）
```

回退开关，不需要重装：

| 路径 | 作用 |
| --- | --- |
| `system_hook=0` | 关闭系统侧，所有已选应用改走应用内 hook |
| `/data/adb/noshot_zygisk/disable_system` | 同上，不用改配置 |
| `/data/system/noshot_disable` | 连续两次开机失败后由模块自己写入 |

## 构建

- Zig **0.17.1** — 版本写在 `.zigversion`，`scripts/build.sh` 会校验；Zig 未到 1.0，
  小版本之间也可能破坏构建。
- Node.js **22+**（WebUI）。
- `zip`，缺失时脚本退回 Python 打包。

```bash
git clone https://github.com/LyraVoid/NoShot.git
cd NoShot
./scripts/build.sh --test
# build/noshot_zygisk_v2.0.0.zip
```

只编译原生部分：

```bash
zig build                 # 四个 ABI → zig-out/zygisk/*.so
SKIP_WEB=1 ./scripts/build.sh
```

## 技术说明

- 模块不声明任何动态依赖：日志直接写 logd socket，`getauxval` 本地实现，
  裸映射加载器不需要解析符号也能装载。
- 系统侧热路径不做分配：固定容量的开地址哈希把图层 handle 映射到属主 uid，
  选择文件只隔几秒重读一次。
- hook 内的 JNI 调用都是只读的；任何异常先清除再原样调用原实现。
- Parcel 偏移按实测机型固定；布局不同则校验失败、事务原样发出，不会写坏数据。
- 四个 ABI 的 `nm -D --undefined-only` 均为空。

## 已知边界

1. 不处理 Android 14+ 的 `registerScreenCaptureCallback` 检测；原生出站事务改写这条路线会先单独验证，
   通得过就不再考虑 ART 层。
2. `Builder.setSecure(true)` 由 `client` 方式覆盖；`system` 方式只覆盖 `WindowManager` 创建的图层，
   应用自己创建的表面不在其职责内。
3. 应用自己读取 `getAttributes().flags` 仍能看到 `FLAG_SECURE`。这是有意为之：应用看到的就是它自己设的值。
4. 系统侧按图层属主 uid 生效，只作用于你勾选的应用；应用进程保持原样。
5. 应用名依赖宿主接口；宿主不提供时显示包名。
6. DRM 保护内容（Widevine 一类）仍是黑屏，那部分内容不经过本模块处理的图层。
7. 宿主不注入 `system_server` 时，报告的处理方式会停在 `client`，已选应用退回应用内 hook
   （除非 `flag_secure=0`）。

## 从 1.0 升级

1.0 的 `allow.list` 可以直接沿用，所有条目视为 `system`。原来只能靠应用内 hook 生效的应用
（自建 secure `SurfaceControl`，或需要 binder 级清除的），升级后可能失效，在应用列表里把那几行切回
`client` 即可。首页会显示当前实际生效的处理方式。

## 已验证

OnePlus 13T / Android 17（API 37）/ arm64，Zygisk API v4 宿主：

- 开机后 `system_server` 内 hook 安装成功，已选应用图层不再带安全标记，`screencap` 能拿到真画面，
  该应用进程报告 `hooks=0`（进程内什么都没装）；
- 未选应用仍是 `(Secure)`，截图仍是黑屏；
- 同一次开机里 `client` 与 `system` 两种模式可同时工作；
- `system_hook=0` 时全部退回应用内 hook；
- 改配置后新建窗口即生效，无需重启。

## 许可

AGPL-3.0，见 [LICENSE](LICENSE)。

请勿将本项目用于绕过 DRM、盗录付费内容或违反应用服务条款的场景。
