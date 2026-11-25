<img src="assets/icon.png" alt="NoShot" width="420">

# NoShot Zygisk

由 **Matsuzaka Yuki 和 LyraVoid** 开发。

[English](README.md) · 简体中文

NoShot Zygisk 按应用解除截屏限制（`FLAG_SECURE`），让你勾选的应用重新可以截图和录屏。
这一位是在发往窗口服务的 binder 事务里清掉的，窗口服务端从一开始就不知道窗口受保护。

- **原生**：Zig，单个 ABI 约 29 KB，零 `DT_NEEDED`，不内嵌 ART hook 引擎与 dex。
- **WebUI**：React 19 + Mantine 8 + Material 3 Expressive 组件，打包成单个
  `index.html`，支持中文、English、日本語。
- **配置**：`allow.list` 与 `settings.conf`，每个进程启动时读取；改完下次打开应用生效。

## 功能

- 按应用解除截屏限制，窗口的其它 flag 一律不动。
- 可选：屏蔽 `SurfaceControl` 的 `SECURE` / `SKIP_SCREENSHOT` 标志。
- 可选：拒绝截图目录的 `inotify` 监视（需要 API v4 宿主）。
- 非目标进程在 specialization 结束后立即卸载模块。
- WebUI：应用勾选（搜索、分身筛选）、状态卡、运行日志、诊断信息、配色与语言。

## 运行要求与安装

- 已 root，且管理器具备 Zygisk 能力（Magisk、KernelSU、APatch 或兼容实现）。
- 通过管理器安装模块 ZIP，重启一次让宿主枚举到它。
- 打开模块 WebUI，勾选应用并保存。到首页「停止所选应用」或手动重新打开应用即可生效。

模块更新会替换 `zygisk/*.so`，同样需要重启；只改 WebUI 时直接热替换文件，重开 WebUI 即可。

## 工作原理

```
Window.setFlags(FLAG_SECURE)
  → WindowManager.layout
  → BinderProxy.transactNative        ← 在这里拦截
  → IWindowSession Parcel
       int32 1, width, height, x, y, type, flags
                                        └── 清掉第 13 位（0x2000）
  → 窗口服务端不认为窗口受保护
```

只有 `addToDisplay*` 与 `relayout*` 事务带 `LayoutParams`；写入前会校验
`width/height/x/y/type/flags`，任何一项对不上就原样放行。

## 配置

| 路径 | 用途 |
| --- | --- |
| `/data/adb/noshot_zygisk/allow.list` | 目标应用 |
| `/data/adb/noshot_zygisk/settings.conf` | 行为开关与日志 |
| `/data/adb/modules/noshot_zygisk/allow.list` | 回退路径 |

```
# noshot:1:2
# ui:com.example.app|u0
com.example.app
com.example.bank
```

`# noshot:<ver>:<n>` 记录本次写入的条目数，写一半的文件会被 WebUI 判为无效。
`#` 开头的行原生侧一律忽略；`pkg|u999` 表示只对某个 Android 用户生效。

```
flag_secure=1       # 在 binder 事务里清 FLAG_SECURE
surface_secure=1    # SurfaceControl SECURE / SKIP_SCREENSHOT
detect_guard=1      # 拒绝截图目录的 inotify 监视
log=1               # 写日志（tag: NoShot）
```

## 构建

- Zig **0.17.1** — 版本写在 `.zigversion`，`scripts/build.sh` 会校验；Zig 未到 1.0，
  小版本之间也可能破坏构建。
- Node.js **22+**（WebUI）。
- `zip`，缺失时脚本退回 Python 打包。

```bash
git clone https://github.com/LyraVoid/NoShot.git
cd NoShot
./scripts/build.sh --test
# build/noshot_zygisk_v1.0.0.zip
```

只编译原生部分：

```bash
zig build                 # 四个 ABI → zig-out/zygisk/*.so
SKIP_WEB=1 ./scripts/build.sh
```

## 技术说明

- 模块不声明任何动态依赖：日志直接写 logd socket，`getauxval` 本地实现，
  裸映射加载器不需要解析符号也能装载。
- Parcel 偏移按实测机型固定；布局不同则校验失败、事务原样发出，不会写坏数据。
- 四个 ABI 的 `nm -D --undefined-only` 均为空。

## 已知边界

1. 不处理 Android 14+ 的 `registerScreenCaptureCallback` 检测。
2. 不处理 `SurfaceControl.Builder.setSecure(true)` 创建时就带 SECURE 的表面。
3. 应用自己读取 `getAttributes().flags` 仍能看到 `FLAG_SECURE`。
4. 不修改 `system_server`，补丁都按应用生效。
5. 应用名依赖宿主接口；宿主不提供时显示包名。

## 已验证

OnePlus 13T / Android 17（API 37）/ arm64，Zygisk API v4 宿主：模块加载、目标匹配、
三个 hook 安装成功，目标窗口的 `FLAG_SECURE` 被清除，系统截图可以拿到画面。

## 许可

AGPL-3.0，见 [LICENSE](LICENSE)。

请勿将本项目用于绕过 DRM、盗录付费内容或违反应用服务条款的场景。
