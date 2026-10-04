import { createRequire } from 'node:module';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

const dir='D:/Bigfish/build/galio-preview/加里奥T1皮肤卡通图生成 ';
// find per-image safe watermark clear rect: for candidate corners, report character-pixel count
// to determine the tightest safe rectangle that still covers the watermark text.
const candidates = [[1760,1830],[1770,1840],[1780,1850],[1790,1855],[1750,1820]];
for (const n of [1,2,6,7,8,9]){
  const p=dir+'('+n+').png';
  const {data,info}=await sharp(p).raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=info.height,c=info.channels;
  const parts=[];
  for (const [x0,y0] of candidates){
    let colorful=0,dark=0;
    for(let y=y0;y<h;y++)for(let x=x0;x<w;x++){
      const i=(y*w+x)*c,r=data[i],g=data[i+1],b=data[i+2];
      const mx=Math.max(r,g,b),mn=Math.min(r,g,b),sat=mx-mn,lum=0.299*r+0.587*g+0.114*b;
      if(r>=250&&g>=250&&b>=250)continue;
      if(sat>25)colorful++; else if(lum<120)dark++;
    }
    parts.push('x'+x0+'y'+y0+':c'+colorful+'d'+dark);
  }
  console.log('('+n+') '+parts.join('  '));
}