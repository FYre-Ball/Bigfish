import { createRequire } from 'node:module';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

const p='D:/Bigfish/build/galio-preview/skinframes/idle-1.png';
const {data,info}=await sharp(p).raw().toBuffer({resolveWithObject:true});
const w=info.width,h=info.height,c=info.channels;
// dump bottom 8 rows colors
for(let y=h-8;y<h;y++){
  let key=[];
  for(let x=0;x<w;x++){
    const i=(y*w+x)*4,a=data[i+3];
    if(a<10)continue;
    const r=data[i],g=data[i+1],b=data[i+2];
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    const sat=mx-mn;
    if(sat<=18) key.push(`(${r},${g},${b})`); else key.push(`SAT(${r},${g},${b})`);
  }
  console.log('y='+y, 'opaque='+key.length, key.slice(0,8).join(' '));
}