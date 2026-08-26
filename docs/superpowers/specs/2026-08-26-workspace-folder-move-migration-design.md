# 工作区文件夹移动后保留分组的迁移能力 — 设计文档

**日期**:2026-08-26
**状态**:待用户审阅
**对应问题**:用户把某个被认领为工作区的文件夹在系统里移动到新位置后,侧边栏里该工作区的历史对话被丢到「未分组」。

---

## 1. 背景与问题

`@deepseek-ai/dsh-workspace` 以**规范化后的物理路径**(`fs.realpath`)作为工作区身份,并把「会话头里的 `cwd`」经同一规范化后与工作区 `path` 精确匹配,来决定会话归属。

当用户在系统层面把一个已被认领为工作区的文件夹移动到新位置后:

- 工作区记录里的 `path` 仍指向旧位置(现已失效,`status()` 返回 `missing-dir`);
- 会话头里的 `cwd` 也仍指向旧位置;
- 因此 `indexHeader` 里 `realpathNormalize(header.cwd)` 解析失败,该会话从 `sessionPaths` 索引中消失;
- `Workspace.sessionIds` getter 按 `sessionPath(id)===record.path` 过滤,会话被剔除 → 落到「未分组」。

**这是设计使然,不是 bug**。当前没有内置的「迁移工作区路径」能力:用户把文件夹移走后,旧对话只能散落到「未分组」。

---

## 2. 目标与非目标

### 目标

用户把文件夹在系统里移动到新位置后,通过一个显式动作(在侧边栏把某个工作区重新指向新目录),使:

1. 侧边栏里**原来的工作区分组条目保持不变**(id、标题、会话顺序、展开状态均不变);
2. 名下历史对话**不再掉落到「未分组」**,继续待在该分组下。

### 非目标(本阶段不做)

- 自动探测文件夹移动并自动迁移(仍需用户显式指一次新路径)。
- 合并到已存在工作区(新路径已被其它工作区认领时,`直接拒绝`,不做合并语义)。
- 触碰/重写会话日志字节(见下,A′ 方案为后续上游正规方案,不在本机 POC 内实现)。

---

## 3. 关键实现事实(已实测核实)

这些事实决定了两条方案的取舍,须作为后续计划的约束:

1. **会话归属判断链路**:`dsh-workspace/lib/index.js` 的 `indexHeader`(第 685-703 行)在启动/附加时把 `header.cwd` 经 `realpathNormalize`(即 `fs.realpath`)规范化后写入 `sessionPaths` 映射;`Workspace.sessionIds` getter(entity.js 第 52/79 行)按 `host.sessionPath(id)===record.path` 过滤成员;`mutate`(entity.js 第 154 行)在同一条等式上修剪。
2. **`cwd` 已被物理编码进会话日志路径**:`dsh-session-persistence-jsonl/lib/index.js` 中 `projectKey(cwd)`(第 106-125 行)把 `cwd` 编码进项目目录名 `--<readable>--`,session 日志落在 `projectDir(root,cwd)/encodeSegment(id)` 下(第 133-158 行),文件名后缀随压缩格式。header 里的 `cwd` 字段与文件物理位置是同一份事实(写入用 meta.cwd 决定位置,读取从位置解析回 header)。
3. **persistence 无「改 header cwd / 移动日志」原语**:`dsh-session-persistence-jsonl` 只提供 `materialize`(新建)、appendBatch、repair 等;没有 relocate/rewrite-header。
所以「改会话头 cwd 字段」实际等于「物理搬迁每个会话日志 + 重写首行 header」,是字节级重活。
4. **启动一致性校验**:validateStoredState 断言「同一 path 不属两个工作区」「同一 session 不被两个工作区认领」(index.js 第 644-668 行);attachSession 校验 session header cwd 规范化后 === workspace path(entity.js 第 87-100 行)。

由事实 2/3 得出两条实现路线的分岔。

---

## 4. 方案

### 路线对比

| 维度 | B′:显式挂靠账户(轻,当前实现) | A′:物理搬迁日志(重,上游正规方案) |
|---|---|---|
| 是否触碰会话日志文件 | 否 | 是 |
| 是否新增 persistence 原语 | 否 | 是(relocate/rewrite-header) |
| 归属模型 | 路径推导 + 显式挂靠账户两层 | 纯路径推导(不变,因 cwd 已物理搬迁后一致) |
| 改动面 | 后端 dsh-workspace + 前端 dsh-client-ui-workspace 菜单入口 | 后端 dsh-workspace + dsh-session-persistence 新增原语 + 前端入口 |
| 风险 | 中(需避开不变式校验的误伤) | 高(zstd 帧/fsync/崩溃恢复/跨盘 rename 字节级正确性) |
| 可逆性 | 高 | 中 |

### 两路线共享的部分(无关乎选哪条路线)
- 前端:侧边栏工作区行菜单新增「更改文件夹位置…」入口;复用现有「添加工作区」的目录流 slot + native 目录选择器。
- 后端:工作区加 `move(id,newPath)`,实时校验 newPath 存在且是目录、未被其它工作区认领;冲突时拒绝并给可读提示。
- 冲突语义:新路径已被其它工作区认领 → 拒绝。不合并。

### B′(当前实现)— 选定

在工作区记录上新增一个**显式挂靠账户**(per-workspace 的 session id 账户),它指示「这些会话现在归属该工作区」,在归属解析时**优先于** `cwd` 匹配。

- 工作区 `move(id,newPath)`:
  1. `realpathNormalize(newPath)`;校验存在且是目录,否则拒绝;
  2. 校验 newPath 未被其它工作区认领,否则拒绝并提示「该文件夹已被工作区 X 使用」;
  3. 把工作区记录的 `path` 更新为 newPath;
  4. 把其名下现有 `sessionIds` 写入「显式挂靠账户」(记录旧 cwd 已失效、需显式挂靠的会话)；
  5. 更新 session 索引:让这些会话的归属覆盖为 newPath(不触碰日志、不改 header cwd)。
- 归属解析:挂靠账户命中 → 归属该工作区;否则回退现有 cwd 匹配。
- 需审慎处理与现有不变式校验的交互(validateStoredState 的 session 单归属、path 单归属),以及 sessionIds getter / mutate 修剪 / indexHeader 的 filters,确保「显式挂靠」会覆盖 cwd 不匹配造成的过滤,而不是被修剪掉。这些属于实现计划阶段的精确改法,不在本设计文档展开。

### A′(后续上游正规方案)— 仅记录,本机 POC 不实现

给 `dsh-session-persistence` 增加 `relocate(id, oldCwd, newCwd)` 原语:把该会话日志从 `projectKey(旧cwd)/…` 物理移动到 `projectKey(新cwd)/…`,并以原子方式重写首行 header(保持事件的 append-only 字节不变)。工作区迁移时逐个调用。完成后 header cwd 与新 workspace path 重新精确一致,可保持「纯路径推导」模型。该方案的正确性风险高,建议合成一条记录并有测试矩阵(压缩/无压缩 × Windows/POSIX × 跨盘/同盘),故约定为上游正规功能,独立成新需求。

---

## 5. 数据流(两条路线共有)

```
侧边栏:右键工作区行菜单 → 「更改文件夹位置…」
  → 目录流 slot(native 选择器) → onPicked(newPath)
  → 后端 move(id, newPath)
      → 校验 newPath 存在且为目录                    (失败 → 报错:请选择存在的文件夹)
      → 校验 newPath 未被其它工作区认领              (失败 → 报错:该文件夹已被工作区 X 使用)
      → 更新工作区 path = newPath
      → (B′) 记录显式挂靠账户 / (A′) relocate 会话日志
      → 刷新 session 索引 + rebuildEntities + 前端刷新
  → 分组条目保持不变,会话不落「未分组」
```

## 6.错误处理

| 情况 | 结果 |
|---|---|
| 新路径不存在 / 不是目录 | 拒绝,提示「请选择存在的文件夹」 |
| 新路径已被其它工作区认领 | 拒绝,提示「该文件夹已被工作区 X 使用」 |
| 工作区 id 未知 | 拒绝 |
| move 写状态中途失败 | 参照现有 create/delete 的 pendingMutation 恢复或回滚 |
| (B′) 会话索引刷新失败 | 报错,保持工作区旧状态不变(无半迁移) |

## 7.测试(候选)

- 迁移后:工作区 id/标题/会话顺序/展开状态不变;会话不再落未分组。
- 迁移后新建会话(在 newPath 下) → 归入该工作区。
- 迁移到已存在工作区 → 拒绝并提示。
- 迁移目标路径不存在/非目录 → 拒绝。
- (若 B′ 需写新持久字段)旧版本数据无该字段时解析为默认空账户,不报错。

## 8. Scope

本机 POC(B′)仅实现「侧边栏指新路径 → 会话保持分组」这一条链路,不含自动探测、不含合并、不含日志搬迁(A′)。范围为后端 `dsh-workspace` 与前端 `dsh-client-ui-workspace` 两个包。A′ 作为独立后续需求另行立项。

---

## 9. 开放问题(进入实现计划前需关闭)

- B′ 的「显式挂靠账户」应落在何处持久化:工作区记录新增一个字段(如 `pinnedSessionIds` / `overriddenPaths`),还是 registry-global 映射?建议进记录字段(与 sessionIds 同生命周期),需与 version 升级解析兼容。
- 显式挂靠账户与现有 `sessionIds`/`sessionPath`/`mutate`/`indexHeader`/`validateStoredState` 多个过滤点如何精确协作而不互相误删——实现计划里逐条给出改法与回归测试。
