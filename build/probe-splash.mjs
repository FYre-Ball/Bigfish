import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require('sharp');

const candidates = [
  // dedicated/splash (vertical) then centered horizontal
  ['splash_dedicated', 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-splashes/3/3047.jpg'],
  ['splash_centered', 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-splashes/3/3047_centered.jpg'],
  ['splash_uncentered', 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-splashes/3/3047_uncentered.jpg'],
  ['ddragon_splash', 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Galio_47.jpg'],
  ['cdragon_cdn', 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-splashes/3/3047_splash.jpg'],
];

for (const [label, u] of candidates) {
  try {
    const r = await fetch(u);
    if (!r.ok) { console.log(label, 'FAIL', r.status); continue; }
    const b = Buffer.from(await r.arrayBuffer());
    const ext = u.includes('centered') || u.includes('ddragon') ? 'jpg' : 'jpg';
    const p = 'D:/Bigfish/build/galio-preview/ref-' + label + '.jpg';
    writeFileSync(p, b);
    let dim = '';
    try { const m = await sharp(p).metadata(); dim = m.width + 'x' + m.height; } catch {}
    console.log(label, 'OK', b.length, 'bytes', dim, '->', p);
  } catch (e) { console.log(label, 'ERR', e.message); }
}