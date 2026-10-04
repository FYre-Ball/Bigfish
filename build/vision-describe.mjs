import { readFileSync } from 'node:fs';
const SRC = 'D:/Bigfish/build/galio-preview/ChatGPT Image 2026骞?鏈?6鏃?18_34_51.png';
const b64 = readFileSync(SRC).toString('base64');
const SF_KEY = process.env.SILICONFLOW_API_KEY;
const q = '璇疯缁嗘弿杩拌繖寮犲浘鐗囷細涓讳綋鏄粈涔堬紵鏄崟涓鑹茬珛缁樿繕鏄湁鑳屾櫙鍦烘櫙锛熶富浣撳湪鐢婚潰浠€涔堜綅缃紵鑳屾櫙棰滆壊锛熺敾闈㈠簳閮ㄦí璐殑鏄粈涔堬紵鏈夋病鏈夋枃瀛楋紵鐢ㄤ簬鍒ゆ柇濡備綍鎶犲浘銆?;

const models = ['Qwen/Qwen3-VL-32B-Instruct', 'deepseek-ai/DeepSeek-OCR'];
for (const m of models) {
  const r = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SF_KEY },
    body: JSON.stringify({
      model: m,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } },
        { type: 'text', text: q },
      ]}],
    }),
  });
  const t = await r.text();
  console.log('\n[' + m + '] status', r.status);
  try { const j = JSON.parse(t); console.log(j.choices?.[0]?.message?.content || JSON.stringify(j).slice(0,600)); }
  catch { console.log(t.slice(0,600)); }
}