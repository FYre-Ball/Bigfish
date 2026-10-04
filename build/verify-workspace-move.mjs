import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceRegistry, realpathNormalize } from "../dsh-bundle/node_modules/@deepseek-ai/dsh-workspace/lib/index.js";

let pass = 0;
const ok = (label) => { pass++; console.log(`  PASS  ${label}`); };
const fail = (label, err) => { console.error(`  FAIL  ${label}: ${err}`); process.exitCode = 1; };

// 1. 方法存在性
const proto = WorkspaceRegistry.prototype;
assert.equal(typeof proto.move, "function", "move() missing");
ok("move() exists on WorkspaceRegistry.prototype");

// 2. 用真实类构造一个最小实例(绕过 Service init,手动填字段)
function makeRegistry() {
  const fakeCtx = { reflect: { provide: () => {} }, effect: () => () => {}, get: () => undefined };
  const reg = new WorkspaceRegistry(fakeCtx);
  // 内存表桩:update/get/delete 语义
  const rows = new Map();
  let globalObj = { initialized: true, workspaceIds: [], archivedSessionIds: [], pendingMutation: undefined };
  reg.table = {
    get: (id) => rows.get(id),
    put: (id, rec) => { rows.set(id, rec); },
    update: async (id, fn) => { rows.set(id, fn(rows.get(id))); },
    delete: async (id) => { rows.delete(id); },
    entries: () => rows.entries(),
    size: 0
  };
  reg.global = { get: () => globalObj, set: async (s) => { globalObj = s; } };
  reg.state = globalObj;
  return { reg, rows, getGlobal: () => globalObj };
}

(async () => {
  // --- 构造真实目录,做端到端 move 测试 ---
  const base = await mkdtemp(join(tmpdir(), "ws-move-"));
  const oldDir = join(base, "old-workspace");
  const newDir = join(base, "new-workspace");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(oldDir, { recursive: true });
  await mkdir(newDir, { recursive: true });

  const { reg, rows, getGlobal } = makeRegistry();

  // 手动放一个 workspace record + entity
  const id = "ws-1";
  const record = {
    path: await realpathNormalize(oldDir),
    title: "old",
    sessionIds: ["sess-1", "sess-2"],
    pinnedSessionIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
  rows.set(id, record);
  getGlobal().workspaceIds = [id];
  // sessionPaths 索引:两个会话 cwd 都指向旧目录
  const oldCanonical = await realpathNormalize(oldDir);
  reg.sessionPaths.set("sess-1", oldCanonical);
  reg.sessionPaths.set("sess-2", oldCanonical);
  reg.rebuildEntities();
  // 让 entities 里出现实体
  // rebuildEntities 需要 host + WorkspaceEntity;host 是 class field 已存在
  // 但 rebuildEntities 里 new WorkspaceEntity(this.host, id, record) —— host.sessionPath 已覆盖

  // 断言 move 前:entity.sessionIds 返回两个(因为 sessionPath===path)
  const before = reg.get(id);
  assert.equal(before.sessionIds.length, 2, "before move sessionIds should be 2");
  ok("before move: entity.sessionIds reports both sessions");

  // 执行 move 到新目录
  const moved = await reg.move(id, newDir);
  assert.equal(moved.path, await realpathNormalize(newDir), "move updated path");
  ok("move() updates workspace path to canonical new path");

  // 断言记录已持久化 pinnedSessionIds
  const afterRecord = rows.get(id);
  assert.deepEqual([...afterRecord.pinnedSessionIds].sort(), ["sess-1", "sess-2"], "pinnedSessionIds persisted");
  ok("record.pinnedSessionIds persisted with all member sessions");

  // 断言移走后 sessionPath 覆盖生效:即使 sessionPaths 还指向旧目录,
  // entity.sessionIds getter 因 pinned override 返回新 path === record.path 而保留会话
  const after = reg.get(id);
  assert.equal(after.sessionIds.length, 2, "after move sessionIds still 2 (pinned override)");
  ok("after move: entity.sessionIds still reports both sessions (no Ungrouped)");

  // 断言 pinnedPaths 映射已建
  assert.equal(reg.pinnedPaths.get("sess-1"), await realpathNormalize(newDir), "pinnedPaths maps sess-1 to new dir");
  ok("pinnedPaths maps member sessions to new path");

  // 清理
  await rm(base, { recursive: true, force: true });

  console.log(`\n${pass} assertions passed.`);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
