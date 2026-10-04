import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

const SRC = 'D:/Bigfish/build/galio-preview/ChatGPT Image 2026年8月16日 18_34_51.png';
const OUT = 'D:/Bigfish/build/galio-preview/frames';
mkdirSync(OUT, { recursive: true });

const W = 1536, H = 1024;
const COLS = 4, ROWS = 2;
const CW = Math.round(W / COLS);   // 384
const CH = Math.round(H / ROWS);   // 512

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const c = info.channels;
const at = (x, y) => { const i = (y*W + x)*c; return { r: data[i], g: data[i+1], b: data[i+2] }; };
const isGray = (p) => Math.abs(p.r-p.g)<14 && Math.abs(p.g-p.b)<14;

// For each cell, compute colored-pixels bounding box (within that cell)
for (let p = 0; p < COLS*ROWS; p++) {
  const col = p % COLS, row = Math.floor(p / COLS);
  const x0 = col*CW, y0 = row*CH;
  let minX=CW, minY=CH, maxX=-1, maxY=-1;
  for (let y=0; y<CH; y++) for (let x=0; x<CW; x++) {
    const pt = at(x0+x, y0+y);
    // colored = not near-gray (armor is red/gold, bg is light gray checker)
    if (!isGray(pt)) {
      if (x<minX)minX=x; if(x>maxX)maxX=x;
      if (y<minY)minY=y; if(y>maxY)maxY=y;
    }
  }
  console.log('frame', p, '(row', row, 'col', col + ')', 'colored bbox in cell:', minX+','+minY, '->', maxX+','+maxY, 'size', (maxX-minX+1)+'x'+(maxY-minY+1));
}