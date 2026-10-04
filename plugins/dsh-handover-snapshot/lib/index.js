/**
 * dsh-handover-snapshot — 会话交接快照命令插件
 *
 * 宿主 cordis 插件：向当前会话的 '+' / '/' 命令菜单注入两个命令：
 *
 *   /handover-save   生成交接快照 —— 向当前 agent 派发一条用户消息，让其按
 *                    handover-snapshot 技能撰写快照并写入统一目录（agent 执行）。
 *   /handover-list   读取交接快照 —— 宿主直接列出统一目录下的全部快照；带参时
 *                    读取指定快照全文放入会话，供 agent 按「下一步目标/禁止事项」接力。
 *
 * 纯 ESM，零构建；只通过 cordis 服务注入（inject ['commands']）与 node 内置 fs
 * 工作，不 import 任何 @deepseek-ai/* 运行时包（避免 profile 子树解析差异）。
 */

import { readdir, readFile, stat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export const name = 'dsh-handover-snapshot'
export const inject = ['commands']

/** 统一快照目录（与 handover-snapshot 技能默认一致）。 */
const SNAPSHOT_DIR = 'D:\\Bigfish\\.handover-snapshots'

/** 返回对象：选中的快照是人类角色转交给 agent 的消息。构造自字面量，避免 import dsh-llm。 */
function userMessage(text) {
  return {
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }
}

/** 快照文件容器（user 于人可见）。 */
function snapshotDirText() {
  return `D:\\Bigfish\\.handover-snapshots\\`
}

/** 渲染快照列表的命令结果文本。 */
function renderList(list) {
  if (list.length === 0) {
    return `暂无交接快照，目录 ${snapshotDirText()} 为空。\n用 /handover-save 生成一份。`
  }
  const rows = list.map((s, i) => `${i + 1}. ${s.file}  (${s.mtime.toLocaleString()})`).join('\n')
  return `共 ${list.length} 份交接快照（最新在前）:\n${rows}\n\n回复「选 <序号>」或 /handover-list <序号|文件名> 读取全文并接力。`
}

/**
 * /handover-save 处理器：派发给 agent 生成快照。
 * 快照内容依赖会话叙述（当前进度/下一步/禁止事项），交给具备文件系统工具与
 * handover-snapshot 技能的模型撰写并写入统一目录，正是「agent 执行」。
 */
async function handleSave(invocation) {
  const agent = invocation.agent
  const text = [
    '请生成一份任务交接快照（按 handover-snapshot 技能）：',
    '',
    `1. 写入目录 ${snapshotDirText()}，文件名格式 YYYYMMDD-HHMMSS-简述.md（如该目录不存在则先创建）；`,
    '2. 严格采用技能规定的强制结构：会话标识/生成时间/目标、当前进度、下一步目标、禁止事项、关键上下文、风险与注意；',
    '3. 内容引用真实文件路径与命令，简洁、事实化、可直接复制粘贴到新会话接手；',
    '4. 写完后把快照全文贴出。',
  ].join('\n')
  agent.followup(userMessage(text))
  return {
    kind: 'success',
    text: '已把生成交接快照的任务交给当前 agent 执行（按 handover-snapshot 技能撰写并写入统一目录）。请稍候，agent 完成后会把快照贴出。',
  }
}

/**
 * /handover-list 处理器：读取快照。
 * 无参 → 列出目录；带参（序号或文件名）→ 读取全文放入会话供 agent 接力。
 */
async function handleList(invocation) {
  const arg = (invocation.rawInput ?? '').trim()
  const list = await listSnapshots()
  if (arg === '') {
    return { kind: 'success', text: renderList(list) }
  }
  // 解析序号或（部分）文件名
  const num = /^\d+$/.test(arg) ? Number.parseInt(arg, 10) : NaN
  const target =
    Number.isNaN(num) || num < 1
      ? list.find((s) => s.file.includes(arg))
      : list[num - 1]
  if (target === undefined) {
    return {
      kind: 'error',
      text: `未找到匹配 "${arg}" 的快照。\n${renderList(list)}`,
    }
  }
  let body
  try {
    body = await readFile(join(SNAPSHOT_DIR, target.file), 'utf8')
  } catch (error) {
    return {
      kind: 'error',
      text: `读取 ${target.file} 失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }
  return {
    kind: 'success',
    text: `已读取交接快照 ${target.file}（内容已放入会话）：\n\n${body}`,
  }
}

// 导出供测试/调试：持久化目录可经第二个参数覆盖。
export async function listSnapshots(dir = SNAPSHOT_DIR) {
  let entries
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }
  const snaps = []
  for (const e of entries) {
    if (!e.toLowerCase().endsWith('.md')) continue
    const p = join(dir, e)
    try {
      const st = await stat(p)
      if (st.isFile()) snaps.push({ file: e, mtime: st.mtime })
    } catch {
      /* skip unreadable entries */
    }
  }
  snaps.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
  return snaps
}

export { handleSave, handleList }

/** cordis 插件入口。 */
export function apply(ctx) {
  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'handover-save',
      description: '生成任务交接快照（agent 按 handover-snapshot 技能写入统一目录）',
      handler: handleSave,
    })
    commandCtx.commands.register({
      name: 'handover-list',
      description: '读取交接快照：列出全部快照，或 /handover-list <序号|文件名> 读取全文接力',
      handler: handleList,
    })
  })
  // 确保目录存在（首次使用）
  void mkdir(SNAPSHOT_DIR, { recursive: true }).catch(() => {})
}
