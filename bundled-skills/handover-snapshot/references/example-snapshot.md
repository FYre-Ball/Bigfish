# 示例：任务交接快照（演示用）

> 这是 `references/example-snapshot.md`,展示模式 A 生成的快照长什么样。新会话接手时看到的即为此结构。
> 实际生成的快照保存在统一目录: `D:\Bigfish\.handover-snapshots\YYYYMMDD-HHMMSS-<简述>.md`

```markdown
# 任务交接快照
- 会话标识: DeepSeek插件重构
- 生成时间: 2026-07-12 15:43
- 目标: 把 claude-mem 插件从 v1 重构到 v2 并跑通端到端测试

## 当前进度
- 已重构 src/commands/ 三个命令到新接口(commit/mem/forget)
- 已通过单元测试,测试文件在 test/commands.test.ts
- v2 配置 schema 已写好 src/config/schema.ts 并通过校验

## 下一步目标
1. 在 src/index.ts 里注册新的命令入口并替换旧注册
2. 运行 `npm test` 确认全绿
3. 更新插件的 market-related 描述与版本号到 2.0.0

## 禁止事项
- 不要从头返工（src/commands 已重写完成，直接沿用）
- 不要改动 src/config/schema.ts（已确认 v2 行为，避免破坏兼容）

## 关键上下文
- 工作区: D:\Bigfish\claude-mem-plugin\
- 运行测试: `npm test`(vitest)
- 打包/发布流程见 CLAUDE.md「发版检查清单」
- 已完成决策: v2 配置弃用 `enableLogs` 字段,改用 `logging.level`

## 风险与注意
- src/index.ts 里旧注册函数 `registerLegacy()` 尚未删除,接手时先删再注册新入口
- 未验证 Windows 下 `npm test` 是否有多进程并行问题
```

**接手要点(模式 B):** 新会话读取该快照后,应直接执行「下一步目标」第 1 项,先删除 `registerLegacy()`,再注册新命令入口,然后跑 `npm test`,无需重新阅读已重构的 `src/commands/` 代码。
