const key = process.env.SILICONFLOW_API_KEY;
const resp = await fetch('https://api.siliconflow.cn/v1/models', {
  headers: { 'Authorization': 'Bearer ' + key },
});
const j = await resp.json();
console.log('status', resp.status, 'count', (j.data||[]).length);
console.log((j.data||[]).map(m => m.id).sort().join('\n'));