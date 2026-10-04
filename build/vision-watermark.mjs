import { readFileSync } from 'node:fs';
const SF_KEY=process.env.SILICONFLOW_API_KEY;
async function ask(q,img){
  const r=await fetch('https://api.siliconflow.cn/v1/chat/completions',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+SF_KEY},
    body:JSON.stringify({model:'Qwen/Qwen3-VL-32B-Instruct',messages:[{role:'user',content:[
      {type:'image_url',image_url:{url:'data:image/png;base64,'+readFileSync(img).toString('base64')}},
      {type:'text',text:q},
    ]}]}),
  });
  const j=await r.json();
  return j.choices?.[0]?.message?.content||JSON.stringify(j).slice(0,300);
}
// zoom is original image bottom-right 600x450 (left=w-600, top=h-450), i.e. x=1448..2047, y=1598..2047
const q='杩欐槸鍘熷浘鍙充笅瑙掔殑鏀惧ぇ鍥?鍘熷浘2048x2048锛屾鍥句负x=1448..2047銆亂=1598..2047鍖哄煙)銆傚浘涓彸涓嬭鏈?璞嗗寘AI鐢熸垚"鐧借壊姘村嵃鏂囧瓧銆傝绮剧‘缁欏嚭姘村嵃鏂囧瓧鍦ㄨ繖寮犳斁澶у浘閲岀殑浣嶇疆(鐢ㄥぇ绾︾殑琛屽垪鐧惧垎姣旀弿杩帮紝姣斿"浣嶄簬鏀惧ぇ鍥惧彸涓嬭锛岀旱鍚戠害鍗犳渶鍚?5%琛岋紝妯悜绾﹀崰鏈€鍚?0%鍒?)銆傚敖閲忕簿纭埌姘村嵃鐨勮竟鐣屻€?;
console.log(await ask(q,'D:/Bigfish/build/galio-preview/watermark-zoom.png'));