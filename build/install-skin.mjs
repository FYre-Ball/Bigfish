import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const STAGE='D:/Bigfish/build/galio-preview/skinframes';
const SKIN_DIR='C:/Users/11860/AppData/Roaming/bigfish/pet-skins/galio-t1';
mkdirSync(SKIN_DIR, { recursive: true });

const files = readdirSync(STAGE).filter(f => f.endsWith('.png'));
for (const f of files) {
  copyFileSync(join(STAGE, f), join(SKIN_DIR, f));
}
console.log('installed skin to', SKIN_DIR);
console.log('frames:', files.sort().join(', '));