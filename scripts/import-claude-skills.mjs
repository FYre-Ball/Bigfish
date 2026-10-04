// One-off migration: import Claude Code skills (SKILL.md + aux files) into dsh
// bundled-skills directory layout. Each skill becomes bundled-skills/<name>/SKILL.md
// with its auxiliary files copied verbatim. Frontmatter gains a Chinese `whenToUse`
// derived from each skill's description (English body preserved).
import { readFile, readdir, mkdir, writeFile, copyFile, stat } from "node:fs/promises";
import { join, relative, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = join(__dirname, "..", "bundled-skills");

// Source roots: each maps to a source label (not used in output).
const SOURCES = [
  "C:\\Users\\11860\\.claude\\plugins\\cache\\claude-plugins-official\\superpowers\\5.1.0\\skills",
  "C:\\Users\\11860\\.claude\\plugins\\cache\\claude-plugins-official\\skill-creator\\1b527e2ee74e\\skills",
  "C:\\Users\\11860\\.claude\\plugins\\cache\\thedotmack\\claude-mem\\13.3.0\\skills",
  "C:\\Users\\11860\\.claude\\plugins\\cache\\karpathy-skills\\andrej-karpathy-skills\\1.0.0\\skills",
];

// Chinese whenToUse triggers, keyed by skill name (derived from each description).
// Kept concise so the model can quickly decide when to invoke.
const WHEN_TO_USE = {
  // superpowers
  "brainstorming": "在任何创造性工作前使用——新功能、组件、添加功能或修改行为；探索需求与设计再动手实现",
  "dispatching-parallel-agents": "需要把独立工作并行分发到多个子代理执行时",
  "executing-plans": "已有实现计划，需要按计划逐步执行并逐项验收时",
  "finishing-a-development-branch": "功能完成、准备合入分支，需要收尾提交/推送/清理时",
  "receiving-code-review": "收到别人对你代码的评审意见，需要处理反馈时",
  "requesting-code-review": "代码完成需要请人评审、准备评审材料时",
  "subagent-driven-development": "用子代理驱动实现：先写规格，由独立子代理实现并评审时",
  "systematic-debugging": "遇到 bug，需要系统性定位根因而非随机猜测时",
  "test-driven-development": "需要先写测试再写实现（TDD 红绿重构循环）时",
  "using-git-worktrees": "需要并行处理多个分支/任务、用到 git worktree 时",
  "using-superpowers": "首次了解或回顾 superpowers 这套技能的用法体系时",
  "verification-before-completion": "任务收尾前，需要逐项验证成果是否真正完成时",
  "writing-plans": "设计已定，需要编写详细的分步实现计划时",
  "writing-skills": "需要编写或改进 skill 本身（命名、格式、最佳实践）时",
  "skill-creator": "需要创建一个新的高质量 skill、编写评测/打包 skill 时",
  // claude-mem
  "babysit": "需要盯一个耗时任务并逐步引导、防止跑偏时",
  "design-is": "需要澄清「设计」概念边界/设计原则时",
  "do": "需要执行某个具体动作/清单任务时",
  "how-it-works": "需要了解 claude-mem 这套记忆系统的工作原理时",
  "knowledge-agent": "需要把代码库知识沉淀为结构化知识、构建知识代理时",
  "learn-codebase": "开始上手新/陌生项目，需要逐个通读全部源文件建立认知时",
  "make-plan": "需要为一项工作制定计划时",
  "mem-search": "需要在记忆库中检索过往记录/知识时",
  "oh-my-issues": "需要处理/汇总 GitHub issues 时",
  "pathfinder": "需要定位代码库/项目结构中相关文件与路径时",
  "smart-explore": "需要高效探索代码库、快速建立项目地图时",
  "timeline-report": "需要按时间线生成工作报告/进度汇总时",
  "version-bump": "需要做版本号提升并生成 changelog 时",
  "weekly-digests": "需要生成周报/周期性摘要时",
  "wowerpoint": "需要用 wowerpoint 生成演示文稿时",
  // karpathy
  "karpathy-guidelines": "需要遵循 Andrej Karpathy 的编码/工程指导原则时",
};

// Path reference fixups inside SKILL.md bodies (adapt Claude "skills/<name>/"
// prefix to dsh directory-form base relative reference).
const REFERENCE_FIXUPS = {
  "brainstorming": [["skills/brainstorming/visual-companion.md", "visual-companion.md"]],
};

function parseFrontmatter(raw) {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== "---") return { frontLines: null, body: raw };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") { end = i; break; }
  }
  if (end < 0) return { frontLines: null, body: raw };
  const frontLines = lines.slice(1, end);
  const body = lines.slice(end + 1).join("\n");
  return { frontLines, body };
}

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function main() {
  const skills = [];
  for (const src of SOURCES) {
    for (const ent of await readdir(src, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const skillDir = join(src, ent.name);
      const skillMd = join(skillDir, "SKILL.md");
      const st = await stat(skillMd).catch(() => null);
      if (!st) {
        console.log(`WARN: no SKILL.md in ${skillDir}, skipping`);
        continue;
      }
      const raw = await readFile(skillMd, "utf8");
      const parsed = parseFrontmatter(raw);
      skills.push({ name: ent.name, skillDir, skillMd, raw, parsed });
    }
  }
  console.log(`Found ${skills.length} skills`);

  const nameRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  for (const s of skills) {
    if (!nameRe.test(s.name)) {
      console.log(`WARN: invalid skill name "${s.name}", skipping`);
      continue;
    }
    const outDir = join(OUT_ROOT, s.name);
    await mkdir(outDir, { recursive: true });

    // 1) copy all files from source skill dir (except SKILL.md which we rewrite)
    const files = await walk(s.skillDir);
    for (const f of files) {
      const rel = relative(s.skillDir, f);
      if (rel === "SKILL.md") continue;
      const target = join(outDir, rel);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(f, target);
    }

    // 2) rewrite SKILL.md with whenToUse injected into frontmatter + reference fixups
    let body = s.parsed.body;
    const fixups = REFERENCE_FIXUPS[s.name] || [];
    for (const [a, b] of fixups) body = body.split(a).join(b);

    // Reconstruct frontmatter lines, inserting whenToUse after description if absent.
    let frontLines = s.parsed.frontLines || [];
    const hasWhen = frontLines.some((l) => /^whenToUse\s*:/.test(l));
    if (!hasWhen) {
      const zh = WHEN_TO_USE[s.name];
      if (zh) {
        const descIdx = frontLines.findIndex((l) => /^description\s*:/.test(l));
        const insertAt = descIdx >= 0 ? descIdx + 1 : frontLines.length;
        frontLines = [...frontLines.slice(0, insertAt), `whenToUse: ${JSON.stringify(zh)}`, ...frontLines.slice(insertAt)];
      }
    }
    const outMd = `---\n${frontLines.join("\n")}\n---\n${body.replace(/\n$/, "")}\n`;

    await writeFile(join(outDir, "SKILL.md"), outMd, "utf8");
    console.log(`OK ${s.name}`);
  }
  console.log("done");
}

main().catch((e) => { console.error(e); process.exit(1); });
