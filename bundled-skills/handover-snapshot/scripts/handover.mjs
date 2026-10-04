#!/usr/bin/env node
// handover.mjs — Task Handover Snapshot helper for the handover-snapshot skill.
//
// Commands:
//   list  [--dir <dir>]        List all snapshots, newest first, with a short head summary.
//   read  <file>               Print the full snapshot content.
//   write --name "<brief>" [--dir <dir>]   Create a new snapshot; content read from stdin.
//
// Default --dir: D:\Bigfish\.handover-snapshots\
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";

const DEFAULT_DIR = "D:\\Bigfish\\.handover-snapshots";

function usage() {
  console.error(
    "Usage:\n" +
      "  handover.mjs list [--dir <dir>]                       list snapshots newest-first\n" +
      "  handover.mjs read <file>                              print full snapshot\n" +
      "  handover.mjs write --name \"<brief>\" [--dir <dir>]     write new snapshot (content via stdin)"
  );
}

function parseArgs(argv) {
  const a = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") {
      flags.dir = argv[++i];
    } else if (argv[i] === "--name") {
      flags.name = argv[++i];
    } else {
      a.push(argv[i]);
    }
  }
  return { positional: a, flags };
}

function headSummary(content) {
  // First 12 lines: frontmatter-ish header with 会话标识/目标/生成时间 etc.
  return content.split(/\r?\n/).slice(0, 12).join("\n");
}

async function listSnapshots(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch (e) {
    return []; // dir may not exist yet
  }
  const snaps = [];
  for (const e of entries) {
    if (extname(e).toLowerCase() !== ".md") continue;
    const p = join(dir, e);
    let st;
    try {
      st = await stat(p);
    } catch {
      continue;
    }
    let summary = "";
    try {
      summary = headSummary(await readFile(p, "utf8"));
    } catch {}
    snaps.push({ file: e, path: p, mtime: st.mtime, summary });
  }
  snaps.sort((x, y) => y.mtime - x.mtime); // newest first
  return snaps;
}

async function cmdList({ flags }) {
  const dir = flags.dir || DEFAULT_DIR;
  const snaps = await listSnapshots(dir);
  if (snaps.length === 0) {
    console.log(`(no snapshots found in ${dir})`);
    return;
  }
  const pad = String(snaps.length).length;
  snaps.forEach((s, i) => {
    const idx = String(i + 1).padStart(pad);
    console.log(`[${idx}] ${s.file}`);
    console.log(`     mtime: ${s.mtime.toISOString()}`);
    console.log(`     path:  ${s.path}`);
    const h = s.summary.replace(/^/gm, "     ");
    if (h.trim()) console.log(h);
    console.log("");
  });
}

async function cmdRead({ positional }) {
  if (positional.length === 0) {
    usage();
    process.exit(1);
  }
  const file = positional[0];
  let content;
  try {
    content = await readFile(file, "utf8");
  } catch (e) {
    console.error(`read failed: ${e.message}`);
    process.exit(1);
  }
  console.log(content);
}

async function cmdWrite({ flags }) {
  const dir = flags.dir || DEFAULT_DIR;
  const name = flags.name || "snapshot";
  const content = await readStdin();
  if (!content.trim()) {
    console.error("error: empty snapshot content on stdin");
    process.exit(1);
  }
  await mkdir(dir, { recursive: true });
  const ts = timestamp();
  const safeName = name.replace(/[^\w\u4e00-\u9fa5\-_]/g, "_").slice(0, 60);
  const file = `${ts}-${safeName}.md`;
  const path = join(dir, file);
  await writeFile(path, content, "utf8");
  console.log(path);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const cmd = positional.shift();

switch (cmd) {
  case "list":
    await cmdList({ positional, flags });
    break;
  case "read":
    await cmdRead({ positional, flags });
    break;
  case "write":
    await cmdWrite({ positional, flags });
    break;
  default:
    usage();
    process.exit(1);
}
