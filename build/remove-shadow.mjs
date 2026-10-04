import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

const CLEAN='D:/Bigfish/build/galio-preview/clean';
const OUT='D:/Bigfish/build/galio-preview/final';
mkdirSync(OUT,{recursive:true});

for(let p=0;p<8;p++){
  const src=CLEAN+'/clean-'+String(p).padStart(2,'0')+'.png';
  const {data,info}=await sharp(src).raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=info.height,c=info.channels;

  // find the LOWERMOST row containing a "dark outline" pixel (foot contour; shadow ring has none)
  let footBottom=-1;
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=(y*w+x)*c;
      const a=data[i+3];
      if(a<10) continue;
      const r=data[i],g=data[i+1],b=data[i+2];
      const lum=0.299*r+0.587*g+0.114*b;
      if(lum<70){ footBottom=y; break; }
    }
  }
  if(footBottom<0){ console.log('frame',p,'no dark outline found, keep as-is'); footBottom=h-1; }

  // crop to opaque bbox but clamp bottom to (footBottom + small pad) to drop residual shadow below the outline
  let minX=w,minY=h,maxX=-1,maxY=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(data[(y*w+x)*c+3]>10){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
  }
  // extend maxY a bit beyond foot contour to keep any legit dark sole pixels, but not the soft shadow
  const bottom = Math.min(maxY, footBottom + 2);
  const bw=maxX-minX+1, bh=Math.max(1, bottom-minY+1);
  const outp=OUT+'/fin-'+String(p).padStart(2,'0')+'.png';
  await sharp(data,{raw:{width:w,height:h,channels:4}})
    .extract({left:minX,top:minY,width:bw,height:bh}).png().toFile(outp);
  console.log('frame',p,'footBottom(darkoutline)=',footBottom,'maxY=',maxY,'-> crop bottom',bottom,'size',bw+'x'+bh);
}
console.log('DONE');