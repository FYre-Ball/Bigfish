import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GUI = 'http://127.0.0.1:54370';
const port = 9427 + Math.floor(Math.random() * 150);
const userData = mkdtempSync(join(tmpdir(), 'dsh-layout-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, '--no-first-run', '--disable-gpu', GUI], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (u) => fetch(u).then((r) => r.json());

async function connect() {
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await getJson(`http://127.0.0.1:${port}/json/list`); break; } catch {} await sleep(250); }
  const page = (targets || []).find((t) => t.type === 'page' && String(t.url).startsWith('http'));
  if (!page) throw new Error('no http page target: ' + JSON.stringify((targets||[]).map(t=>({t:t.type,u:t.url}))));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, send };
}

const expr = `(() => {
  const root = document.getElementById('root') || document.querySelector('#root');
  if (!root) return JSON.stringify({ err: 'NO #root', bodyKids: [...document.body.children].map(c=>c.tagName+'.'+(c.className||'').toString().slice(0,30)) });
  const rcs = getComputedStyle(root);
  const frame = root.querySelector('[data-dsh-frame]');
  const panel = document.querySelector('[data-dsh-panel-host] .nArs4W_panel, [data-dsh-panel-host]');
  const conv = document.querySelector('[data-pane="conversation"]');
  const rect = (el) => el ? { l: Math.round(el.getBoundingClientRect().left), r: Math.round(el.getBoundingClientRect().right), w: Math.round(el.getBoundingClientRect().width), mr: getComputedStyle(el).marginRight, pos: getComputedStyle(el).position } : null;
  return JSON.stringify({
    rootDisplay: rcs.display,
    rootGridCols: rcs.gridTemplateColumns,
    rootRect: rect(root),
    frameGridCols: frame ? getComputedStyle(frame).gridTemplateColumns : null,
    frameDisplay: frame ? getComputedStyle(frame).display : null,
    frameChildren: frame ? [...frame.children].map(c => ({ tag:c.tagName, pane:c.getAttribute('data-pane'), w:Math.round(c.getBoundingClientRect().width), pos:getComputedStyle(c).position, mr:getComputedStyle(c).marginRight })) : null,
    rootChildren: [...root.children].map(c => ({ tag:c.tagName, pane:c.getAttribute('data-pane'), frame:c.hasAttribute('data-dsh-frame'), cls:(c.className||'').toString().slice(0,40), w:Math.round(c.getBoundingClientRect().width) })),
    conv: rect(conv),
    panel: rect(panel),
    sidebarWidthVar: getComputedStyle(document.documentElement).getPropertyValue('--dsh-sidebar-width').trim(),
    innerWidth: window.innerWidth
  }, null, 1);
})()`;

async function main() {
  const { ws, send } = await connect();
  await send('Page.enable'); await send('Runtime.enable');
  await sleep(8000);
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  console.log(r?.result?.result?.value ?? JSON.stringify(r));
  ws.close();
}
main().catch((e) => { console.error('FATAL', e.message); }).finally(() => setTimeout(() => { try { chrome.kill(); } catch {} }, 500));
