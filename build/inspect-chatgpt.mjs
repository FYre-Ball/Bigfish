import { createRequire } from 'node:module';
const require = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require('sharp');

const p = 'D:/Bigfish/build/galio-preview/ChatGPT Image 2026年8月16日 18_34_51.png';
const m = await sharp(p).metadata();
console.log('size', m.width + 'x' + m.height, 'channels', m.channels, 'hasAlpha', m.hasAlpha);
const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
const w = info.width, h = info.height, c = info.channels;
const px = (x,y) => { const i=(y*w+x)*c; return {r:data[i],g:data[i+1],b:data[i+2],a:c===4?data[i+3]:255}; };
console.log('TL', JSON.stringify(px(2,2)));
console.log('TR', JSON.stringify(px(w-3,2)));
console.log('BL', JSON.stringify(px(2,h-3)));
console.log('BR', JSON.stringify(px(w-3,h-3)));
console.log('center', JSON.stringify(px(w>>1,h>>1)));