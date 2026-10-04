# dsh-handover-snapshot

dsh 宿主插件：在会话框左下角 **'+' / '/' 命令菜单**注入两个命令，落地「任务交接快照」的生成与读取。

## 命令

| 命令 | 说明 | 行为 |
|------|------|------|
| `/handover-save` | 生成交接快照 | 向当前 agent 派发任务，按 `handover-snapshot` 技能撰写快照并写入统一目录 `D:\Bigfish\.handover-snapshots\`（agent 执行） |
| `/handover-list` | 读取交接快照 | 列出该目录全部快照；`/handover-list <序号或文件名>` 读取全文放入会话供 agent 接力 |

## 安装（web profile）

1. 把本包放到 `D:\dsh\profiles\web\node_modules\dsh-handover-snapshot\`
2. 在 `D:\dsh\profiles\web\cordis.patch.yml` 的 `insert` 列表追加：
   ```yaml
   - insert:
       - id: dsh-handover-snapshot
         name: 'dsh-handover-snapshot'
         config: {}
   ```
3. 重启桌面壳 / dsh web 服务使插件生效。

## 卸载

删除 `cordis.patch.yml` 的 insert 条目并移除 `node_modules\dsh-handover-snapshot`，重启即可。

## 说明

- 纯 ESM，零构建；仅依赖 node 内置 `fs` 与 cordis `commands` 服务注入。
- 不 import 任何 `@deepseek-ai/*` 运行时包，规避 profile 子树模块解析差异。
- 快照目录与 `bundled-skills/handover-snapshot` 技能默认一致。
