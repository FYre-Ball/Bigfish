import { writeFileSync, mkdirSync } from 'node:fs';

const key = process.env.SILICONFLOW_API_KEY;
const model = 'Qwen/Qwen-Image';
const outDir = 'D:/Bigfish/build/galio-preview';
mkdirSync(outDir, { recursive: true });

const variants = [
  {
    name: 'A-chibi-redblack',
    prompt: '鍙埍鐨勫崱閫氱増鑻遍泟鑱旂洘鍔犻噷濂ワ紝T1 2023 涓栫晫璧涚毊鑲わ紝Q鐗堝ぇ澶村▋濞冪煶鍍忓畧鎶ょ锛岀孩榛戦厤鑹插甫閲戣壊闀惰竟涓庣櫧鑹茬偣缂€锛屽渾娑﹀彲鐖辩殑鍩庡牎鐭冲ご宸ㄤ汉锛屽叏韬珯绔嬫闈㈠叏韬儚锛岀函鐧借壊鑳屾櫙锛岄珮娓咃紝娓告垙鍘熺敾椋庢牸',
  },
  {
    name: 'B-standing-heroic',
    prompt: '鑻遍泟鑱旂洘鍔犻噷濂?T1 鐨偆锛屽崱閫氬姩婕鏍硷紝鍙埍鐨勭煶鍍忓畧鎶ょ锛岀孩榛戞垬鐢查噾鑹叉弿杈癸紝鐧借壊缇界考瑁呴グ锛屽弻鎵嬫彙鎷崇珯绔嬪Э鍔匡紝鍏ㄨ韩鍍忓眳涓紝绾櫧鑳屾櫙锛岄珮娓呯粏鑺?,
  },
  {
    name: 'C-cute-mascot',
    prompt: '瓒呭彲鐖辩殑Q鐗堝姞閲屽ゥ鍚夌ゥ鐗╋紝鑻遍泟鑱旂洘 T1 涓栫晫璧涚毊鑲わ紝鍦嗘粴婊氱殑鐭冲ご宸ㄤ汉锛屽ぇ澶村皬韬瓙锛岀孩榛戦噾鑹查厤鑹诧紝钀岃悓鐨勫ぇ鐪肩潧寰瑧锛岀珯绔嬪崠钀屽Э鍔匡紝鍏ㄨ韩鍍忥紝绾櫧鑳屾櫙',
  },
];

async function genOne(v) {
  const resp = await fetch('https://api.siliconflow.cn/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model, prompt: v.prompt, image_size: '1024x1024', num_inference_steps: 20 }),
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
}

for (const v of variants) {
  const r = await genOne(v);
  console.log(JSON.stringify(r));
}
console.log('DONE');