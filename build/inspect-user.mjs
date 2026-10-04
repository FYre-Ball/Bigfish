import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require('sharp');

const dir = 'D:/Bigfish/build/galio-preview';
const files = readdirSync(dir).filter(f => f.startsWith('加里奥'));
for (const f of files) {
  const p = dir + '/' + f;
  const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, c = info.channels;
  const px = (x, y) => { const i = (y*w+x)*c; return data.slice(i, i+3).join(','); };
  console.log(f, '| TL', px(2,2), '| TR', px(w-3,2), '| BL', px(2,h-3), '| BR', px(w-3,h-3), '| center', px(w>>1, h>>1));
}