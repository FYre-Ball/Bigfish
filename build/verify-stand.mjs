import { createRequire } from 'node:module';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

// objective check: watermark rect should have ZERO opaque pixels now
for (const [name, [wmx,wmy]] of Object.entries({
  'idle-1':[1750,1820], 'idle-2':[1750,1820], 'idle-3':[1750,1820],
  'idle-4':[1750,1820], 'eat':[1750,1820], 'sleep':[1780,1850]
})){
  const p='D:/Bigfish/build/galio-preview/stand/'+name+'.png';
  const {data,info}=await sharp(p).raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=info.height;
  // map original coords to cropped image coords: we need the actual crop offset.
  // Instead, check the actual bottom-right corner of the cropped image (watermark was at original bottom-right).
  // The crop kept maxX/maxY at the watermark boundary, so corner should be opaque-free.
  let cornerOp=0;
  const cx=w-80, cy=h-80; // bottom-right 80x80 of cropped image
  for(let y=Math.max(0,h-80);y<h;y++)for(let x=Math.max(0,w-80);x<w;x++){
    if(data[(y*w+x)*4+3]>10)cornerOp++;
  }
  // also full bottom-right 200x150
  let brOp=0;
  for(let y=Math.max(0,h-150);y<h;y++)for(let x=Math.max(0,w-200);x<w;x++){
    if(data[(y*w+x)*4+3]>10)brOp++;
  }
  console.log(name, 'size='+w+'x'+h, 'bottomright 200x150 opaque='+brOp, '| 80x80 opaque='+cornerOp);
}