'use strict';
// 打包前置检查(挂载在 predist:win 上,执行 npm run dist:win 时自动运行):
//   1. node-runtime/<node 可执行> 不存在时,复制当前系统 Node(需 ≥ 22)
//   2. dsh-bundle 依赖缺失时,按 lockfile 精确安装
// 两项都就绪时静默通过,打包可一键完成。
const fs = require('fs');
const path = require('path');
const { execSync } = require('node:child_process');

const root = __dirname;
const runtimeFile = path.join(root, 'node-runtime', process.platform === 'win32' ? 'node.exe' : 'node');

if (!fs.existsSync(runtimeFile)) {
  fs.mkdirSync(path.dirname(runtimeFile), { recursive: true });
  fs.copyFileSync(process.execPath, runtimeFile);
  console.log(`[prepare] node-runtime 就绪:已复制 ${process.execPath}`);
} else {
  console.log(`[prepare] node-runtime 已存在,跳过`);
}

const dshBundle = path.join(root, 'dsh-bundle');
const dshBin = path.join(dshBundle, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
if (!fs.existsSync(dshBin)) {
  console.log('[prepare] dsh-bundle 依赖缺失,按 lockfile 安装...');
  execSync('npm ci --omit=dev', { cwd: dshBundle, stdio: 'inherit' });
} else {
  console.log('[prepare] dsh-bundle 依赖已存在,跳过');
}

console.log('[prepare] 打包前置检查完成');
