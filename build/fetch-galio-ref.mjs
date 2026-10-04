const base = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/characters/galio/skins/skin47/';
const names = [
  'galiosplash_47.skins_galio_skin47.jpg',
  'galio_skin47_splash.jpg',
  'galioloadscreen_47.skins_galio_skin47.jpg',
  'splash_centered.jpg',
];
for (const n of names) {
  const u = base + n;
  try { const r = await fetch(u); console.log(r.status, r.headers.get('content-length'), u); }
  catch (e) { console.log('ERR', e.message, u); }
}
// list via JSON index if available
for (const idx of [
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/characters/galio/skins/skin47/',
]) {
  try { const r = await fetch(idx); console.log('JSON len', r.status, (await r.text()).slice(0,500)); }
  catch (e) { console.log('idx ERR', e.message); }
}