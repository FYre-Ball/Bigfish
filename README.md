# Bigfish

> ⚠️ **非官方声明**：Bigfish 是独立的第三方社区项目，基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT 协议）构建，**非 DeepSeek 官方出品**，与 DeepSeek 无隶属、赞助或背书关系。

Bigfish 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Electron 桌面版：把 `dsh web` 的本地后端 + React UI 包进一个原生窗口，并加上系统托盘、全局快捷键、桌面萌宠、新手向导等桌面原生能力，免去开终端、记端口、开浏览器。

## 开发运行

```bash
npm install
npm start
```

> 中国大陆网络若 electron 二进制下载失败，先设置镜像再重装：
>
> ```bash
> set ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/
> npm install
> ```

## 打包

`npm run dist:win` 会先自动执行 `predist:win` 前置检查（`prepare-pack.js`：补齐 `node-runtime/` 与 `dsh-bundle` 依赖），之后开始打包。**改完代码直接跑这一条命令即可**：

```bash
npm run dist:win      # Windows NSIS 安装包（dist\Bigfish Setup x.y.z.exe）
npm run dist:mac      # macOS dmg（需在 macOS 上构建）
npm run dist:linux    # Linux AppImage + deb（需在 Linux 上构建）
```

产物输出到 `dist/`。

> 中国大陆网络若下载慢，打包前设置镜像：
>
> ```bash
> set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
> set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> ```

> 原生依赖（node-pty / sharp / koffi 等）需在各自目标平台上构建，跨平台产物请在对应平台的机器或 CI 上打包。

## 发版检查清单

每次发新版按顺序做：

1. **改版本号**:只改 `package.json` 的 `version`(如 `0.1.0` → `0.1.1`)。安装包文件名、exe 版本信息、NSIS 升级判断都会自动跟着变,无需再改其他文件。
2. **本地调试**:`npm start` 验证改动。
3. **打包**:`npm run dist:win`(前置检查自动运行)。
4. **自测安装**:双击 `dist\Bigfish Setup x.y.z.exe` 覆盖安装,重点试托盘右键菜单和新改动。
5. **发布**:上传 exe 到 GitHub Releases(单文件 174MB+,GitHub Releases 上限 2GB,不要传仓库)。

### 版本号注意

- `afterPack.js` 自动从 `package.json` 读取版本号并嵌入 exe,不要再手改。
- 发版前必须 bump 版本号,否则新旧安装包同名,用户分不清版本。

## 图标 & 萌宠

- 应用图标源图：`build/icon_background_removed.png`（透明背景 512×512）
- 图标产物：`build/icon.png`、`build/icon.ico`、`assets/tray.png`
- 重新生成图标：`npm run icons`
- 萌宠动画帧：`assets/pet/`（`idle` / `eat-1..4` / `walk-left-1..2` / `walk-right-1..2` / `sleep`）

**替换成自己的萌宠形象**：直接把 `assets/pet/` 里的 PNG 换成你的角色帧即可（保持文件名对应状态）。若原图是白底 JPG，可用 `node remove-pet-bg.js` 抠背景。

打包时 `afterPack.js` 会用 `build/rcedit-x64.exe` 把图标和版本信息嵌入 exe（绕开 electron-builder 内置 winCodeSign 在 Windows 上因 macOS dylib 符号链接权限失败的问题，见 [electron-builder#8149](https://github.com/electron-userland/electron-builder/issues/8149)）。

## 常见问题（FAQ）

### 第一次启动为什么比较慢？需要联网吗？

需要联网。dsh 首次启动时会自动初始化 web profile，从 npm 仓库下载一批依赖（约几十~上百 MB，取决于网络）。初始化完成后会缓存在 `~/.dsh`，之后启动不再下载。

### 国内网络下初始化失败或特别慢怎么办？

dsh 初始化依赖走 pnpm，会读取你的 npm 配置。先把 npm 源切到国内镜像再重试：

```bash
npm config set registry https://registry.npmmirror.com
```

若公司/校园网需要代理，同时设置：

```bash
npm config set proxy http://127.0.0.1:<你的代理端口>
npm config set https-proxy http://127.0.0.1:<你的代理端口>
```

初始化失败后再次启动会自动重试。

### 启动弹出「Failed to start the DeepSeek Harness backend」怎么办？

常见原因按可能性排序：

1. **首次初始化网络失败**——按上一条配置镜像后重试；
2. **安装包不完整**——`resources/dsh` 或 `resources/node-runtime` 缺失，重新安装；
3. **开发模式没装后端依赖**——在 `dsh-bundle/` 目录执行过 `npm install --omit=dev` 吗？（见上方「打包」章节）

排查技巧：命令行运行 `node dsh-bundle/node_modules/@deepseek-ai/dsh/lib/bin.js web --help`，能打印帮助说明 dsh 本身可用。

## 目录结构

```
├── main.js            # Electron 主进程：后端 + 托盘 + 快捷键 + 萌宠 + 向导 + 通知
├── pet.html / pet.js / pet-preload.js  # 桌面萌宠（透明悬浮窗 + 动画 + 点击穿透）
├── welcome.html / welcome.js / welcome-preload.js  # 新手向导
├── afterPack.js       # 打包后钩子：给 exe 嵌入图标/版本信息
├── make-icons.js      # 图标生成脚本（npm run icons）
├── remove-pet-bg.js   # 萌宠抠背景脚本
├── update-pet-frames.js # 萌宠帧缩放脚本
├── download-node.js   # 下载便携版 Node v24（打包前置）
├── download-electron.js # electron 二进制下载兜底
├── setup-linux.sh     # Linux 一键准备脚本
├── package.json       # 依赖 + electron-builder 打包配置（win/mac/linux）
├── dsh-bundle/        # 后端生产依赖清单（打包时 npm install）
├── bundled-skills/    # 预装技能
├── build/             # 图标源文件 + rcedit-x64.exe
└── assets/            # 运行时图标 + 萌宠动画帧
```

## 版权声明

Bigfish 基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT 协议）构建，为它提供一个桌面外壳和若干桌面原生能力。

- Bigfish 本体以 MIT 协议发布（见 `LICENSE`）。
- Bigfish 是**独立社区项目**，**非 DeepSeek 官方出品**，与 DeepSeek 无隶属、赞助或背书关系。
- DeepSeek Harness 的版权归其原作者所有；MIT 协议允许再分发与改造，但需保留其版权声明。
- 「DeepSeek」及其相关商标归其权利人所有，本项目不声称拥有任何相关商标权利。

## 隐私声明

Bigfish 重视你的隐私：

- **不收集、不上传任何个人信息**，无遥测、无广告、无第三方统计。
- **API Key 仅保存在你的电脑本地**，不会发送给除 DeepSeek 官方 API 之外的任何服务器。
- 你与 AI 的对话内容会直接发送给 **DeepSeek 官方 API**，受 DeepSeek 官方服务条款与隐私政策约束。
- 所有会话数据、设置均存储在你的本机。

> 使用本软件即表示你同意 DeepSeek 官方平台（platform.deepseek.com）的服务条款与隐私政策。

## License

MIT

---

## AI 协作注意事项

> 给 AI 代理/协作者的提示。**开工第一件事先读本文件与 `CLAUDE.md` 的注意事项**,再动手,不要浪费 token 去全盘扫描磁盘。

### Python 位置备忘

需要运行 Python 时,优先使用以下解释器(按推荐顺序),直连已知路径,不要递归扫盘猜:

| 路径 | 版本 | 说明 |
|------|------|------|
| `D:\Python\python.exe` | 3.14.2 | 独立安装,最干净,优先使用;**装好了 PyMuPDF** |
| `D:\Anaconda\envs\torch\python.exe` | 3.10.20 | 含 PyTorch,跑 torch 相关用这个 |
| `D:\Anaconda\envs\py310\python.exe` | 3.10.20 | 通用 3.10 |
| `D:\Anaconda\envs\it\python.exe` | 3.10.20 | |
| `D:\Anaconda\envs\omnizip\python.exe` | 3.14.4 | |
| `D:\Anaconda\python.exe` | 3.13.9 | Anaconda base |
| `D:\miniconda3\python.exe` | 3.13.13 | miniconda base |

已知包情况(已实测):
- PyMuPDF(`fitz`):仅 `D:\Python\python.exe` 有,其余已知解释器均无
- 需要 PyMuPDF 时直接用 `D:\Python\python.exe`

注意:`where python` 返回的是应用商店占位程序,不是真实解释器,不要使用。

### 若工作区不在 `D:\Bigfish`

- 全局已生效:本机 `~/.claude/CLAUDE.md`(即 `C:\Users\11860\CLAUDE.md`)含同一份 Python 位置备忘,Claude Code 会在任何项目会话自动加载。
- 其他 AI 工具:优先读本项目 `CLAUDE.md` 或本文件;若都读不到,再定向检测 `D:\Python\python.exe` 等已知路径,避免全盘扫描。

### 通用行事准则 / 验证纪律 / 禁止项 / Skill 兜底

(详见全局 `~/.claude/CLAUDE.md`,此处列要点)

- 开工先读 `CLAUDE.md` / `README` 注意事项;改文件前先读;失败先复现再改。
- 声称完成前先跑验证命令读输出;不凭记忆给版本/结果。
- 禁止:全盘递归扫描、覆盖未读文件、删用户内容、用 `WindowsApps\python.exe`。
- Skill 按 `description` 命中时先加载并执行;未命中不强读。

### 任务完成与结果呈现纪律

- 禁止把中间代码当最终结果输出;最终回答只含结论 + 结果文件路径 + 简要说明。
- 未达成目标不得提前结束;除非已完成并验证,或撞到硬阻塞且已说明,否则必须继续到完成。

### 语言纪律

- 思考/推理/deep-diving 全程用中文,最终输出也全部中文(除非用户要求其它语言或代码/专有名词无法翻译)。
