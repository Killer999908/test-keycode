// KEYCODE desktop preload — minimal, safe bridge.
// The app is server-served HTML; the bridge only exposes desktop
// identity flags pages can feature-detect (no filesystem, no shell
// access — sandboxed + contextIsolation).

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('KCDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
});
