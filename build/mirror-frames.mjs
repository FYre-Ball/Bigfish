import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

const CLEAN='D:/Bigfish/build/galio-preview/clean2';
const OUT='D:/Bigfish/build/galio-preview/mirror2';
mkdirSync(OUT,{recursive:true});

for(let p=0;p<8;p++){
  const src=CLEAN+'/cz-'+String(p).padStart(2,'0')+'.png';
  const dst=OUT+'/mirror-'+String(p).padStart(2,'0')+'.png';
  await sharp(src).flop().png().toFile(dst);
  console.log('mirror', p, '->', dst);
}
console.log('DONE');