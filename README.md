# NoShot Zygisk

按应用解除截屏限制的 Zygisk 模块。名字是 no + shot：不许拍。

- **原生**：Zig，约 29 KB / ABI，零 `DT_NEEDED`，不内嵌 ART hook 引擎或 dex；
- **原理**：在 `IWindowSession` 的 binder 事务里清除 `FLAG_SECURE`，不 hook ART；
- **前端**：React 19 + Mantine 8 + Material 3 Expressive（M3E），单文件 WebUI；
- **兼容**：Zygisk API v4 优先，失败时自动回退 v3；覆盖安装会保留配置。

需要 root 与 Zygisk（KernelSU / Magisk / APatch，或独立的 Zygisk 实现）。

## 功能

- 按应用解除截屏 / 录屏限制（`FLAG_SECURE`）。
- 可选：屏蔽 `SurfaceControl` 的 `SECURE` / `SKIP_SCREENSHOT` 标志。
- 可选：拒绝 `/screenshots` 目录的 `inotify` 监视（需要 API v4 宿主）。
- 非目标进程在 `postAppSpecialize` 后卸载模块，内存占用可忽略。
- WebUI：应用勾选、搜索、分身筛选、配色、运行状态、logcat 日志与诊断。

## 构建

依赖：

- Zig **0.17.1**（版本写在 `.zigversion`，`scripts/build.sh` 会校验；Zig 尚未发布 1.0，
  小版本之间也会破坏构建，跨版本编译请自行确认）
- Node.js **22+**（WebUI：Mantine 8 / Vite 8）
- `zip`（缺失时脚本退回 Python 打包）

```bash
git clone https://github.com/LyraVoid/NoShot.git
cd NoShot

./scripts/build.sh --test
# 产物：build/noshot_zygisk_v1.0.0.zip
```

只重新编译原生部分：

```bash
zig build                 # 4 个 ABI → zig-out/zygisk/*.so
SKIP_WEB=1 ./scripts/build.sh
```

## 安装

1. 把 zip 推到手机并安装：

   ```bash
   ./scripts/push-device.sh
   ```

   在 KernelSU / Magisk / APatch 管理器中刷入，重启。

2. 打开模块 WebUI，勾选需要解除限制的应用，保存。
3. 停止该应用再重新打开。

也可以直接写配置：

```bash
adb shell su -c "mkdir -p /data/adb/noshot_zygisk"
adb shell su -c "printf '# noshot:1:1\ncom.example.app\n' > /data/adb/noshot_zygisk/allow.list"
```

卸载或禁用模块并重启即可恢复；禁用不会删除 `/data/adb/noshot_zygisk` 里的配置。

## 目录结构

```
build.zig / build.zig.zon     Zig 构建（4 ABI、单元测试、selftest）
src/
  root.zig                    Zygisk 入口、生命周期、配置加载、companion
  api.zig                     Zygisk 模块 ABI
  jni.zig                     最小 JNI 绑定（不依赖 NDK 头）
  parcel.zig                  IWindowSession 事务与 FLAG_SECURE 清洗
  surface.zig                 SurfaceControl.nativeSetFlags
  inotify.zig                 PLT hook inotify_add_watch
  config.zig                  allow.list / settings.conf 解析（含单测）
  fs.zig                      无 libc 的文件系统调用
  log.zig                     logd 日志输出
  aux.zig                     本地 getauxval
  selftest.zig                真机解析 selftest
module/                       Magisk / KernelSU 模块模板
web/                          React + Mantine 8 + M3E WebUI
  src/m3e/                    M3E 组件、主题 token 与 Shell
scripts/                      构建与推送脚本
```

## 工作原理

```
Window.setFlags(FLAG_SECURE)
  → WindowManagerGlobal.relayout()
  → BinderProxy.transactNative        ← 在这里拦截
  → IWindowSession Parcel
       int32 1, width, height, x, y, type, flags
                                        └── 清掉第 13 位（0x2000）
  → system_server 认为窗口不敏感
  → 截图 / 录屏正常
```

只改写 `addToDisplay*` 与 `relayout*` 这几条带 `LayoutParams` 的事务，写入前校验
`width/height/x/y/type/flags`，对不上就原样放行（fail-closed）。字段偏移与两种
Parcel 布局见 `src/parcel.zig` 顶部的说明。

## 配置

| 路径 | 用途 |
| --- | --- |
| `/data/adb/noshot_zygisk/allow.list` | 目标应用列表 |
| `/data/adb/noshot_zygisk/settings.conf` | 行为开关与日志 |
| `/data/adb/modules/noshot_zygisk/allow.list` | 回退路径 |

`allow.list`：

```
# noshot:1:2
# ui:com.example.app|u0
com.example.app
com.example.bank
```

`# noshot:<ver>:<n>` 记录本次写入的条目数（含 `# ui:` 行）；数量对不上说明写入被截断，
WebUI 会判为无效并回退本地副本。`# ui:` 行只给 WebUI 用，原生跳过所有 `#` 行。
支持 `pkg|u999` 表示仅指定用户。

`settings.conf`：

```
flag_secure=1       # binder 层清 FLAG_SECURE
surface_secure=1    # SurfaceControl SECURE / SKIP_SCREENSHOT
detect_guard=1      # 拒绝 /screenshots 的 inotify
log=1               # logcat 输出（tag: NoShot）
```

修改后重启目标应用生效。

## WebUI 开发

```bash
cd web
npm install
npm run dev      # 浏览器预览（演示模式）
npm run build    # 单文件 dist/index.html
```

组件与主题都在 `web/src/m3e/`：`FlexiblePageHeader`、`SettingsList` / `SettingsRow`、
`SegmentedSection`、`FactRow`、`ExpressiveSwitch`、`ChoiceMenu`、`ActionMenu`、`Icon`，
色板由 `@material/material-color-utilities` 生成，默认跟随系统明暗、蓝灰、2025 Tonal Spot。

四个页面：首页（`/`）、应用（`/apps`）、日志（`/logs`）、设置（`/settings`）。

## 设计取舍

| | ART hook 方案 | NoShot |
| --- | --- | --- |
| 原生语言 | C++ | Zig |
| 每个 ABI 体积 | 约 613 KB | 约 29 KB |
| ART hook | 方法 hook + 内嵌 dex | 无 |
| 内联 hook | 自带引擎 | 宿主 PLT + JNI native hook |
| 依赖 | liblog / libdl / libc / libm、libc++、libunwind | 无 |
| 生效时机 | 调用发生时改参数 | 进入窗口服务前清位 |

## 已知边界

1. 不屏蔽 Android 14+ 的 `registerScreenCaptureCallback` 检测。
2. 不处理 `SurfaceControl.Builder.setSecure(true)` 创建时就带 SECURE 的表面。
3. 应用自己读取 `getAttributes().flags` 仍会看到 `FLAG_SECURE`（只改了发给
   system_server 的副本）。
4. 不修改 `system_server`，不影响其它应用。
5. 应用名依赖宿主 `getPackagesInfo`；宿主不提供时显示包名。

## 已验证

OnePlus 13T / Android 17（API 37）/ arm64，Zygisk API v4 宿主：

- 模块加载、目标匹配、三个 hook 安装；
- 目标应用窗口的 `FLAG_SECURE` 被清除，系统截图可正常获取画面；
- 四个 ABI 的 `nm -D --undefined-only` 为空；
- 配置解析单测 8/8。

## 作者与许可

- 作者：**Matsuzaka Yuki** · **LyraVoid**
- 以 AGPL-3.0 发布，见 [LICENSE](LICENSE)。

请勿将本项目用于绕过 DRM、盗录付费内容或违反应用服务条款的场景。
