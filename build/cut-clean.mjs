import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

const SRC='D:/Bigfish/build/galio-preview/ChatGPT Image 2026年8月16日 18_34_51.png';
const CLEAN='D:/Bigfish/build/galio-preview/clean2';
mkdirSync(CLEAN,{recursive:true});

const W=1536,H=1024,CW=W/4,CH=H/2;
const {data,info}=await sharp(SRC).raw().toBuffer({resolveWithObject:true});
const c=info.channels;

function isChecker(r,g,b){return r>=232&&g>=232&&b>=232;}
function isSaturated(r,g,b){return (Math.max(r,g,b)-Math.min(r,g,b))>30;}

for(let p=0;p<8;p++){
  const col=p%4,row=(p/4)|0,x0=col*CW,y0=row*CH;

  // RGBA + remove checker
  const cell=Buffer.alloc(CW*CH*4);
  const isBg=new Uint8Array(CW*CH);
  for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
    const i=(y0+y)*W+(x0+x),r=data[i*c],g=data[i*c+1],b=data[i*c+2];
    const o=(y*CW+x)*4;cell[o]=r;cell[o+1]=g;cell[o+2]=b;
    if(isChecker(r,g,b))isBg[y*CW+x]=1;else cell[o+3]=255;
  }
  const vis=new Uint8Array(CW*CH);const q=[];
  const push=(x,y)=>{const i=y*CW+x;if(isBg[i]&&!vis[i]){vis[i]=1;q.push(i);}};
  for(let x=0;x<CW;x++){push(x,0);push(x,CH-1);}
  for(let y=0;y<CH;y++){push(0,y);push(CW-1,y);}
  while(q.length){const i=q.pop();const x=i%CW,y=(i/CW)|0;
    if(x>0)push(x-1,y);if(x<CW-1)push(x+1,y);if(y>0)push(x,y-1);if(y<CH-1)push(x,y+1);}
  for(let i=0;i<CW*CH;i++)if(vis[i])cell[i*4+3]=0;

  // per-row saturated(armor/body) count
  const rowSat=[];
  for(let y=0;y<CH;y++){let n=0;for(let x=0;x<CW;x++){
    if(cell[(y*CW+x)*4+3]===0)continue;
    const r=cell[(y*CW+x)*4],g=cell[(y*CW+x)*4+1],b=cell[(y*CW+x)*4+2];
    if(isSaturated(r,g,b))n++;
  }rowSat.push(n);}

  // group rows with sat>=10 into blocks (gap <=3 rows merges), find longest block
  const blocks=[];let s=-1,cur=[];
  for(let y=0;y<CH;y++){
    const on = rowSat[y]>=10;
    if(on){ if(s<0)s=y; cur.push(y); }
    else if(s>=0){ if(y - cur[cur.length-1] > 3){ blocks.push([s, cur[cur.length-1]]); s=-1; cur=[]; } }
  }
  if(s>=0) blocks.push([s, cur[cur.length-1]]);

  // body = longest block (the armor spans most of the height; text is a short block)
  let body=blocks[0];
  for(const b of blocks) if((b[1]-b[0]) > (body[1]-body[0])) body=b;
  const bodyBottom=body[1];

  // opaque bbox, clamp bottom to bodyBottom
  let minX=CW,minY=CH,maxX=-1,maxY=-1;
  for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
    if(cell[(y*CW+x)*4+3]>10){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
  }
  const bottom=Math.min(maxY,bodyBottom);
  const bw=maxX-minX+1,bh=bottom-minY+1;
  const outp=CLEAN+'/cz-'+String(p).padStart(2,'0')+'.png';
  await sharp(cell,{raw:{width:CW,height:CH,channels:4}})
    .extract({left:minX,top:minY,width:bw,height:bh}).png().toFile(outp);
  console.log('frame',p,'blocks:',blocks.map(b=>b[0]+'-'+b[1]).join(' | '),'-> bodyBottom='+bodyBottom,'size',bw+'x'+bh);
}
console.log('DONE');