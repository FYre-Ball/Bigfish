# DSH 模型锁定功能实现方案

在 `D:\deepseek-harness`（DSH monorepo）中实现「选择模型后禁用自动更换开关」。

## 机制总览（两个互补机制 + 一次 UI 改动）

### A. 全局禁用列表（model-allowlist，后端已就绪，缺 RPC + UI）
- 服务 `packages/core/model-allowlist`（全新，未跟踪）。`isDisabled(provider, model)` 已在两处生效：
  - `host/apiproxy/src/api-proxy.ts` `selectModel`（主模型）
  - `subagent/subagent/src/child-agent.ts` `resolveChildAgentOptions`（子 Agent 继承）
- 缺：前端可调的 RPC + 下拉菜单里的「禁用」开关。

### B. 会话级锁定（新增，后端 + 前端）
- 一个 per-session bool `modelLocked`，进程级（与现有 `picked` 选择一致，非持久化）。
- 当开启时：
  1. `selectModel` 不再写全局默认（跳过 `saveDefaultModelSelection`，拦截「选完即改默认」）；
  2. `selectionFor` 的 fallback 不再用全局默认/已记录 header 覆盖「被锁定的 picked 选择」（拦截「失效自动换」）。
- 需要新增 RPC `session.setModelLocked` + `session.models` 回传 `locked`。

## 代码改动清单

### 后端
1. `host/apiproxy/src/api/sessions.ts` 接口：
   - 加 `SessionsApi` 方法 `setModelDisabled` + `setModelLocked`；
   - `SessionModels` 加 `locked: boolean`。
2. `host/apiproxy/src/api/sessions.schema.ts` 加对应 schema。
3. `host/apiproxy/src/api/rpc-map.ts` 加两个 method key。
4. `host/apiproxy/src/fetch/handler.ts` 加 UNARY_ROUTES 两行。
5. `host/apiproxy/src/fetch/client.ts` 加 IApiClient.sessions 两方法 + value schemas 两行。
6. `host/apiproxy/src/api-proxy.ts`：
   - `selectModel` 加 locked 判断跳过 saveDefaultModelSelection；
   - `models` 回传 locked；
   - 实现 `setModelDisabled`（调 modelAllowlist.setDisabled）、`setModelLocked`（写 process 级 state）。
7. `packages/api/remotes`（client 类型）同步 `disabled/locked` 字段与 RPC 声明。

### 前端
1. `ui-model-selection/src/client/slots.ts` 已声明 `toggleDisabled`，再加 `toggleLocked`。
2. `ui-model-selection/src/client/index.ts` 接线返回 toggleDisabled / toggleLocked。
3. `ui-model-selection/src/client/ModelSelect.tsx` 加「锁定」开关（触发按钮旁）+ 菜单里每模型「禁用」开关。
4. `locales.ts` 加文案；`ModelSelect.module.css` 加样式。

### 测试 + 构建
- 单测 + e2e（参照 model-select.client.spec.tsx / default-model.e2e.ts）。
- 构建打包验证。

## 状态（已全部完成，除「发布到 npm + Bigfish 重打包」）

✅ 后端 RPC（session.setModelDisabled / session.setModelLocked）+ 类型 + 实现
✅ 前端锁定开关 UI + 每模型禁用开关 + 接线
✅ host/client typecheck、build:lib:host、build:lib:client 通过
✅ ui-model-selection 17 个单测通过

⏳ 待办（需 npm 发布权限，属独立发布流程）：
- 推进 `@deepseek-ai/dsh` 版本号（当前 Bigfish 锁 0.1.0-rc.6）
- 发布新版本 → `dsh-bundle` 重新 npm ci → `npm run dist:win` 重打安装包验证

## 阻塞记录（2026-08-26）

`npm publish` 需要登录凭证，但本机 `npm whoami` 返回 `ENEEDAUTH`（未登录）。
`dsh-bundle` 当前锁 `@deepseek-ai/dsh@0.1.0-rc.6`；npm 公共仓库 latest 为 `0.1.1-rc.2`。

本地免发布 `release:pack` 也已实测被环境阻断：
- 完整构建已跑通：`pnpm run build` ✅、`pnpm run build:official` ✅（`build: recorded 200 client artifact(s)`）。
- 但 `scripts/release/process.ts` 里的 `spawnSync('pnpm', ...)`（无 `shell:true`）在本机 corepack 环境无法解析到 `pnpm` 可执行文件：只有 `pnpm.cmd`/`pnpm.ps1` shim，无 `pnpm.exe`；实测 `spawnSync('pnpm')` → `ENOENT`、`spawnSync('D:\\npm-global\\pnpm.cmd')` → `EINVAL`（Node 对 `.cmd` 不做隐式 shell 执行）。

两条继续路径：
1. 用户登录 npm（`npm login` / 提供 token）→ 我执行 `pnpm release:dsh`（bump）→ `release:pack` → `release:publish`。
2. 本地：装一个真实 `pnpm.exe`（或改 `process.ts` 的 `spawnSync` 加 `shell: true`），再 `release:pack` 产出 tarball → 改 `dsh-bundle/package.json` → `npm ci` + `dist:win`。
