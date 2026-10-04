import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

const SRC_DIR='D:/Bigfish/build/galio-preview/';
const OUT='D:/Bigfish/build/galio-preview/stand';
mkdirSync(OUT,{recursive:true});

const mapping = {
  'idle-1': 1,
  'idle-2': 2,
  'idle-3': 6,
  'idle-4': 7,
  'eat': 8,
  'sleep': 9,
};

// per-image watermark clear rect (verified: no character pixels inside)
const WM = { 1:[1750,1820], 2:[1750,1820], 6:[1750,1820], 7:[1750,1820], 8:[1750,1820], 9:[1780,1850] };

const WHITE_T = 238; // near-pure white background only (preserves gray metal lum<=224 & light highlights)

for (const [name, num] of Object.entries(mapping)) {
  const src = SRC_DIR + '加里奥T1皮肤卡通图生成 (' + num + ').png';
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, c = info.channels;
  const [wmx, wmy] = WM[num];

  const isBg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y*w + x, r = data[i*c], g = data[i*c+1], b = data[i*c+2];
    isBg[i] = (r >= WHITE_T && g >= WHITE_T && b >= WHITE_T) ? 1 : 0;
  }
  // force watermark rect to background
  for (let y = wmy; y < h; y++) for (let x = wmx; x < w; x++) isBg[y*w + x] = 1;

  const visited = new Uint8Array(w * h);
  const q = [];
  const push = (x, y) => { const idx = y*w + x; if (isBg[idx] && !visited[idx]) { visited[idx] = 1; q.push(idx); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h-1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w-1, y); }
  while (q.length) {
    const idx = q.pop();
    const x = idx % w, y = (idx / w) | 0;
    if (x > 0) push(x-1, y);
    if (x < w-1) push(x+1, y);
    if (y > 0) push(x, y-1);
    if (y < h-1) push(x, y+1);
  }

  const out = Buffer.alloc(w * h * 4);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y*w + x, o = i*4;
    out[o] = data[i*c];
    out[o+1] = data[i*c+1];
    out[o+2] = data[i*c+2];
    if (visited[i]) { out[o+3] = 0; }
    else {
      out[o+3] = 255;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .png().toFile(OUT + '/' + name + '.png');
  console.log(name, '<- ('+num+')', 'wm rect x>='+wmx+' y>='+wmy, '->', bw+'x'+bh);
}
console.log('DONE');