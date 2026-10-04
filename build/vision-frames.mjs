import { readFileSync } from 'node:fs';
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
const q='杩?寮犳槸澶勭悊鍚庣殑閫忔槑搴曡鑹插抚銆傝閫愬紶(鏍?-4)鍥炵瓟锛?)鑴氫笅鏄惁杩樻湁妞渾闃村奖鍦?鎶曞奖娈嬬暀锛?)鑴?闉嬪簳鏄惁瀹屾暣(娌¤鍓婃帀)锛?)鏄惁骞插噣鍙洿鎺ュ仛娓告垙绱犳潗锛熼潪甯哥畝娲併€?;
console.log(await ask(q,['D:/Bigfish/build/galio-preview/clean2/cz-00.png','D:/Bigfish/build/galio-preview/clean2/cz-02.png','D:/Bigfish/build/galio-preview/clean2/cz-04.png','D:/Bigfish/build/galio-preview/clean2/cz-07.png']));