'use strict';

/**
 * Bigfish — Electron desktop shell for DeepSeek Harness.
 *
 * Architecture:
 *   1. Find a free localhost port.
 *   2. Spawn the bundled `@deepseek-ai/dsh` CLI in "web" profile as a child
 *      process (this is the same backend that `dsh web` runs).
 *   3. Wait until the backend responds on 127.0.0.1:<port>.
 *   4. Open a native BrowserWindow pointing at that local URL.
 *
 * Desktop-product extras (on top of the plain web shell):
 *   - system tray + global shortcut to summon the window
 *   - minimize-to-tray (closing the window keeps the app alive)
 *   - completion notifications (heuristic: sustained backend writes, then idle)
 *   - crash recovery (restart the backend with backoff if it dies mid-session)
 *   - desktop pet (transparent floating window)
 *   - launch at login, and a Windows "Open with Bigfish" context menu
 */

const {
  app, BrowserWindow, shell, dialog, Tray, Menu, globalShortcut,
  nativeImage, Notification, ipcMain, screen,
} = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');

const APP_NAME = 'Bigfish';
const HOST = '127.0.0.1';
const READY_TIMEOUT_MS = 90 * 1000;
const IDLE_NOTIFY_MS = 30 * 1000; // backend quiet for this long after activity => "done"
// Marker the dsh UI embeds in its HTML title; proves the probed port really
// serves the harness backend, not some other local process.
const READY_MARKER = 'DeepSeek Harness';
// Completion-notification heuristic: a write burst only counts as a running
// task once it persists across this many polls (~10s), which filters out
// one-shot writes like the UI creating a session file.
const ACTIVITY_STREAK_POLLS = 2;
// Crash recovery: delays between restart attempts, then give up.
const RESTART_DELAYS_MS = [2000, 5000, 10000, 30000];
const RESTART_GRACE_MS = 60 * 1000; // healthy for this long => reset the backoff

/** @type {import('node:child_process').ChildProcess | null} */
let dshProcess = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let petWindow = null;
/** @type {BrowserWindow | null} */
let welcomeWindow = null;
/** @type {BrowserWindow | null} */
let petSettingsWindow = null;
/** @type {Tray | null} */
let tray = null;
/** @type {number | null} */
let port = null;
let quitting = false;
let completionWatcherTimer = null;
let lastBusyAt = 0;
let notifiedForCycle = false;
let activityStreak = 0;
let taskRunning = false;
let restartAttempts = 0;
let restartGraceTimer = null;
let backendRestarting = false;

// ---------------------------------------------------------------------------
// Settings (persisted to userData/settings.json)
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  notifyOnComplete: true,
  launchAtLogin: false,
  petEnabled: true,
  onboardingDone: false,
  // 桌面宠物外观/行为扩展
  petScale: 1.0,        // 0.6 ~ 1.6
  petSkin: 'default',   // 'default' 或 'custom-<id>'
  petMove: true,        // 是否自动走动
  petApiKey: '',        // 硅基流动 API Key（留空则禁用文生图）
  petModel: 'FLUX.1-schnell', // 文生图模型
};
let settings = { ...DEFAULT_SETTINGS };

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}
function loadSettings() {
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('[bigfish] failed to save settings:', err);
  }
}

// ---------------------------------------------------------------------------
// Backend lifecycle
// ---------------------------------------------------------------------------
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, HOST, () => {
      const addr = srv.address();
      const p = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(p));
    });
  });
}

/** Whether the given localhost port is currently free. */
function portFree(p) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.listen(p, HOST, () => {
      srv.close(() => resolve(true));
    });
  });
}

function dshBinPath() {
  if (app.isPackaged) {
    // The production-only dsh node_modules are bundled via extraResources.
    return path.join(process.resourcesPath, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  }
  return path.join(app.getAppPath(), 'dsh-bundle', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
}

/** Directory of bundled skills shipped with the app (loaded via DSH_BUNDLED_SKILL_DIR). */
function bundledSkillDir() {
  return path.join(app.getAppPath(), 'bundled-skills');
}

function resolveRuntime() {
  const bin = dshBinPath();
  const env = { ...process.env, DSH_BUNDLED_SKILL_DIR: bundledSkillDir() };
  if (!app.isPackaged) {
    return { command: process.env.DSH_NODE || 'node', args: [bin], env };
  }
  const nodeBin = process.platform === 'win32' ? 'node.exe' : 'node';
  const nodeExe = path.join(process.resourcesPath, 'node-runtime', nodeBin);
  return { command: nodeExe, args: [bin], env };
}

function waitForReady(p, timeoutMs = READY_TIMEOUT_MS) {
  const base = `http://${HOST}:${p}`;
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const attempt = () => {
      const req = http.get(`${base}/`, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk.toString('utf8');
          if (body.includes(READY_MARKER)) {
            req.destroy();
            if (!settled) { settled = true; resolve(); }
          }
        });
        res.on('end', retry);
      });
      req.once('error', retry);
      req.setTimeout(3000, () => req.destroy());
    };
    const retry = () => {
      if (settled) return;
      if (Date.now() - startedAt > timeoutMs) {
        settled = true;
        reject(new Error(`Timed out waiting for the backend at ${base}`));
        return;
      }
      setTimeout(attempt, 500);
    };
    attempt();
  });
}

async function startDsh() {
  // On restart, reuse the previous port (the main window still points at
  // it); fall back to a fresh one if another process grabbed it meanwhile.
  if (port === null || !(await portFree(port))) {
    port = await findFreePort();
  }
  const rt = resolveRuntime();
  const args = [...rt.args, '--profile', 'web', '--host', HOST, '--port', String(port)];
  console.log(`[bigfish] starting backend on http://${HOST}:${port}`);
  const child = spawn(rt.command, args, {
    env: rt.env,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
  dshProcess = child;
  child.once('error', (err) => console.error('[bigfish] failed to spawn backend:', err));
  // Fail fast when the backend dies (or never starts) during startup,
  // instead of making the user stare at a blank window for 90 seconds.
  const died = new Promise((_, reject) => {
    child.once('error', () => reject(new Error('无法启动后端进程（node 运行时或 dsh 安装缺失？）')));
    child.once('exit', (code, signal) => reject(new Error(`后端在就绪前退出（code=${code}, signal=${signal}）`)));
  });
  try {
    await Promise.race([waitForReady(port), died]);
  } catch (err) {
    dshProcess = null;
    throw err;
  }
  // Healthy again: after a grace period of uptime, reset the crash backoff.
  clearTimeout(restartGraceTimer);
  restartGraceTimer = setTimeout(() => { restartAttempts = 0; }, RESTART_GRACE_MS);
  watchBackend(child);
}

function stopDsh() {
  const child = dshProcess;
  dshProcess = null;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 3000);
    }
  } catch { /* best effort */ }
}

/** Manually restart the dsh backend (tray menu). */
async function restartDsh() {
  if (backendRestarting) return;
  backendRestarting = true;
  stopDsh();
  // Give the OS a moment to release the port (Windows taskkill is async).
  const released = await waitForPortFree(port);
  if (released) await new Promise((r) => setTimeout(r, 300));
  try {
    await startDsh();
    console.log('[bigfish] backend manually restarted');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(`http://${HOST}:${port}`);
    }
    notify(APP_NAME, '已重启 Bigfish 后端');
  } catch (err) {
    console.error('[bigfish] manual restart failed:', err && err.message ? err.message : err);
    notify(APP_NAME, '重启失败，请查看日志');
  } finally {
    backendRestarting = false;
  }
}

/** Poll until the given port is released (or a short timeout). */
function waitForPortFree(p) {
  return new Promise((resolve) => {
    if (p === null) { resolve(false); return; }
    const startedAt = Date.now();
    const check = async () => {
      const free = await portFree(p);
      if (free || Date.now() - startedAt > 5000) resolve(free);
      else setTimeout(check, 200);
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// Backend crash recovery
// ---------------------------------------------------------------------------
function watchBackend(child) {
  child.once('exit', (code, signal) => {
    // stopDsh() nulls dshProcess first, so a clean shutdown never lands here.
    if (quitting || dshProcess !== child) return;
    dshProcess = null;
    console.warn(`[bigfish] backend exited unexpectedly (code=${code}, signal=${signal})`);
    scheduleBackendRestart();
  });
}

function scheduleBackendRestart() {
  if (backendRestarting || quitting) return;
  if (restartAttempts >= RESTART_DELAYS_MS.length) {
    dialog.showMessageBox(mainWindow || undefined, {
      type: 'error',
      title: APP_NAME,
      message: 'Bigfish 后端多次重启失败',
      detail: '请检查安装是否完整，或尝试重启应用。',
      buttons: ['重试', '退出'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) { restartAttempts = 0; scheduleBackendRestart(); }
      else { quitting = true; app.quit(); }
    });
    return;
  }
  const delay = RESTART_DELAYS_MS[restartAttempts];
  restartAttempts++;
  backendRestarting = true;
  notify(APP_NAME, '后端异常退出，正在自动重启…');
  petSay('哎呀，我摔了一跤，马上爬起来！');
  setTimeout(async () => {
    backendRestarting = false;
    if (quitting) return;
    try {
      await startDsh();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://${HOST}:${port}`);
      }
      console.log('[bigfish] backend restarted');
      petSay('我回来啦！');
    } catch (err) {
      console.error('[bigfish] backend restart failed:', err && err.message ? err.message : err);
      scheduleBackendRestart();
    }
  }, delay);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
function notify(title, body) {
  if (!Notification.isSupported()) return;
  try {
    new Notification({ title, body, icon: appIconPath() }).show();
  } catch (err) {
    console.error('[bigfish] notification failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Pet skins (custom images uploaded / generated by the user)
// ---------------------------------------------------------------------------
function petSkinsDir() {
  // Custom skins live beside the app source (D:\Bigfish\pet-skins) instead of
  // the OS userData (AppData), so they are portable and user-controllable.
  return path.join(__dirname, 'pet-skins');
}

/** Read an image file into a `data:` URL (base64), safe for file:// pages. */
function fileToDataUrl(p) {
  let buf;
  try { buf = fs.readFileSync(p); } catch { return null; }
  const ext = path.extname(p).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.webp' ? 'image/webp'
    : ext === '.gif' ? 'image/gif'
    : 'image/png';
  return 'data:' + mime + ';base64,' + buf.toString('base64');
}

/** One skin = a directory holding idle.png (+ optional animation frames). */
function listPetSkins() {
  const dir = petSkinsDir();
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const skinPath = path.join(dir, e.name);
    // A skin is usable if it has at least an idle image.
    const idleName = ['idle-1.png', 'idle.png', 'idle.jpg', 'idle.webp', 'idle.gif'].find((n) => fs.existsSync(path.join(skinPath, n)));
    if (!idleName) continue;
    const preview = fileToDataUrl(path.join(skinPath, idleName));
    if (!preview) continue;
    out.push({ id: e.name, preview });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/**
 * Resolve the frame set for the current skin. Default skins read from the
 * app dir's assets/pet; custom skins read from userData/pet-skins/<id>.
 * Missing animation frames fall back to the idle image. Frames are returned
 * as data URLs so the file:// pet page can always display them.
 */
function petFrames() {
  if (settings.petSkin === 'default' || !settings.petSkin) {
    return null; // pet.js uses its built-in assets/pet frames
  }
  const skinDir = path.join(petSkinsDir(), settings.petSkin);
  const FRAME_KEYS = {
    // idle supports multiple frames (idle-1..idle-4) with a single idle.png fallback
    idle: ['idle-1.png', 'idle-2.png', 'idle-3.png', 'idle-4.png', 'idle.png', 'idle.jpg', 'idle.webp', 'idle.gif'],
    eat: ['eat-1.png', 'eat-2.png', 'eat-3.png', 'eat-4.png'],
    'walk-left': ['walk-left-1.png', 'walk-left-2.png'],
    'walk-right': ['walk-right-1.png', 'walk-right-2.png'],
    sleep: ['sleep.png', 'sleep.jpg', 'sleep.webp'],
  };
  const frames = {};
  for (const [state, names] of Object.entries(FRAME_KEYS)) {
    const found = [];
    for (const n of names) {
      const dataUrl = fileToDataUrl(path.join(skinDir, n));
      if (dataUrl) found.push(dataUrl);
    }
    frames[state] = found.length ? found : undefined;
  }
  // fallback: every state without frames uses the idle image
  const idle = frames.idle;
  if (!idle) return null;
  for (const state of Object.keys(frames)) {
    if (!frames[state]) frames[state] = idle;
  }
  return frames;
}

/** Apply the current pet settings (size / move) to the live pet window. */
const PET_BASE_W = 180;
const PET_BASE_H = 200;
const PET_MENU_W = 160;   // width of the hover menu (and of the skin submenu)
const PET_MENU_H = 420;   // minimum height so the hover menu (+ skin submenu) fits
const PET_GAP = 8;

function petWindowContentSize() {
  const petW = Math.round(PET_BASE_W * settings.petScale);
  const petH = Math.round(PET_BASE_H * settings.petScale);
  // pet + two columns (menu + a side-by-side skin submenu), each with a gap
  return {
    w: petW + (PET_MENU_W + PET_GAP) * 2,
    h: Math.max(petH, PET_MENU_H),
    petW,
    petH,
  };
}

function applyPetSettings() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const size = petWindowContentSize();
  petWindow.setContentSize(size.w, size.h);
  const skinIds = ['default', ...listPetSkins().map((s) => s.id)];
  petWindow.webContents.send('pet-config', {
    scale: settings.petScale,
    skin: settings.petSkin,
    skins: skinIds,
    frames: petFrames(),
    move: settings.petMove,
  });
}

function setPetScale(scale) {
  const s = Math.min(1.6, Math.max(0.6, Number(scale) || 1.0));
  settings.petScale = s;
  saveSettings();
  applyPetSettings();
}

function setPetMove(enabled) {
  settings.petMove = !!enabled;
  saveSettings();
  if (!settings.petMove) {
    setPetState('idle');
    clearInterval(moveTimer);
    moveTimer = null;
  }
  applyPetSettings();
}

function setPetSkin(skinId) {
  settings.petSkin = skinId || 'default';
  saveSettings();
  applyPetSettings();
}

const PET_QUOTES = [
  '要帮忙吗？说句话就行~',
  '我可以帮你做 PPT 哦',
  '作业写完了吗？',
  '查资料、写报告，找我！',
  '今天也要加油鸭',
  '记得喝口水休息一下~',
  '有不懂的尽管问我',
  '文档总结、翻译、写作，我都行~',
];

function petSay(msg) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet-say', msg);
  }
}

function schedulePetChatter() {
  clearTimeout(chatterTimer);
  chatterTimer = setTimeout(() => {
    if (petWindow && !petWindow.isDestroyed() && petState === 'idle') {
      petSay(PET_QUOTES[Math.floor(Math.random() * PET_QUOTES.length)]);
    }
    schedulePetChatter();
  }, 120000 + Math.random() * 180000);
}

function uninstall() {
  if (!app.isPackaged) {
    dialog.showMessageBox({ type: 'info', title: APP_NAME, message: '卸载功能只在安装版可用', detail: '请安装打包好的 Bigfish 后再使用卸载。' });
    return;
  }
  const uninstaller = path.join(path.dirname(process.execPath), 'Uninstall Bigfish.exe');
  if (fs.existsSync(uninstaller)) {
    quitting = true;
    spawn(uninstaller, [], { detached: true, stdio: 'ignore' });
    setTimeout(() => app.quit(), 800);
  } else {
    shell.openExternal('ms-settings:appsfeatures');
  }
}

// Heuristic "task completed" detector: watch DSH_HOME (excluding the static
// profiles/ tree) for writes; after a burst of activity followed by idle, notify.
function dshHome() {
  return process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh');
}

// ---------------------------------------------------------------------------
// Onboarding wizard
// ---------------------------------------------------------------------------
function createWelcomeWindow() {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.show();
    welcomeWindow.focus();
    return;
  }
  welcomeWindow = new BrowserWindow({
    width: 520,
    height: 660,
    parent: mainWindow || undefined,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Bigfish 新手向导',
    autoHideMenuBar: true,
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'welcome-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  welcomeWindow.once('ready-to-show', () => {
    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.show();
      welcomeWindow.focus();
    }
  });
  welcomeWindow.loadFile(path.join(__dirname, 'welcome.html'));
  welcomeWindow.on('closed', () => { welcomeWindow = null; });
}

function latestMtime(dir, skipNames, out) {
  out = out || { t: 0 };
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (skipNames && skipNames.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      latestMtime(full, skipNames, out);
    } else if (e.isFile()) {
      try {
        const t = fs.statSync(full).mtimeMs;
        if (t > out.t) out.t = t;
      } catch { /* ignore */ }
    }
  }
  return out;
}

function startCompletionWatcher() {
  stopCompletionWatcher();
  const skip = new Set(['profiles', 'node_modules']);
  completionWatcherTimer = setInterval(() => {
    if (!settings.notifyOnComplete) return;
    const { t } = latestMtime(dshHome(), skip);
    const now = Date.now();
    const fresh = t > lastBusyAt + 2000 && now - t < 5000;
    if (fresh) {
      // Only treat it as a running task once writes persist across several
      // polls; one-shot bursts (e.g. the UI creating a session file while
      // browsing) are filtered out and won't trigger a completion notice.
      activityStreak++;
      if (activityStreak >= ACTIVITY_STREAK_POLLS) {
        taskRunning = true;
        notifiedForCycle = false;
      }
      if (taskRunning) lastBusyAt = now;
    } else {
      activityStreak = 0;
      if (taskRunning && now - lastBusyAt > IDLE_NOTIFY_MS) {
        taskRunning = false;
        notifiedForCycle = true;
        const msg = 'Bigfish 任务已完成';
        notify(msg, '后端已空闲，可以回来看看结果了');
        // Wake the pet (if asleep) so the text bubble is clearly visible.
        wakePet();
        petSay('任务完成啦，可以回来看看~');
      }
    }
  }, 5000);
}

function stopCompletionWatcher() {
  if (completionWatcherTimer) {
    clearInterval(completionWatcherTimer);
    completionWatcherTimer = null;
  }
  activityStreak = 0;
  taskRunning = false;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
function appIconPath() {
  const candidates = [
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(__dirname, 'build', 'icon.png'),
    path.join(__dirname, 'build', 'icon.ico'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return undefined;
}
function trayIconPath() {
  const candidates = [
    path.join(__dirname, 'assets', 'tray.png'),
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(__dirname, 'build', 'tray.png'),
    path.join(__dirname, 'build', 'icon.png'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return undefined;
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    icon: appIconPath(),
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0b0f',
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.show();
      welcomeWindow.focus();
    }
  });

  // Close hides to tray (keeps the backend alive); real quit goes through the tray.
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    let origin;
    try { origin = new URL(url).origin; } catch { event.preventDefault(); return; }
    if (origin !== `http://${HOST}:${port}`) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    }
  });

  mainWindow.loadURL(`http://${HOST}:${port}`);
}

function toggleMainWindow() {
  if (!mainWindow) { createWindow(); return; }
  if (mainWindow.isVisible()) mainWindow.hide();
  else { mainWindow.show(); mainWindow.focus(); }
}

// ---------------------------------------------------------------------------
// Desktop pet
// ---------------------------------------------------------------------------
function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) { petWindow.show(); return; }
  petWindow = new BrowserWindow({
    width: PET_BASE_W + (PET_MENU_W + PET_GAP) * 2,
    height: Math.max(PET_BASE_H, PET_MENU_H),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'pet-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.setIgnoreMouseEvents(true, { forward: true });
  const initSize = petWindowContentSize();
  petWindow.setContentSize(initSize.w, initSize.h);
  // Spawn so the pet (the middle column) is at the bottom-right of the work
  // area. The window is wider than the pet (extra transparent columns for the
  // menu/submenu), so align the pet's right edge rather than the window's.
  const wa = screen.getPrimaryDisplay().workArea;
  const b = petWindow.getBounds();
  const sideCol = PET_MENU_W + PET_GAP; // one side column width
  petWindow.setPosition(
    wa.x + wa.width - 16 - sideCol - initSize.petW,
    wa.y + wa.height - 8 - b.height,
  );
  petWindow.loadFile(path.join(__dirname, 'pet.html'));
  petWindow.webContents.once('did-finish-load', () => {
    applyPetSettings();
  });
  petWindow.on('closed', () => { stopPetCursorPoller(); petWindow = null; });

  // Keep the pet always visible: the "Show Desktop" action (Win+D, or the
  // bottom-right desktop peek) and other windows minimize/hide it, which makes
  // it look like it "disappeared" while still enabled. Restore it immediately.
  petWindow.on('minimize', () => keepPetOnScreen(petWindow));
  petWindow.on('hide', () => keepPetOnScreen(petWindow));

  startPetCursorPoller();
}

// Re-show the pet if it gets minimized/hidden while still enabled. Guarded so
// an explicit hide (settings.petEnabled === false) is respected.
function keepPetOnScreen(win) {
  if (!win || win.isDestroyed() || !settings.petEnabled) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.setAlwaysOnTop(true, 'screen-saver');
}

function createPetSettingsWindow() {
  if (petSettingsWindow && !petSettingsWindow.isDestroyed()) {
    petSettingsWindow.show();
    petSettingsWindow.focus();
    return;
  }
  petSettingsWindow = new BrowserWindow({
    width: 480,
    height: 640,
    parent: mainWindow || undefined,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '桌面宠物设置',
    autoHideMenuBar: true,
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'pet-settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  petSettingsWindow.once('ready-to-show', () => {
    if (petSettingsWindow && !petSettingsWindow.isDestroyed()) {
      petSettingsWindow.show();
      petSettingsWindow.focus();
    }
  });
  petSettingsWindow.loadFile(path.join(__dirname, 'pet-settings.html'));
  petSettingsWindow.on('closed', () => { petSettingsWindow = null; });
}

function destroyPetWindow() {
  clearPetTimers();
  stopPetCursorPoller();
  stopPetKeepAlive();
  if (petWindow && !petWindow.isDestroyed()) petWindow.destroy();
  petWindow = null;
}

// ---------------------------------------------------------------------------
// Pet state machine (idle / eat / sleep / walk-left / walk-right)
// ---------------------------------------------------------------------------
let petState = 'idle';
let wanderTimer = null;
let sleepTimer = null;
let eatTimer = null;
let moveTimer = null;
let chatterTimer = null;

function clearPetTimers() {
  clearTimeout(wanderTimer);
  clearTimeout(sleepTimer);
  clearTimeout(eatTimer);
  clearTimeout(chatterTimer);
  clearInterval(moveTimer);
  wanderTimer = sleepTimer = eatTimer = moveTimer = chatterTimer = null;
}

function setPetState(state) {
  petState = state;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet-state', state);
  }
}

function wakeAndClickPet() {
  wakePet();
  toggleMainWindow();
  petSay('要我帮忙吗？');
  setPetState('eat');
  clearTimeout(eatTimer);
  eatTimer = setTimeout(() => {
    if (petState === 'eat') setPetState('idle');
  }, 1500);
}

// ---------------------------------------------------------------------------
// Pet hover / click-through / drag (driven from the main process).
// The renderer reports the pet / menu / submenu rectangles (in content
// coordinates); we poll the global cursor once per tick and decide whether to
// (a) let mouse events through, (b) open/close the hover menu, and (c) move
// the window while dragging. This is robust against fast cursor movement and
// against `setIgnoreMouseEvents(..., {forward:true})` hover quirks, because the
// global cursor position is always available to the main process.
// ---------------------------------------------------------------------------
let petGeometry = null;        // { pet:{x,y,w,h}, menuRect, submenuRect } content coords
let petDragStartScreen = null; // cursor screen pos at drag start
let petDragStartPos = null;    // window pos at drag start
let petDragMoved = false;      // total cursor movement exceeded click threshold
let cursorTimer = null;        // poll interval
let hoverEnterAt = 0;          // timestamp when cursor entered the pet region
let hoverArmed = false;        // show-menu already sent for this hover
let leaveAt = 0;               // timestamp when cursor left all interactive regions
let leaveArmed = false;        // hide-menu already sent for this leave
let cursorIgnore = true;       // current setIgnoreMouseEvents value

function petRegionScreen(rect) {
  if (!rect || !petWindow || petWindow.isDestroyed()) return null;
  const cb = petWindow.getContentBounds();
  return {
    x: cb.x + rect.x,
    y: cb.y + rect.y,
    w: rect.w,
    h: rect.h,
  };
}

function pointInRect(px, py, r) {
  return r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function petCursorTick() {
  if (!petWindow || petWindow.isDestroyed()) { stopPetCursorPoller(); return; }

  const pt = screen.getCursorScreenPoint();
  const g = petGeometry || {};
  const petR = petRegionScreen(g.pet);
  const menuR = petRegionScreen(g.menuRect);
  const subR = petRegionScreen(g.submenuRect);

  const overPet = pointInRect(pt.x, pt.y, petR);
  const overMenu = pointInRect(pt.x, pt.y, menuR) || pointInRect(pt.x, pt.y, subR);
  const interactive = overPet || overMenu;

  // --- click-through: only accept mouse when over an interactive region ---
  const wantIgnore = !interactive;
  if (wantIgnore !== cursorIgnore) {
    cursorIgnore = wantIgnore;
    petWindow.setIgnoreMouseEvents(cursorIgnore, { forward: true });
  }

  // --- hover menu open / close ---
  if (overPet && !overMenu) {
    if (!hoverArmed) {
      if (!hoverEnterAt) hoverEnterAt = Date.now();
      if (Date.now() - hoverEnterAt >= 500) {
        hoverArmed = true;
        petWindow.webContents.send('pet-show-menu');
      }
    }
    leaveAt = 0;
    leaveArmed = false;
  } else {
    hoverEnterAt = 0;
    hoverArmed = false;
    if (!interactive) {
      if (!leaveArmed) {
        if (!leaveAt) leaveAt = Date.now();
        if (Date.now() - leaveAt >= 250) {
          leaveArmed = true;
          petWindow.webContents.send('pet-hide-menu');
        }
      }
    } else {
      leaveAt = 0;
      leaveArmed = false;
    }
  }

  // --- drag: move the window to follow the cursor ---
  if (petDragStartScreen && petDragStartPos) {
    if (Math.abs(pt.x - petDragStartScreen.x) + Math.abs(pt.y - petDragStartScreen.y) > 5) {
      petDragMoved = true;
    }
    petWindow.setPosition(
      petDragStartPos[0] + (pt.x - petDragStartScreen.x),
      petDragStartPos[1] + (pt.y - petDragStartScreen.y),
    );
  }
}

function startPetCursorPoller() {
  if (cursorTimer) return;
  cursorTimer = setInterval(petCursorTick, 35);
}

function stopPetCursorPoller() {
  if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; }
  petGeometry = null;
  petDragStartScreen = null;
  petDragStartPos = null;
  petDragMoved = false;
  hoverEnterAt = 0;
  hoverArmed = false;
  leaveAt = 0;
  leaveArmed = false;
}

// Periodic keep-alive: "Show Desktop" (Win+D / bottom-right desktop peek),
// focusing other fullscreen apps, or a lost always-on-top can minimize or hide
// the pet even while it's enabled. Re-assert visibility + top-most state.
let petKeepAliveTimer = null;
function startPetKeepAlive() {
  stopPetKeepAlive();
  petKeepAliveTimer = setInterval(() => {
    if (!settings.petEnabled) return;
    if (!petWindow || petWindow.isDestroyed()) return;
    if (petWindow.isMinimized()) petWindow.restore();
    if (!petWindow.isVisible()) petWindow.show();
    // Re-assert top-most unconditionally: on Windows the top-most flag can be
    // dropped even when isAlwaysOnTop() still reports true, which lets the main
    // window (or other windows) cover the pet.
    petWindow.setAlwaysOnTop(true, 'screen-saver');
  }, 2000);
}
function stopPetKeepAlive() {
  if (petKeepAliveTimer) { clearInterval(petKeepAliveTimer); petKeepAliveTimer = null; }
}

function scheduleSleep() {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    if (petState === 'idle') setPetState('sleep');
  }, 120 * 1000); // 2 min idle -> sleep
}

function wakePet() {
  clearTimeout(sleepTimer);
  if (petState === 'sleep') setPetState('idle');
  scheduleSleep();
}

function scheduleWander() {
  clearTimeout(wanderTimer);
  wanderTimer = setTimeout(() => {
    if (!settings.petMove) { scheduleWander(); return; }
    if (petState === 'idle') doWander();
    else scheduleWander();
  }, 15000 + Math.random() * 20000);
}

function doWander() {
  if (!petWindow || petWindow.isDestroyed() || petState !== 'idle') {
    scheduleWander();
    return;
  }
  const [x, y] = petWindow.getPosition();
  const winW = petWindow.getBounds().width;
  const maxX = screen.getPrimaryDisplay().workAreaSize.width - winW;
  const distance = 100 + Math.random() * 180;

  // Pick a direction, but never "walk" into a wall: if the chosen direction
  // is blocked (already at the screen edge), turn around so the pet visibly
  // walks and the correct facing animation plays.
  let dir = Math.random() < 0.5 ? 'left' : 'right';
  if (dir === 'left' && x - distance < 0) dir = 'right';
  else if (dir === 'right' && x + distance > maxX) dir = 'left';

  const targetX = dir === 'left' ? x - distance : x + distance;
  const clamped = Math.max(0, Math.min(targetX, maxX));
  if (clamped === x) { scheduleWander(); return; } // fully pinned; try again later

  setPetState('walk-' + dir);
  const startX = x;
  const startTime = Date.now();
  const duration = 1400;
  clearInterval(moveTimer);
  moveTimer = setInterval(() => {
    const t = Math.min(1, (Date.now() - startTime) / duration);
    petWindow.setPosition(Math.round(startX + (clamped - startX) * t), y);
    if (t >= 1) {
      clearInterval(moveTimer);
      moveTimer = null;
      setPetState('idle');
      scheduleWander();
    }
  }, 16);
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function createTray() {
  const icon = trayIconPath();
  if (icon) {
    tray = new Tray(nativeImage.createFromPath(icon));
  } else {
    tray = new Tray(nativeImage.createEmpty());
  }
  tray.setToolTip(APP_NAME);
  tray.on('click', () => toggleMainWindow());
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏 Bigfish', click: () => toggleMainWindow() },
    { label: '新手向导（设置 API Key）', click: () => createWelcomeWindow() },
    { type: 'separator' },
    { label: '桌面萌宠', type: 'checkbox', checked: settings.petEnabled, click: (item) => setPetEnabled(item.checked) },
    { label: '桌宠设置', click: () => createPetSettingsWindow() },
    { label: '任务完成时通知', type: 'checkbox', checked: settings.notifyOnComplete, click: (item) => setNotify(item.checked) },
    { label: '开机自启', type: 'checkbox', checked: settings.launchAtLogin, click: (item) => setAutoStart(item.checked) },
    { type: 'separator' },
    {
      label: 'Windows 右键菜单',
      submenu: [
        { label: '安装「唤起 Bigfish」', click: () => installContextMenu() },
        { label: '卸载', click: () => uninstallContextMenu() },
      ],
    },
    { type: 'separator' },
    { label: '重启 Bigfish', click: () => restartDsh() },
    { type: 'separator' },
    { label: '卸载 Bigfish', click: () => uninstall() },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function setNotify(enabled) {
  settings.notifyOnComplete = enabled;
  saveSettings();
  if (!enabled) { lastBusyAt = 0; notifiedForCycle = false; activityStreak = 0; taskRunning = false; }
}

function setAutoStart(enabled) {
  settings.launchAtLogin = enabled;
  saveSettings();
  app.setLoginItemSettings({ openAtLogin: enabled });
}

function startPet() {
  createPetWindow();
  scheduleWander();
  scheduleSleep();
  schedulePetChatter();
  startPetKeepAlive();
}

function setPetEnabled(enabled) {
  settings.petEnabled = enabled;
  saveSettings();
  if (enabled) startPet();
  else destroyPetWindow();
}

// ---------------------------------------------------------------------------
// Global shortcut
// ---------------------------------------------------------------------------
function registerShortcuts() {
  const accel = 'CommandOrControl+Shift+D';
  try {
    globalShortcut.register(accel, () => toggleMainWindow());
    console.log(`[bigfish] global shortcut registered: ${accel}`);
  } catch (err) {
    console.error('[bigfish] shortcut register failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Windows "Open with Bigfish" context menu
// ---------------------------------------------------------------------------
function runReg(args) {
  return new Promise((resolve) => {
    const child = spawn('reg', args, { stdio: 'ignore', windowsHide: true });
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}

async function installContextMenu() {
  if (!app.isPackaged) {
    dialog.showMessageBox({ type: 'info', title: APP_NAME, message: '右键菜单只在安装后的版本可用', detail: '请安装打包好的 Bigfish 后再设置右键菜单。' });
    return;
  }
  const exe = process.execPath;
  const cmd = `"${exe}" --open "%1"`;
  const roots = ['HKCU\\Software\\Classes\\*\\shell\\Bigfish', 'HKCU\\Software\\Classes\\Directory\\shell\\Bigfish'];
  for (const r of roots) {
    await runReg(['add', r, '/ve', '/t', 'REG_SZ', '/d', '唤起 Bigfish', '/f']);
    await runReg(['add', `${r}\\command`, '/ve', '/t', 'REG_SZ', '/d', cmd, '/f']);
    await runReg(['add', r, '/v', 'Icon', '/t', 'REG_SZ', '/d', `${exe},0`, '/f']);
  }
  notify(APP_NAME, '已添加右键菜单「唤起 Bigfish」');
}

async function uninstallContextMenu() {
  await runReg(['delete', 'HKCU\\Software\\Classes\\*\\shell\\Bigfish', '/f']);
  await runReg(['delete', 'HKCU\\Software\\Classes\\Directory\\shell\\Bigfish', '/f']);
  notify(APP_NAME, '已移除右键菜单');
}

// ---------------------------------------------------------------------------
// --open <path> handling
// ---------------------------------------------------------------------------
function handleOpenArg(argv) {
  const i = argv.indexOf('--open');
  if (i === -1 || !argv[i + 1]) return;
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  // 目前只是唤起主窗口；真正把文件/文件夹交给 dsh 打开留待后续版本实现
  notify(APP_NAME, '已唤起 Bigfish');
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
    handleOpenArg(argv);
  });

  app.whenReady().then(async () => {
    loadSettings();
    try {
      await startDsh();
      console.log(`[bigfish] backend ready at http://${HOST}:${port}`);
      createWindow();
      console.log('[bigfish] window created');
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      dialog.showErrorBox(APP_NAME, `Failed to start the DeepSeek Harness backend:\n\n${message}`);
      app.quit();
      return;
    }

    createTray();
    registerShortcuts();
    startCompletionWatcher();
    if (settings.petEnabled) {
      startPet();
    }
    if (settings.launchAtLogin) setAutoStart(true);
    if (!settings.onboardingDone) createWelcomeWindow();

    handleOpenArg(process.argv);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    // Live in the tray; do not quit.
  });

  app.on('before-quit', () => {
    quitting = true;
    globalShortcut.unregisterAll();
    stopCompletionWatcher();
    stopDsh();
  });

  app.on('will-quit', () => {
    stopDsh();
  });

  // Welcome wizard IPC
  ipcMain.on('welcome-open-url', (_e, url) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url);
  });
  ipcMain.on('welcome-done', () => {
    settings.onboardingDone = true;
    saveSettings();
    if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.close();
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });

  // Pet drag + click. Drag movement is driven by the cursor poller below so a
  // fast move never loses the window.
  ipcMain.on('pet-drag-start', (_e, { x, y }) => {
    if (!petWindow) return;
    petDragStartScreen = { x, y };
    petDragStartPos = petWindow.getPosition();
    petDragMoved = false;
  });
  ipcMain.on('pet-drag-end', () => {
    const wasDrag = petDragMoved;
    petDragStartScreen = null;
    petDragStartPos = null;
    petDragMoved = false;
    if (!wasDrag) wakeAndClickPet();
  });
  ipcMain.on('pet-clicked', () => wakeAndClickPet());
  ipcMain.on('pet-set-geometry', (_e, geo) => {
    petGeometry = geo;
  });
  ipcMain.on('pet-adjust-scale', (_e, delta) => {
    setPetScale(settings.petScale + (Number(delta) || 0));
  });
  ipcMain.on('pet-quick-scale', (_e, scale) => {
    setPetScale(scale);
  });
  ipcMain.on('pet-set-move-quick', (_e, enabled) => {
    setPetMove(enabled);
  });
  ipcMain.on('pet-select-skin', (_e, id) => {
    setPetSkin(id);
  });

  // ---- Pet settings window + pet hover menu IPC ----------------------------

  ipcMain.on('pet-open-settings', () => createPetSettingsWindow());
  ipcMain.on('pet-hide', () => {
    // Hide the pet: mirrors the tray checkbox so the user can re-enable it there.
    setPetEnabled(false);
    rebuildTrayMenu();
  });

  // Read current pet configuration for the settings window.
  ipcMain.handle('pet-settings-get', () => ({
    scale: settings.petScale,
    skin: settings.petSkin,
    move: settings.petMove,
    apiKey: settings.petApiKey,
    model: settings.petModel,
    skins: listPetSkins().map((s) => ({ id: s.id, preview: s.preview })),
  }));

  ipcMain.on('pet-settings-set-scale', (_e, scale) => setPetScale(scale));
  ipcMain.on('pet-settings-set-move', (_e, move) => setPetMove(move));
  ipcMain.on('pet-settings-set-api', (_e, { apiKey, model }) => {
    settings.petApiKey = typeof apiKey === 'string' ? apiKey : '';
    if (typeof model === 'string' && model.trim()) settings.petModel = model.trim();
    saveSettings();
  });

  ipcMain.on('pet-settings-select-skin', (_e, id) => setPetSkin(id));

  ipcMain.handle('pet-settings-delete-skin', (_e, id) => {
    if (typeof id !== 'string' || !/^[\w.-]+$/.test(id)) return { ok: false, error: '非法皮肤 id' };
    const dir = path.join(petSkinsDir(), id);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      if (settings.petSkin === id) setPetSkin('default');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  // Accept a base64 image (data URL) and install it as a new custom skin
  // using only an idle frame (plus optional walk/eat reuse of the same image).
  ipcMain.handle('pet-settings-upload', (_e, dataUrl) => {
    try {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        return { ok: false, error: '无效的图片数据' };
      }
      const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(dataUrl);
      if (!m) return { ok: false, error: '不支持的图片格式' };
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const buf = Buffer.from(m[2], 'base64');
      const id = 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      const dir = path.join(petSkinsDir(), id);
      fs.mkdirSync(dir, { recursive: true });
      const idleName = 'idle.' + ext;
      fs.writeFileSync(path.join(dir, idleName), buf);
      return { ok: true, id, preview: fileToDataUrl(path.join(dir, idleName)) };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  // Text-to-image via SiliconFlow (OpenAI-compatible). Requires petApiKey.
  ipcMain.handle('pet-settings-generate', async (_e, prompt) => {
    if (!settings.petApiKey) return { ok: false, error: '未配置 API Key' };
    if (typeof prompt !== 'string' || !prompt.trim()) return { ok: false, error: '请填写描述' };
    try {
      const resp = await fetch('https://api.siliconflow.cn/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + settings.petApiKey,
        },
        body: JSON.stringify({
          model: settings.petModel || 'FLUX.1-schnell',
          prompt: prompt.trim(),
          image_size: '1024x1024',
          num_inference_steps: 20,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        const msg = json && json.message ? json.message : ('HTTP ' + resp.status);
        return { ok: false, error: String(msg) };
      }
      // SiliconFlow returns { images: [{ url }] } or { data: [{ url|b64_json }] }
      const imgs = json.images || (json.data || []);
      const first = Array.isArray(imgs) ? imgs[0] : null;
      if (!first) return { ok: false, error: '返回结果里没有图片' };
      if (first.url) {
        const imgResp = await fetch(first.url);
        const buf = Buffer.from(await imgResp.arrayBuffer());
        const id = 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
        const dir = path.join(petSkinsDir(), id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'idle.png'), buf);
        return { ok: true, id, preview: fileToDataUrl(path.join(dir, 'idle.png')) };
      }
      if (first.b64_json) {
        const buf = Buffer.from(first.b64_json, 'base64');
        const id = 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
        const dir = path.join(petSkinsDir(), id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'idle.png'), buf);
        return { ok: true, id, preview: fileToDataUrl(path.join(dir, 'idle.png')) };
      }
      return { ok: false, error: '无法解析生成结果' };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  ipcMain.on('pet-settings-close', () => {
    if (petSettingsWindow && !petSettingsWindow.isDestroyed()) petSettingsWindow.close();
  });
}
