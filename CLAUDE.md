# Bigfish

DeepSeek Harness(`dsh`)的 Electron 桌面壳:把 `dsh web` 本地后端 + Web UI 包进原生窗口,加托盘、快捷键、萌宠、通知、新手向导等桌面能力。

## 架构速览

```
main.js                 # Electron 主进程(单文件):后端生命周期 + 托盘 + 快捷键 + 萌宠 + 向导 + 通知
  ├─ 启动:dsh 子进程,随机端口(127.0.0.1),waitForReady 校验 HTML 含 "DeepSeek Harness" 标题
  ├─ 崩溃恢复:意外退出按 [2s,5s,10s,30s] 退避重启,60s 健康运行重置计数
  └─ 完成通知:启发式——DSH_HOME(排除 profiles/node_modules)连续 2 个轮询周期(~10s)有新写入算任务运行,闲置 30s 通知
pet.html/js + pet-preload.js   # 桌面萌宠(透明悬浮窗,点击穿透,状态机 idle/eat/sleep/walk)
welcome.html/js + welcome-preload.js  # 新手向导
dsh-bundle/              # 后端 @deepseek-ai/dsh 生产依赖(独立 lockfile,CI 用 npm ci)
bundled-skills/          # 预装技能(.md + YAML frontmatter,经 DSH_BUNDLED_SKILL_DIR 注入)
prepare-pack.js          # predist:win 前置:补 node-runtime + dsh-bundle
afterPack.js             # 打包后 rcedit 嵌入图标/版本(版本号自动读 package.json,勿手改)
```

所有 BrowserWindow 必须保持 `contextIsolation: true, nodeIntegration: false, sandbox: true`;preload 只暴露窄 API。

## 常用命令

```bash
npm start            # 开发运行
npm run dist:win     # 打 Windows 安装包(自动跑 predist:win 前置)
npm run icons        # 重新生成图标(make-icons.js,需 sharp)
```

国内网络打包前:`set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` + `set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`

## 发版流程

1. 只改 `package.json` 的 `version`(x.y.z,afterPack 自动补成 x.y.z.0 嵌入 exe)
2. `npm start` 验证 → `npm run dist:win` → 自测安装 → 传 GitHub Releases
3. 详情见 README「发版检查清单」

## 关键事实(实测验证过,勿凭记忆改)

- dsh 当前锁定 `0.1.0-rc.6`(npm latest)。CLI:`dsh web` = `--profile web`,`--host/--port` 由 web 应用解析,启动器 flag 在前
- dsh 首次启动联网初始化 web profile 到 `~/.dsh`(国内需 npm 镜像,见 README FAQ)
- `DSH_BUNDLED_SKILL_DIR` 是 dsh-skill-filesystem 插件读取的真实环境变量
- dsh web 服务有 `/api` origin trust fence;打包的 Node 运行时在 `node-runtime/`(dsh 原生模块 ABI 需要真实 Node,不能跑在 Electron 的 Node 上)
- 模型 ID:`deepseek-v4-pro`、`deepseek-v4-flash`(官方无 ascend 后缀);base URL `https://api.deepseek.com`(OpenAI 兼容)+ `/anthropic`(Anthropic 兼容)

## 注意事项

- 开发模式(`npm start`)与安装版行为差异:托盘卸载、右键菜单仅安装版可用
- Electron 43 + electron-builder 26;本机 Node 24 下 npm install 正常(Electron 33 时代的 extract-zip 坑已随升级消失)
- 主窗口 close 事件被拦截(最小化到托盘),真退出走托盘「退出」;`stopDsh` 先把 `dshProcess` 置 null 再杀,崩溃恢复靠这个判断
- 版本号不要硬编码到 afterPack.js(已自动同步)
