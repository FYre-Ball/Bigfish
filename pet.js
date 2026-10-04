'use strict';
const stage = document.getElementById('stage');
const pwrap = document.getElementById('pet-wrap');
const img = document.getElementById('pet');
const bubble = document.getElementById('bubble');
const menu = document.getElementById('menu');
const submenu = document.getElementById('submenu');

// Layout constants (must match main.js)
const PET_BASE_W = 180;
const PET_BASE_H = 200;
const MENU_W = 160;   // reserved column width for the menu AND the submenu
const GAP = 8;

const DEFAULT_FRAMES = {
  idle: ['assets/pet/idle.png'],
  eat: ['assets/pet/eat-1.png', 'assets/pet/eat-2.png', 'assets/pet/eat-3.png', 'assets/pet/eat-4.png'],
  'walk-left': ['assets/pet/walk-left-1.png', 'assets/pet/walk-left-2.png'],
  'walk-right': ['assets/pet/walk-right-1.png', 'assets/pet/walk-right-2.png'],
  sleep: ['assets/pet/sleep.png'],
};
const FRAME_MS = { idle: 360, eat: 220, 'walk-left': 240, 'walk-right': 240, sleep: 0 };

let FRAMES = DEFAULT_FRAMES;
let state = 'idle';
let frameIndex = 0;
let animTimer = null;
let idleGroup = 0;         // which idle animation group is playing (0 = frames[0..1], 1 = frames[2..3])
let idleGroupTimer = null; // timer that switches idle groups after a random 5~15s
let scale = 1;
let moveOn = true;
let skinIds = ['default'];
let currentSkin = 'default';
let submenuTimer = null;

function petW() { return Math.round(PET_BASE_W * scale); }
function petH() { return Math.round(PET_BASE_H * scale); }

function setFrames(frames) {
  if (frames && frames.idle && frames.idle.length) FRAMES = frames;
  else FRAMES = DEFAULT_FRAMES;
}

function clearIdleGroupTimer() {
  if (idleGroupTimer) { clearTimeout(idleGroupTimer); idleGroupTimer = null; }
}

// Play one idle group: group 0 = frames[0..1], group 1 = frames[2..3].
// Switches to the other group after a random 5~15s delay.
function playIdleGroup(gi) {
  idleGroup = gi;
  const frames = gi === 0 ? FRAMES.idle.slice(0, 2) : FRAMES.idle.slice(2, 4);
  if (!frames.length) return;
  frameIndex = 0;
  if (animTimer) { clearInterval(animTimer); animTimer = null; }
  img.src = frames[0];
  if (frames.length > 1 && FRAME_MS.idle > 0) {
    animTimer = setInterval(() => {
      frameIndex = (frameIndex + 1) % frames.length;
      img.src = frames[frameIndex];
    }, FRAME_MS.idle);
  }
  // schedule the switch to the other group after a random 5~15s
  const delay = 5000 + Math.floor(Math.random() * 10000);
  idleGroupTimer = setTimeout(() => playIdleGroup(gi === 0 ? 1 : 0), delay);
}

function setState(s) {
  if (!FRAMES[s]) return;
  state = s;
  frameIndex = 0;
  if (animTimer) { clearInterval(animTimer); animTimer = null; }
  clearIdleGroupTimer();

  if (s === 'idle' && FRAMES.idle.length >= 4) {
    img.classList.add('animate-bob');
    playIdleGroup(idleGroup);
    return;
  }

  img.classList.toggle('animate-bob', s === 'idle');
  img.src = FRAMES[s][0];
  if (FRAMES[s].length > 1 && FRAME_MS[s] > 0) {
    animTimer = setInterval(() => {
      frameIndex = (frameIndex + 1) % FRAMES[s].length;
      img.src = FRAMES[s][frameIndex];
    }, FRAME_MS[s]);
  }
}

// ---- layout: which side of the pet the menu (and submenu) open on ----
// `side` is sticky: it only changes when the currently chosen side would push
// the menu/submenu off a screen edge. Crossing the screen midline while
// dragging must NOT flip it (which caused the "teleport" bug).
let side = null;

function decideSide() {
  const availW = (window.screen && window.screen.availWidth) || 1920;
  const winX = window.screenX;
  const winW = window.outerWidth || (petW() + (MENU_W + GAP) * 2);

  if (side !== 'left' && side !== 'right') {
    // first decision: put the menu toward the screen center (away from the pet)
    side = winX + winW / 2 < availW / 2 ? 'right' : 'left';
    return side;
  }

  if (side === 'right') {
    // menu is in the window's right column; flip if it would overflow the right edge
    if (winX + winW > availW) side = 'left';
  } else {
    // menu is in the window's left column; flip if it would overflow the left edge
    if (winX < 0) side = 'right';
  }
  return side;
}

function layout() {
  document.documentElement.style.setProperty('--scale', String(scale));
  const pw = petW();
  const pitch = MENU_W + GAP; // width of one side column + gap

  // The pet is ALWAYS the middle column. The menu occupies one side column;
  // flipping the side only moves the menu, so the pet never teleports. The
  // submenu floats beside the menu (see positionSubmenu) and may overlap the pet.
  stage.style.width = (pw + pitch * 2) + 'px';
  stage.style.height = Math.max(petH(), 420) + 'px';
  pwrap.style.width = pw + 'px';
  pwrap.style.height = petH() + 'px';
  pwrap.style.left = pitch + 'px';

  if (side === 'right') {
    // menu in the right column
    menu.className = 'side-right';
    menu.style.left = (pitch + pw) + 'px';
    menu.style.right = 'auto';
  } else {
    // menu in the left column
    menu.className = 'side-left';
    menu.style.left = '0px';
    menu.style.right = 'auto';
  }
}

// ---- report interactive geometry (content coords) to the main process ----
// The main process drives hover / click-through / drag from the global cursor
// position, so it needs to know where the pet, menu and submenu are.
let menuVisible = false;
let submenuVisible = false;

function reportGeometry() {
  const pr = pwrap.getBoundingClientRect();
  const pet = { x: pr.left, y: pr.top, w: pr.width, h: pr.height };
  let menuRect = null;
  let submenuRect = null;
  if (menuVisible) {
    const mr = menu.getBoundingClientRect();
    menuRect = { x: mr.left, y: mr.top, w: mr.width, h: mr.height };
  }
  if (submenuVisible) {
    const sr = submenu.getBoundingClientRect();
    submenuRect = { x: sr.left, y: sr.top, w: sr.width, h: sr.height };
  }
  window.petAPI.setGeometry({ pet, menuRect, submenuRect });
}

function showMenu() {
  side = decideSide();
  layout();
  menuVisible = true;
  menu.classList.add('show');
  renderMenu();
  reportGeometry();
}
function hideMenu() {
  menuVisible = false;
  menu.classList.remove('show');
  hideSubmenu();
}
function hideSubmenu() {
  submenuVisible = false;
  submenu.classList.remove('show');
  if (submenuTimer) { clearTimeout(submenuTimer); submenuTimer = null; }
  reportGeometry();
}
function hideAll() {
  hideMenu();
}

function mkMenuBtn(label, onclick, arrow) {
  const b = document.createElement('button');
  const span = document.createElement('span');
  span.textContent = label;
  b.appendChild(span);
  if (arrow) {
    const a = document.createElement('span');
    a.className = 'arrow';
    a.textContent = arrow;
    b.appendChild(a);
  }
  b.addEventListener('click', (e) => { e.stopPropagation(); onclick && onclick(); });
  return b;
}

let moveBtnEl = null;
let skinBtnEl = null;
let scaleInputEl = null;
let scaleValEl = null;

// Build the size slider row (same 0.6–1.6 drag-to-scale as the settings window).
function mkScaleRow() {
  const row = document.createElement('div');
  row.className = 'menu-scale';

  const label = document.createElement('span');
  label.className = 'ms-label';
  label.textContent = '大小';

  scaleInputEl = document.createElement('input');
  scaleInputEl.type = 'range';
  scaleInputEl.min = '0.6';
  scaleInputEl.max = '1.6';
  scaleInputEl.step = '0.05';
  scaleInputEl.value = String(scale);
  // mousedown/mousedown moves should not close the menu or start a drag
  scaleInputEl.addEventListener('mousedown', (e) => e.stopPropagation());
  scaleInputEl.addEventListener('click', (e) => e.stopPropagation());
  scaleInputEl.addEventListener('input', () => {
    scaleValEl.textContent = Number(scaleInputEl.value).toFixed(2);
  });
  scaleInputEl.addEventListener('change', () => {
    const v = Number(scaleInputEl.value);
    scale = v;
    window.petAPI.setScale(v); // live resize (apply on release)
  });

  scaleValEl = document.createElement('span');
  scaleValEl.className = 'ms-val';
  scaleValEl.textContent = Number(scale).toFixed(2);

  row.appendChild(label);
  row.appendChild(scaleInputEl);
  row.appendChild(scaleValEl);
  return row;
}

function renderMenu() {
  menu.innerHTML = '';
  const sep = () => { const s = document.createElement('div'); s.className = 'sep'; menu.appendChild(s); };

  menu.appendChild(mkScaleRow());
  sep();

  moveBtnEl = mkMenuBtn('', () => {
    moveOn = !moveOn;
    window.petAPI.setMove(moveOn);
    updateLabels();
  });
  menu.appendChild(moveBtnEl);

  skinBtnEl = mkMenuBtn('换形象', () => { }, '▸');
  skinBtnEl.addEventListener('mouseenter', openSubmenu);
  skinBtnEl.addEventListener('mouseleave', closeSubmenuSoon);
  menu.appendChild(skinBtnEl);
  sep();
  menu.appendChild(mkMenuBtn('隐藏', () => { window.petAPI.hide(); }));
  menu.appendChild(mkMenuBtn('桌宠设置', () => { window.petAPI.openSettings(); hideAll(); }));
  updateLabels();
}

function updateLabels() {
  if (moveBtnEl) {
    moveBtnEl.firstChild.textContent = moveOn ? '移动：开' : '移动：关';
  }
  if (scaleInputEl) scaleInputEl.value = String(scale);
  if (scaleValEl) scaleValEl.textContent = Number(scale).toFixed(2);
}

function skinLabel(id) {
  if (id === 'default') return '默认';
  return id.replace(/^custom-/, '');
}

function renderSubmenu() {
  submenu.innerHTML = '';
  for (const id of skinIds) {
    const b = document.createElement('button');
    b.textContent = skinLabel(id);
    if (id === currentSkin) b.className = 'sel';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      currentSkin = id;
      window.petAPI.selectSkin(id);
      hideAll();
    });
    submenu.appendChild(b);
  }
}

// The submenu floats immediately beside the menu (right side preferred; if it
// would overflow the window, fall back to the left). It overlaps the pet, which
// is fine. Vertically it is pinned to the "换形象" row.
function positionSubmenu() {
  let aboveBottom = 0;
  if (skinBtnEl && skinBtnEl.offsetParent === menu) {
    // distance from the menu's bottom edge up to the "换形象" row's bottom
    aboveBottom = menu.offsetHeight - (skinBtnEl.offsetTop + skinBtnEl.offsetHeight);
  }
  submenu.style.bottom = aboveBottom + 'px';

  const sw = 158;                 // submenu visible width (CSS uses 156 + padding)
  const menuL = menu.offsetLeft;
  const menuW = menu.offsetWidth;
  const stageW = stage.offsetWidth || stage.clientWidth;

  // right of the menu, unless that would overflow the window
  if (menuL + menuW + 2 + sw <= stageW) {
    submenu.classList.remove('flip');
    submenu.style.left = (menuL + menuW + 2) + 'px';
    submenu.style.right = 'auto';
  } else {
    submenu.classList.add('flip');
    submenu.style.left = 'auto';
    submenu.style.right = (stageW - menuL + 2) + 'px';
  }
}

function openSubmenu() {
  if (submenuVisible) return;
  renderSubmenu();
  positionSubmenu();
  submenuVisible = true;
  submenu.classList.add('show');
  reportGeometry();
}

function closeSubmenuSoon() {
  if (submenuTimer) clearTimeout(submenuTimer);
  submenuTimer = setTimeout(() => { hideSubmenu(); }, 180);
}
function cancelSubmenuClose() {
  if (submenuTimer) { clearTimeout(submenuTimer); submenuTimer = null; }
}

// Hover on the submenu itself keeps it open; leaving closes it after a beat.
submenu.addEventListener('mouseenter', cancelSubmenuClose);
submenu.addEventListener('mouseleave', closeSubmenuSoon);

// ---- drag to move; a click (no movement) summons the main window ----
// Movement and click-vs-drag detection are handled by the MAIN process (which
// polls the global cursor), so a fast drag never loses the window; the
// renderer only signals mousedown / mouseup.
let dragging = false;
let startX = 0;
let startY = 0;

window.addEventListener('mousedown', (e) => {
  if (menu.contains(e.target) || submenu.contains(e.target)) return;
  hideAll();
  dragging = true;
  startX = e.screenX;
  startY = e.screenY;
  window.petAPI.dragStart(startX, startY);
});
window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  window.petAPI.dragEnd();
});

window.petAPI.onSay((msg) => {
  bubble.textContent = msg;
  bubble.classList.add('show');
  setTimeout(() => bubble.classList.remove('show'), 4000);
});
window.petAPI.onState((s) => setState(s));

// The main process decides when to show / hide the menu based on cursor
// position over the geometric regions we report above.
window.petAPI.onShowMenu(() => { if (!menuVisible) showMenu(); });
window.petAPI.onHideMenu(() => { if (menuVisible) hideAll(); });

// ---- config from main process ----
window.petAPI.onConfig((cfg) => {
  scale = Number(cfg.scale) || 1;
  if (typeof cfg.move === 'boolean') moveOn = cfg.move;
  if (Array.isArray(cfg.skins)) skinIds = cfg.skins;
  if (typeof cfg.skin === 'string') currentSkin = cfg.skin;
  side = decideSide();
  layout();
  setFrames(cfg.frames);
  setState(state);
  if (menuVisible) { updateLabels(); } // sync values in place, never rebuild mid-drag
  reportGeometry();
});

decideSide();
layout();
setState('idle');
reportGeometry();