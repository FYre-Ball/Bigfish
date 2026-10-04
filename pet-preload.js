'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  dragStart: (x, y) => ipcRenderer.send('pet-drag-start', { x, y }),
  dragEnd: () => ipcRenderer.send('pet-drag-end'),
  clicked: () => ipcRenderer.send('pet-clicked'),
  onSay: (cb) => ipcRenderer.on('pet-say', (_e, msg) => cb(msg)),
  onState: (cb) => ipcRenderer.on('pet-state', (_e, s) => cb(s)),
  setGeometry: (geo) => ipcRenderer.send('pet-set-geometry', geo),
  onShowMenu: (cb) => ipcRenderer.on('pet-show-menu', () => cb()),
  onHideMenu: (cb) => ipcRenderer.on('pet-hide-menu', () => cb()),
  onConfig: (cb) => ipcRenderer.on('pet-config', (_e, cfg) => cb(cfg)),
  adjustScale: (delta) => ipcRenderer.send('pet-adjust-scale', delta),
  setScale: (scale) => ipcRenderer.send('pet-quick-scale', scale),
  setMove: (enabled) => ipcRenderer.send('pet-set-move-quick', enabled),
  selectSkin: (id) => ipcRenderer.send('pet-select-skin', id),
  openSettings: () => ipcRenderer.send('pet-open-settings'),
  hide: () => ipcRenderer.send('pet-hide'),
});