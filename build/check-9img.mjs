import { createRequire } from 'node:module';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

// verify gray metal survived in cut images
for (const n of ['idle-1','idle-2','eat','sleep']){
  const p='D:/Bigfish/build/galio-preview/stand/'+n+'.png';
  const {data,info}=await sharp(p).raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=info.height,c=info.channels;
  let gray=0, opaque=0;
  for(let i=0;i<w*h;i++){
    const a=data[i*c+3];
    if(a<10)continue;
    opaque++;
    const r=data[i*c],g=data[i*c+1],b=data[i*c+2];
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    if((mx-mn)<=20 && mn>=90 && mx<=230) gray++; // metal gray
  }
  console.log(n, w+'x'+h, 'opaque='+opaque, 'gray='+gray, '('+(100*gray/opaque).toFixed(1)+'%)');
}