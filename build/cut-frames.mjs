import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

const SRC = 'D:/Bigfish/build/galio-preview/ChatGPT Image 2026年8月16日 18_34_51.png';
const OUT = 'D:/Bigfish/build/galio-preview/frames';
mkdirSync(OUT, { recursive: true });

const W = 1536, H = 1024;
const COLS = 4, ROWS = 2;
const CW = Math.round(W/COLS), CH = Math.round(H/ROWS);

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const c = info.channels;
const isNearWhiteGray = (r,g,b) => r>=232 && g>=232 && b>=232 && Math.abs(r-g)<10 && Math.abs(g-b)<10;

for (let p = 0; p < COLS*ROWS; p++) {
  const col = p % COLS, row = Math.floor(p / COLS);
  const x0 = col*CW, y0 = row*CH;

  // build cell RGBA + flood-fill light-gray/white background from cell borders
  const cell = Buffer.alloc(CW*CH*4);
  const isBg = new Uint8Array(CW*CH);
  for (let y=0;y<CH;y++) for (let x=0;x<CW;x++) {
    const src = (y0+y)*W + (x0+x);
    const r = data[src*c], g = data[src*c+1], b = data[src*c+2];
    const o = (y*CW + x)*4;
    cell[o]=r; cell[o+1]=g; cell[o+2]=b;
    if (isNearWhiteGray(r,g,b)) { isBg[y*CW+x]=1; } else { cell[o+3]=255; }
  }
  // flood fill bg from borders
  const visited = new Uint8Array(CW*CH);
  const q=[];
  const push=(x,y)=>{const i=y*CW+x; if(isBg[i]&&!visited[i]){visited[i]=1;q.push(i);}};
  for(let x=0;x<CW;x++){push(x,0);push(x,CH-1);}
  for(let y=0;y<CH;y++){push(0,y);push(CW-1,y);}
  while(q.length){const i=q.pop();const x=i%CW,y=(i/CW)|0;
    if(x>0)push(x-1,y);if(x<CW-1)push(x+1,y);if(y>0)push(x,y-1);if(y<CH-1)push(x,y+1);}
  for(let i=0;i<CW*CH;i++){ if(visited[i]) cell[i*4+3]=0; }

  // crop to opaque bbox
  let minX=CW,minY=CH,maxX=-1,maxY=-1;
  for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
    if(cell[(y*CW+x)*4+3]>0){ if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y; }
  }
  if(maxX<0){ console.log('frame',p,'all transparent'); continue; }
  const bw=maxX-minX+1, bh=maxY-minY+1;
  const outp = OUT + '/frame-' + String(p).padStart(2,'0') + '.png';
  await sharp(cell, { raw:{width:CW,height:CH,channels:4} })
    .extract({left:minX,top:minY,width:bw,height:bh})
    .png().toFile(outp);
  console.log('frame', p, '->', bw+'x'+bh, outp);
}
console.log('DONE');