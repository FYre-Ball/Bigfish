import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

const BASE='D:/Bigfish/build/galio-preview';
const CLEAN=BASE+'/clean2';
const MIRROR=BASE+'/mirror2';
const STAGE=BASE+'/skinframes';
mkdirSync(STAGE,{recursive:true});

const TARGET_H=160;

const map = {
  'idle-1.png': ['clean','01'],
  'idle-2.png': ['clean','02'],
  'idle-3.png': ['clean','06'],
  'idle-4.png': ['clean','07'],
  'eat-1.png':  ['clean','00'],
  'eat-2.png':  ['clean','05'],
  'eat-3.png':  ['clean','02'],
  'eat-4.png':  ['clean','00'],
  'walk-right-1.png': ['clean','03'],
  'walk-right-2.png': ['clean','04'],
  'walk-left-1.png':  ['mirror','03'],
  'walk-left-2.png':  ['mirror','04'],
  'sleep.png':  ['clean','00'],
};

const cache = {};
for (const [out, [kind, num]] of Object.entries(map)) {
  const key = kind+'-'+num;
  if (cache[key]) continue;
  const src = (kind==='clean'?CLEAN:MIRROR)+'/'+(kind==='clean'?'cz-':'mirror-')+num+'.png';
  const buf = await sharp(src).resize({ height: TARGET_H }).png().toBuffer();
  const m = await sharp(buf).metadata();
  cache[key] = { buf, w: m.width };
  console.log('load', key, m.width+'x'+m.height);
}
const maxW = Math.max(...Object.values(cache).map(v => v.w));
console.log('maxW =', maxW);

for (const [out, [kind, num]] of Object.entries(map)) {
  const key = kind+'-'+num;
  const { buf, w } = cache[key];
  const canvas = await sharp({
    create: { width: maxW, height: TARGET_H, channels: 4, background: { r:0, g:0, b:0, alpha:0 } }
  })
    .composite([{ input: buf, left: Math.round((maxW - w) / 2), top: 0 }])
    .png().toBuffer();
  await sharp(canvas).png().toFile(STAGE+'/'+out);
  console.log('wrote', out, '('+maxW+'x'+TARGET_H+')');
}
console.log('ASSEMBLE DONE ->', STAGE);