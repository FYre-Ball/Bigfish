import { createRequire } from 'node:module';
const require = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require('sharp');

for (const n of ['A-chibi-redblack', 'B-standing-heroic', 'C-cute-mascot']) {
  const p = 'D:/Bigfish/build/galio-preview/' + n + '.png';
  const meta = await sharp(p).metadata();
  // sample corner and center alpha
  const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  const hasAlpha = c === 4;
  const px = (x, y) => {
    const i = (y * info.width + x) * c;
    return { r: data[i], g: data[i+1], b: data[i+2], a: hasAlpha ? data[i+3] : 255 };
  };
  console.log(n, meta.width + 'x' + meta.height, 'channels=' + c, 'hasAlpha=' + hasAlpha,
    'corner=', JSON.stringify(px(2,2)), 'center=', JSON.stringify(px(Math.floor(info.width/2), Math.floor(info.height/2))));
}