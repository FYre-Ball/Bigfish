const key = process.env.SILICONFLOW_API_KEY;
const model = 'Qwen/Qwen-Image';
const prompt = '鍙埍鐨勫崱閫氱増鑻遍泟鑱旂洘鍔犻噷濂ワ紙T1 2023 涓栫晫璧涚毊鑲わ級锛孮鐗堝ぇ澶村▋濞冪煶鍍忓畧鎶ょ锛岀孩榛戦厤鑹插甫閲戣壊闀惰竟涓庣櫧鑹茬偣缂€锛屽渾娑﹀彲鐖辩殑鍩庡牎鐭冲ご宸ㄤ汉锛屽叏韬珯绔嬪Э鍔匡紝绾櫧鑹茶儗鏅紝楂樻竻';

const resp = await fetch('https://api.siliconflow.cn/v1/images/generations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + key,
  },
  body: JSON.stringify({
    model,
    prompt,
    image_size: '1024x1024',
    num_inference_steps: 20,
  }),
});
const text = await resp.text();
console.log('status', resp.status);
console.log(text.slice(0, 1500));