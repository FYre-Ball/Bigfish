import { createRequire } from 'node:module';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

const SRC = 'D:/Bigfish/build/galio-preview/ChatGPT Image 2026年8月16日 18_34_51.png';
const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const w = info.width, h = info.height, c = info.channels;

// classify near-white vs non-white
let white = 0, nonwhite = 0;
for (let i = 0; i < w * h; i++) {
  const r = data[i*c], g = data[i*c+1], b = data[i*c+2];
  if (r >= 238 && g >= 238 && b >= 238) white++; else nonwhite++;
}
console.log('white px', white, 'nonwhite', nonwhite, 'white%', (100*white/(white+nonwhite)).toFixed(1));

// sample a grid of rows to see where content begins/ends (per row nonwhite count)
for (let frac = 0; frac <= 10; frac++) {
  const y = Math.floor(h * frac / 10);
  let nw = 0;
  for (let x = 0; x < w; x++) {
    const i = y*w + x;
    const r=data[i*c],g=data[i*c+1],b=data[i*c+2];
    if (!(r>=238&&g>=238&&b>=238)) nw++;
  }
  console.log('row', (frac*10).toString().padStart(3) + '%', 'nonwhite', nw, '/', w);
}