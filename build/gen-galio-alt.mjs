import { writeFileSync, mkdirSync } from 'node:fs';

const key = process.env.SILICONFLOW_API_KEY;
const outDir = 'D:/Bigfish/build/galio-preview';
mkdirSync(outDir, { recursive: true });

const prompt = '鍙埍鐨勫崱閫氱増鑻遍泟鑱旂洘鍔犻噷濂ワ紙T1 2023 涓栫晫璧涚毊鑲わ級锛孮鐗堝ぇ澶村皬韬瓙鐨勭煶鍍忓畧鎶ょ锛岀孩榛戦厤鑹插甫閲戣壊闀惰竟涓庣櫧鑹茬窘缈肩偣缂€锛屽渾娑﹀彲鐖憋紝鍏ㄨ韩绔欑珛姝ｉ潰鍏ㄨ韩鍍忥紝灞呬腑锛岄珮娓咃紝娓告垙鍘熺敾椋庢牸锛岀函鐧借儗鏅?;

const variants = [
  { name: 'D-ZImage', model: 'Tongyi-MAI/Z-Image' },
  { name: 'E-ZImage-Turbo', model: 'Tongyi-MAI/Z-Image-Turbo' },
  { name: 'F-Kolors', model: 'Kwai-Kolors/Kolors' },
  { name: 'G-ERNIE', model: 'baidu/ERNIE-Image-Turbo' },
];

async function genOne(v) {
  try {
    const resp = await fetch('https://api.siliconflow.cn/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: v.model, prompt, image_size: '1024x1024', num_inference_steps: 20 }),
    });
    const j = await resp.json();
    if (!resp.ok) return { ...v, error: j.message || ('HTTP ' + resp.status) };
    const img = (j.images || j.data || [])[0];
    if (!img) return { ...v, error: 'no image' };
    if (img.url) {
      const b = Buffer.from(await (await fetch(img.url)).arrayBuffer());
      const p = outDir + '/' + v.name + '.png';
      writeFileSync(p, b);
      return { ...v, ok: true, file: p, bytes: b.length };
    }
    if (img.b64_json) {
      const p = outDir + '/' + v.name + '.png';
      writeFileSync(p, Buffer.from(img.b64_json, 'base64'));
      return { ...v, ok: true, file: p };
    }
    return { ...v, error: 'unparseable' };
  } catch (e) {
    return { ...v, error: String(e.message || e) };
  }
}

for (const v of variants) {
  const r = await genOne(v);
  console.log(JSON.stringify(r));
}
console.log('DONE');