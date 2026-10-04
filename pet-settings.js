'use strict';
const api = window.petSettingsAPI;

const $ = (id) => document.getElementById(id);
const scaleEl = $('scale');
const scaleVal = $('scaleVal');
const moveEl = $('move');
const skinsEl = $('skins');
const skinMsg = $('skinMsg');
const uploadBtn = $('uploadBtn');
const fileInput = $('fileInput');
const promptEl = $('prompt');
const apiKeyEl = $('apiKey');
const modelEl = $('model');
const genBtn = $('genBtn');
const genMsg = $('genMsg');
const closeBtn = $('closeBtn');

let currentSkin = 'default';

function setMsg(el, text, ok) {
  el.textContent = text || '';
  el.className = 'msg' + (text ? (ok ? ' ok' : ' err') : '');
}

scaleEl.addEventListener('input', () => {
  scaleVal.textContent = Number(scaleEl.value).toFixed(2);
});
scaleEl.addEventListener('change', () => {
  api.setScale(Number(scaleEl.value));
});

moveEl.addEventListener('change', () => {
  api.setMove(moveEl.checked);
});

apiKeyEl.addEventListener('change', () => {
  api.setApi(apiKeyEl.value, modelEl.value);
});
modelEl.addEventListener('change', () => {
  api.setApi(apiKeyEl.value, modelEl.value);
});

function renderSkins(skins) {
  skinsEl.innerHTML = '';
  const items = [{ id: 'default', preview: null }, ...skins];
  for (const s of items) {
    const div = document.createElement('div');
    div.className = 'skin' + (s.id === currentSkin ? ' sel' : '');
    if (s.preview) {
      const img = document.createElement('img');
      img.src = s.preview;
      div.appendChild(img);
    } else {
      const img = document.createElement('img');
      img.src = 'assets/pet/idle.png';
      div.appendChild(img);
    }
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = s.id === 'default' ? '默认' : s.id.replace(/^custom-/, '');
    div.appendChild(nm);

    if (s.id !== 'default') {
      const del = document.createElement('span');
      del.className = 'del';
      del.textContent = '删除';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        const r = await api.deleteSkin(s.id);
        if (r.ok) { setMsg(skinMsg, '已删除', true); init(); } else setMsg(skinMsg, r.error || '删除失败', false);
      });
      div.appendChild(del);
    }

    div.addEventListener('click', () => {
      currentSkin = s.id;
      api.selectSkin(s.id);
      renderSkins(skins);
      setMsg(skinMsg, s.id === 'default' ? '已切换为默认形象' : '已切换形象', true);
    });
    skinsEl.appendChild(div);
  }
}

async function init() {
  const cfg = await api.get();
  currentSkin = cfg.skin || 'default';
  scaleEl.value = cfg.scale || 1;
  scaleVal.textContent = Number(scaleEl.value).toFixed(2);
  moveEl.checked = !!cfg.move;
  apiKeyEl.value = cfg.apiKey || '';
  modelEl.value = cfg.model || 'FLUX.1-schnell';
  renderSkins(cfg.skins || []);
}

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files && fileInput.files[0];
  if (!f) return;
  setMsg(skinMsg, '处理中…', true);
  const dataUrl = await fileToDataUrl(f);
  const r = await api.upload(dataUrl);
  if (r.ok) {
    setMsg(skinMsg, '已上传为新形象', true);
    // switch to the new skin
    currentSkin = r.id;
    api.selectSkin(r.id);
    init();
  } else {
    setMsg(skinMsg, r.error || '上传失败', false);
  }
  fileInput.value = '';
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('读取文件失败'));
    fr.readAsDataURL(file);
  });
}

genBtn.addEventListener('click', async () => {
  const prompt = promptEl.value.trim();
  if (!prompt) { setMsg(genMsg, '请先填写描述', false); return; }
  if (!apiKeyEl.value) { setMsg(genMsg, '请先配置 API Key', false); return; }
  api.setApi(apiKeyEl.value, modelEl.value);
  genBtn.disabled = true;
  genBtn.textContent = '生成中…';
  setMsg(genMsg, '正在生成，请稍候…', true);
  const r = await api.generate(prompt);
  genBtn.disabled = false;
  genBtn.textContent = '✨ 生成形象';
  if (r.ok) {
    setMsg(genMsg, '生成成功，已加入形象列表', true);
    currentSkin = r.id;
    api.selectSkin(r.id);
    init();
  } else {
    setMsg(genMsg, r.error || '生成失败', false);
  }
});

closeBtn.addEventListener('click', () => api.close());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.close();
});

init();