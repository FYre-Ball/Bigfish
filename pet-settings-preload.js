'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petSettingsAPI', {
  get: () => ipcRenderer.invoke('pet-settings-get'),
  setScale: (scale) => ipcRenderer.send('pet-settings-set-scale', scale),
  setMove: (move) => ipcRenderer.send('pet-settings-set-move', move),
  setApi: (apiKey, model) => ipcRenderer.send('pet-settings-set-api', { apiKey, model }),
  selectSkin: (id) => ipcRenderer.send('pet-settings-select-skin', id),
  deleteSkin: (id) => ipcRenderer.invoke('pet-settings-delete-skin', id),
  upload: (dataUrl) => ipcRenderer.invoke('pet-settings-upload', dataUrl),
  generate: (prompt) => ipcRenderer.invoke('pet-settings-generate', prompt),
  close: () => ipcRenderer.send('pet-settings-close'),
});