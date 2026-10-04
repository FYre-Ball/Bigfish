# 模型禁用开关(Allowlist)设计

日期:2026-08-26
状态:已确认,待实施

## 背景与问题

用户在 DeepSeek Harness 的模型下拉框选中一个模型后,主对话模型固定,但 agent 派生的子任务(subagent / workflow / ralph)的子 Agent 可能被路由到其它 provider / model。用户希望加一个「禁用」开关,让**主对话主模型**和**所有派生子 Agent 都只能在「未禁用」列表里选**。

## 范围(已确认)

- 顶层主对话模型 + 子 Agent 都只能在未禁用列表里选。
- 开关 UI:模型下拉每行右侧加开关图标;禁用后该行**置灰 + 不可选**(不是消失),可再次点开关恢复。
- 当前已选中的模型被禁用时:保持到下次会话生效,不打断运行中请求。

## 源码位置(已克隆并核实)

- 仓库:`deepseek-ai/deepseek-harness`,已 clone 到 `D:\deepseek-harness`(HEAD `b150a55`)。
- 前端模型选择:`packages/client/ui-model-selection/src/client/`
  - `ModelSelect.tsx` — 渲染两段式下拉;每行模型是 `<button role="menuitemradio">`。
  - `directory.ts` — 目录加载(`session.models`)与选择提交(`session.selectModel`)。
  - `service.ts` — `ModelDirectoryResolver`(`ctx.modelDirectories`),每会话单例目录。
  - `locales.ts` / `slots.ts` / `index.ts` / `ModelSelect.module.css`。
- 后端模型目录与选择:`packages/host/apiproxy/src/api-proxy.ts`
  - `buildModelCatalog`(line 269) — 用 `ctx.llm.listProviders()` + `ctx.llm.listModels()` 构建目录 group。
  - `selectModel` RPC — 调 `ctx.llm.resolveCallConfig` 校验后写入 `selection` 并保存默认。。
- 子 Agent 模型决策:`packages/subagent/subagent/src/child-agent.ts`
  - `resolveChildAgentOptions`(line 68) —   `request.agentOptions` 覆盖父模型:`agentOptions?.model ?? parent.model`。
  - `workflow` 脚本的 `agent()` 支持 `provider`/`model` 覆盖、 RAFPH 每 round 新子 agent、均经此 👉
- 默认模型服务 agent: `packages/agent/agent-default-model`(源码),读其 settings 机制作为模板。

## 设计(核心)

### 1. Settings 分节

新增分节(建议):`model-allowlist` 或 `agent-model-allowlist`,包含 `disabled` 键。

字段:
- `disabled: string[]`,每项形如 `"provider/model"`(与目录 row 的 `rowId` 一致: `"${provider}/${model}"`)。

持久化到 settings.yaml(与 `agent-default-model` 同机制),随 web profile 走,重装依赖不丢失。

### 2. 目录层(host `buildModelCatalog`)

- 读取 `disabled` 列表。
- 不直接从 `groups` 里**删除**被禁模型(那样就无法置灰显示);而是给 `groups` 注入 `disabled` 标记,或把被禁模型放进 `"disabledGroups"` 再 merge 回 so  UI 可以显示置灰。
- 信息:→ 最终返回结构里追加 per-model `disabled` 标志字段,并保留 model id 供 UI 显示置灰。→ 精确性窄(仅 `2`)得入某 provider?)打 实际上 direction 由 provider->id(modelid workflow provider")只加置灰 + 拒绝;underful make默认工作.

### 3. 选择层(host `selectModel`)

- 在 existing `ctx.lll.resolveCallConfig` 校验后,再检查选中 host provider/model 是否命中 `disabled`;命中则返回 err 「此模型已被禁用」。

### 4. 子 Agent 拦截(subagent/workflow/ralph)

- 在 `resolveChildAgentOptions`,`request.agentOptions` 落点加圈禁列表校验:
  - 若 `request.agentOptions.(model,`为被禁 → 报错(拒绝) → 不回退。Because:
    - parent 手动显式指定 model
    by: agent 已确认(主)回退。description

?? 需待 user 确认 child: 在哪点插。设计: 子由动 agentops/wi. addMOD
  - `workflow` 的 `agent()`（ ） provider/model 覆盖: work。
  - `ralph` 的每 round必要及uke也在 distrust:  `interrupt_agent`; auth 评注: ?

一个 open 设计问题:同一 provider下  replacement engaged 多此sets of;disabled 存储。Should I store disabled 也 per provider→model (二维) or есть".

放弃 registry provider+model.  (很可能
- suffixwide 默认: known triage re-eval 后见notes。

## 数据流

1. 用户在模型下拉点某行开关 → client `directory` 调 settings 远程写 `disabled`(追加/移除 `${provider}/${model}`)。
2. host settings 更新 → `buildModelCatalog` 下次构建时给该 model 标 `disabled: true`。
3. `selectModel` 命中 disabled → 返回 err。
4. 派生 subagent/workflow/ralph 时,`resolveChildAgentOptions` 校验 `disabled` → 拒绝/回退。

## 落地点(源码)

| 层 | 文件 | 修改 |
|---|---|---|
| client 目录/选择 | `packages/client/ui-model-selection/src/client/directory.ts` | 读取 disabled + 暴露 toggle API |
| client UI | `packages/client/ui-model-selection/src/client/ModelSelect.tsx` / `.module.css` | 每行渲染开关图标、置灰样式 |
| client 文案 | `.../locales.ts` | 加 disable/enable 文案 |
| client 类型/槽 | `.../slots.ts`, `.../index.ts` | 注入 disabled 状态 |
| host 目录 | `packages/host/apiproxy/src/api-proxy.ts` | `buildModelCatalog` 标 disabled;`selectModel` 校验 |
| host settings | 参考 `packages/agent/agent-default-model` | 注册 `disabled` settings 分节 |
| 子 Agent | `packages/subagent/subagent/src/child-agent.ts` | `resolveChildAgentOptions` 校验 disabled |

## 待实施时确认的开放点

- settings 分节的确切注册方式(参照 `agent-default-model` 源码)。
- `disabled` 的粒度:`${provider}/${model}` 字符串,还是 `{ provider, model }` 对象(建议字符串,与目录 rowId 一致)。
- 子 Agent 命中禁用时是「拒绝」还是「回退父模型」:实施时倾向于字面校验失败更安全,但需要 handler trim。建议:子 Agent 覆盖若命中禁用,直接抛错(让父的 agent 选择合规模型),因为子模型不应悄悄回退。+ 与 main/ 顶层一致:顶层也不应回退。

## 生效到当前 GUI

改完 `deepseek-harness` 源码后,用 pnpm 构建 client + host 包,替换 `D:\Bigfish\dsh-bundle\node_modules` 里对应 `@deepseek-ai/*` 包,重启后端验证当前 GUI。
