import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require2 = createRequire('D:/Bigfish/dsh-bundle/package.json');
const sharp = require2('sharp');

// downscale cut images for vision check
for (const n of ['idle-1','idle-2','idle-3','idle-4','eat','sleep']){
  await sharp('D:/Bigfish/build/galio-preview/stand/'+n+'.png').resize({width:400}).png().toFile('D:/Bigfish/build/galio-preview/stand/check-'+n+'.png');
}
console.log('downscaled');

const SF_KEY=process.env.SILICONFLOW_API_KEY;
async function ask(q,imgs){
  const content=imgs.map(p=>({type:'image_url',image_url:{url:'data:image/png;base64,'+readFileSync(p).toString('base64')}}));
  content.push({type:'text',text:q});
  const r=await fetch('https://api.siliconflow.cn/v1/chat/completions',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+SF_KEY},
    body:JSON.stringify({model:'Qwen/Qwen3-VL-32B-Instruct',messages:[{role:'user',content}]}),
  });
  const j=await r.json();
  return j.choices?.[0]?.message?.content||JSON.stringify(j).slice(0,300);
}
const q='杩欎簺鏄姞鎺夌櫧搴曞悗鐨勯€忔槑PNG(鍔犻噷濂1鍗￠€?銆傝閫愬紶妫€鏌ワ細1)瑙掕壊鐨勭伆鑹查噾灞炶兏鐢?澶寸洈鏄惁杩樺湪(鏈夋病鏈夎鎶犳垚閫忔槑/闀傜┖)锛?)鑳屾櫙鏄惁骞插噣(鏃犵櫧鑹叉畫鐣?锛?)瑙掕壊鏄惁瀹屾暣(娌¤瑁佸垏)銆傛爣1-6绠€娲佸洖绛斻€?;
console.log(await ask(q, ['idle-1','idle-2','idle-3','idle-4','eat','sleep'].map(n=>'D:/Bigfish/build/galio-preview/stand/check-'+n+'.png')));