# Bigfish

> ⚠️ **非官方声明**：Bigfish 是独立的第三方社区项目，基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT 协议）构建，**非 DeepSeek 官方出品**，与 DeepSeek 无隶属、赞助或背书关系。

Bigfish 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Electron 桌面版：把 `dsh web` 的本地后端 + React UI 包进一个原生窗口，并加上系统托盘、全局快捷键、桌面萌宠、新手向导等桌面原生能力，免去开终端、记端口、开浏览器。欢迎大家来fork，来开发更多的功能，现在只是一些很基础的功能，期待大家的反响。

## 桌面功能

| 功能 | 说明 |
|---|---|
| 🖥️ 系统托盘 | 任务栏图标，点击切换主窗口；右键菜单含各项开关 |
| ⌨️ 全局快捷键 | `Ctrl+Shift+D` 随时唤起/隐藏主窗口 |
| 🐟 桌面萌宠 | 透明悬浮窗，可拖动、单击唤起主窗口，含待机/吃/左走/右走/睡觉多状态动画 |
| 🔔 完成通知 | 后端任务完成后系统弹通知 + 萌宠冒泡提醒 |
| 🧭 新手向导 | 首次启动引导配置 API Key，一键跳转 DeepSeek 官网 |
| 📂 右键菜单 | 「唤起 Bigfish」：右键文件/文件夹快速唤起主窗口（托盘菜单安装；直接打开文件将在后续版本实现） |
| 🚀 开机自启 | 托盘菜单勾选 |
| ⬇️ 关闭到托盘 | 点窗口 X 不退出，隐藏到托盘后台运行 |

## 预装技能

为了让普通人开箱即用，Bigfish 预装了 5 个常用技能（位于 `bundled-skills/`，通过 `DSH_BUNDLED_SKILL_DIR` 加载，source 标记为 `bundled`、优先级最高）：

| 技能 | 名称 | 用途 |
|---|---|---|
| 🖼️ 图片识别 | `image-recognition` | 识别图片内容、OCR 提取文字、看图问答 |
| 📊 PPT 生成 | `ppt-generation` | 按主题生成 .pptx 或 HTML 幻灯片 |
| 📄 文档总结 | `document-summary` | 总结文档/文章/网页，提取要点 |
| ✍️ 写作助手 | `writing-assistant` | 文章、邮件、文案、报告等写作 |
| 🌐 翻译 | `translation` | 中英互译及润色、本地化 |

**新增技能**：在 `bundled-skills/` 里放一个带 YAML frontmatter 的 `.md` 文件即可，格式：

```markdown
---
name: my-skill          # kebab-case
description: 一句话说明这个技能做什么
whenToUse: 用户什么时候应该用到它
---
这里是技能的指令正文……
```

## 工作原理

```
┌───────────────────────────────────────────────┐
│  Electron 主进程 (main.js)                     │
│   1. 找一个空闲的 127.0.0.1 端口               │
│   2. 用捆绑的 Node 拉起 dsh --profile web      │
│   3. 轮询直到后端就绪                           │
│   4. BrowserWindow 加载 http://127.0.0.1:端口  │
│   + 托盘 / 快捷键 / 萌宠 / 向导 / 通知         │
└───────────────────────────────────────────────┘
```

后端复用 `@deepseek-ai/dsh` 这个 npm 包，与命令行版完全一致；桌面版只是套了一层原生窗口。后端只监听 `127.0.0.1`（CLI 源码禁止 `0.0.0.0`，安全边界现成）。

## 为什么捆绑 Node 运行时

`@deepseek-ai/dsh` 需要 **Node ≥ 22**（用到 `node:zlib.createZstdDecompress`、`node:module.stripTypeScriptTypes`）。虽然 Electron 43 自带 Node 24.18，但 Electron 的原生模块 ABI 与官方 Node 不兼容（dsh 首次启动会用 pnpm 现场安装 node-pty / sharp 等原生依赖），因此打包版仍捆绑一个真实的 Node v24 运行时来跑 dsh，保证原生模块 ABI 与依赖安装时的版本完全匹配。

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

## 直接下载安装包（免编译）

不想自己编译？直接拿现成的 Windows 安装包：

- 从本仓库的 **GitHub Releases** 页面下载 `Bigfish Setup x.y.z.exe`

**安装使用**：双击 exe → 按向导安装 → 桌面/开始菜单出现「Bigfish」→ 双击即用（已内置 Node 运行时，无需装 Node）。

> ⚠️ 安装包约 160MB，超过 GitHub 仓库单文件 100MB 上限，请用 **GitHub Releases** 分发（附件上限 2GB）。

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
