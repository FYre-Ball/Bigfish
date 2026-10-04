'use strict';
// Step 1: remove near-white background from the chosen Galio image,
// crop to the opaque bounding box, resize to a consistent height, and
// emit a transparent idle master + preview PNG.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

const SRC = 'D:/Bigfish/build/galio-preview/ChatGPT Image 2026年8月16日 18_34_51.png';
const OUT_IDLE = 'D:/Bigfish/build/galio-preview/chatgpt-idle.png';
const TARGET_H = 160;

// Tolerance: the near-white bg here is ~248-254. Use a threshold that also
// handles anti-aliased edges (slightly lower than 255).
const WHITE_T = 238;

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const w = info.width, h = info.height, c = info.channels; // RGB

// flood-fill near-white from borders -> mark as background
const isBg = new Uint8Array(w * h);
for (let i = 0; i < w * h; i++) {
  const r = data[i * c], g = data[i * c + 1], b = data[i * c + 2];
  isBg[i] = (r >= WHITE_T && g >= WHITE_T && b >= WHITE_T) ? 1 : 0;
}
const visited = new Uint8Array(w * h);
const q = [];
const push = (x, y) => { const idx = y * w + x; if (isBg[idx] && !visited[idx]) { visited[idx] = 1; q.push(idx); } };
for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
while (q.length) {
  const idx = q.pop();
  const x = idx % w, y = (idx / w) | 0;
  if (x > 0) push(x - 1, y);
  if (x < w - 1) push(x + 1, y);
  if (y > 0) push(x, y - 1);
  if (y < h - 1) push(x, y + 1);
}

const out = Buffer.alloc(w * h * 4);
let minX = w, minY = h, maxX = -1, maxY = -1;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = y * w + x, o = i * 4;
    out[o] = data[i * c];
    out[o + 1] = data[i * c + 1];
    out[o + 2] = data[i * c + 2];
    if (visited[i]) {
      out[o + 3] = 0;
    } else {
      out[o + 3] = 255;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) { console.log('全透明，失败'); process.exit(1); }
const bw = maxX - minX + 1, bh = maxY - minY + 1;
console.log('原图', w + 'x' + h, '-> 主体包围盒', bw + 'x' + bh, 'left', minX, 'top', minY);

await sharp(out, { raw: { width: w, height: h, channels: 4 } })
  .extract({ left: minX, top: minY, width: bw, height: bh })
  .resize({ height: TARGET_H })
  .png()
  .toFile(OUT_IDLE);
console.log('已写出', OUT_IDLE);