import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

const BASE='D:/Bigfish/build/galio-preview';
const STAND=BASE+'/stand';       // standing poses (1,2,6,7,8,9), white bg removed
const CLEAN=BASE+'/clean2';      // walk frames from sprite sheet
const MIRROR=BASE+'/mirror2';
const STAGE=BASE+'/skinframes2';
mkdirSync(STAGE,{recursive:true});

const TARGET_H=160;

// final mapping
const map = {
  'idle-1.png':        { dir: STAND, file: 'idle-1.png' },
  'idle-2.png':        { dir: STAND, file: 'idle-2.png' },
  'idle-3.png':        { dir: STAND, file: 'idle-3.png' },
  'idle-4.png':        { dir: STAND, file: 'idle-4.png' },
  'walk-right-1.png':  { dir: CLEAN, file: 'cz-03.png' },
  'walk-right-2.png':  { dir: CLEAN, file: 'cz-04.png' },
  'walk-left-1.png':   { dir: MIRROR, file: 'mirror-03.png' },
  'walk-left-2.png':   { dir: MIRROR, file: 'mirror-04.png' },
  'eat-1.png':         { dir: STAND, file: 'eat.png' },
  'eat-2.png':         { dir: STAND, file: 'eat.png' },
  'eat-3.png':         { dir: STAND, file: 'eat.png' },
  'eat-4.png':         { dir: STAND, file: 'eat.png' },
  'sleep.png':         { dir: STAND, file: 'sleep.png' },
};

// load all source buffers resized to height 160
const cache = {};
for (const [out, { dir, file }] of Object.entries(map)) {
  const key = dir + '/' + file;
  if (cache[key]) continue;
  const buf = await sharp(dir + '/' + file).resize({ height: TARGET_H }).png().toBuffer();
  const m = await sharp(buf).metadata();
  cache[key] = { buf, w: m.width };
  console.log('load', file, m.width + 'x' + m.height);
}
const maxW = Math.max(...Object.values(cache).map(v => v.w));
console.log('maxW =', maxW);

for (const [out, { dir, file }] of Object.entries(map)) {
  const { buf, w } = cache[dir + '/' + file];
  const canvas = await sharp({
    create: { width: maxW, height: TARGET_H, channels: 4, background: { r:0, g:0, b:0, alpha:0 } }
  })
    .composite([{ input: buf, left: Math.round((maxW - w) / 2), top: 0 }])
    .png().toBuffer();
  await sharp(canvas).png().toFile(STAGE + '/' + out);
  console.log('wrote', out, '(' + maxW + 'x' + TARGET_H + ')');
}
console.log('ASSEMBLE DONE ->', STAGE);