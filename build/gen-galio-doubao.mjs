import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const KEY = process.env.ARK_API_KEY;
if (!KEY) throw new Error('缺少 ARK_API_KEY 环境变量（火山引擎 Ark API Key）');
const base = 'https://ark.cn-beijing.volces.com/api/v3';
const outDir = 'D:/Bigfish/build/galio-preview';
mkdirSync(outDir, { recursive: true });

const PROMPT = [
  '可爱的卡通Q版英雄联盟加里奥，T1 2023世界赛冠军皮肤',
  '大头小身子的Q版吉祥物比例，圆润可爱，石头巨人，',
  '红黑配色战甲，金色镶边，白色羽翼装饰，背部巨大翅膀，金色头冠',
  '大大的眼睛，微笑，站立正面全身像，居中构图',
  '纯白色背景，2D卡通动漫吉祥物风格，线条清晰，高清'
].join('');

const variants = [
  { name: 'H-seedream40', model: 'doubao-seedream-4-0-250828', size: '1024x1024' },
  { name: 'I-seedream50pro', model: 'doubao-seedream-5-0-pro-260628', size: '1024x1024' },
  { name: 'J-seedream40-v2', model: 'doubao-seedream-4-0-20260415', size: '1024x1024' },
];

async function gen(v) {
  try {
    const body = { model: v.model, prompt: PROMPT, size: v.size, response_format: 'b64_json', n: 1 };
    const r = await fetch(base + '/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) return { ...v, error: (j.error && j.error.message) || ('HTTP ' + r.status) };
    const d = j.data && j.data[0];
    if (!d) return { ...v, error: 'no data' };
    let buf;
    if (d.b64_json) buf = Buffer.from(d.b64_json, 'base64');
    else if (d.url) buf = Buffer.from(await (await fetch(d.url)).arrayBuffer());
    else return { ...v, error: 'no image in data' };
    const p = outDir + '/' + v.name + '.png';
    writeFileSync(p, buf);
    return { ...v, ok: true, file: p, bytes: buf.length };
  } catch (e) { return { ...v, error: String(e.message || e) }; }
}

for (const v of variants) {
  const r = await gen(v);
  console.log(JSON.stringify(r));
}
console.log('DONE');