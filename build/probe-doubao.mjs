const KEY = process.env.ARK_API_KEY;
if (!KEY) throw new Error('缺少 ARK_API_KEY 环境变量（火山引擎 Ark API Key）');
const base = 'https://ark.cn-beijing.volces.com/api/v3';

const candidates = [
  'doubao-seedream-4-5-251128',
  'doubao-seedream-4-0-250828',
  'doubao-seedream-4-0-20260415',
  'doubao-seedream-5-0-260128',
  'doubao-seedream-5-0-pro-260628',
  'doubao-seedream-3-0-t2i-250415',
  'doubao-seededit-3-0-i2i-250628',
];

async function tryModel(model) {
  const body = { model, prompt: '一只可爱的卡通小猫', size: '1024x1024', response_format: 'url', n: 1 };
  let status = '', msg = '';
  try {
    const r = await fetch(base + '/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify(body),
    });
    status = r.status;
    const j = await r.json();
    msg = (j.error && (j.error.message || j.error.code)) || (j.data ? 'OK' : JSON.stringify(j).slice(0,120));
  } catch (e) { msg = 'ERR ' + e.message; }
  console.log(model + '  ->  ' + status + '  ' + msg);
}

for (const m of candidates) { await tryModel(m); }