// ============================================================
// KEYCODE Studio — Electron desktop shell
// ============================================================
// Boots the real Node server (server/server.js) as a child process,
// waits for /api/health, then opens the AI Builder in a window.
// The same server powers the web app, the CLI (kc), and the desktop
// app — one runtime, everywhere.

import { app, BrowserWindow, shell, dialog } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_PACKAGED = app.isPackaged;
const ROOT = IS_PACKAGED
  ? path.resolve(process.resourcesPath, 'app')
  : path.resolve(__dirname, '..');

const PORT = Number(process.env.KC_PORT || 5000);
const BASE = `http://127.0.0.1:${PORT}`;
let serverProc = null;
let win = null;
let quitting = false;

// ── server log ring (shown in the ready window if boot fails) ──
const serverLogs = [];
function log(line) {
  serverLogs.push(String(line));
  if (serverLogs.length > 400) serverLogs.shift();
}

function serverEntry() {
  // In dev, run straight from the repo. Packaged, use the copied tree.
  const devEntry = path.join(ROOT, 'server', 'server.js');
  const pkgEntry = path.join(process.resourcesPath || '', 'app', 'server', 'server.js');
  if (IS_PACKAGED && fs.existsSync(pkgEntry)) return pkgEntry;
  return devEntry;
}

function startServer() {
  const entry = serverEntry();
  if (!fs.existsSync(entry)) {
    dialog.showErrorBox('KEYCODE — missing server', `Server entry not found:\n${entry}`);
    app.quit();
    return;
  }
  serverProc = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    env: {
      ...process.env,
      // run the Electron binary as plain Node for the server child
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(PORT),
      KC_DESKTOP: '1',
      // desktop build ships without a Mongo daemon — fall back to local/in-memory mode
      MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/keycode',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', (d) => log('[srv] ' + d));
  serverProc.stderr.on('data', (d) => log('[srv:err] ' + d));
  serverProc.on('exit', (code) => {
    if (!quitting) {
      dialog.showErrorBox('KEYCODE — server stopped', `The backend exited (code ${code}).\n\nLast output:\n${serverLogs.slice(-12).join('')}`);
      app.quit();
    }
  });
}

function waitForHealth(timeoutMs = 60000, intervalMs = 500) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${BASE}/api/health`, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) return resolve(true);
        retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error('server did not become healthy in time'));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#05060a',
    title: 'KEYCODE Studio',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadURL(`${BASE}/ai-builder.html`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForHealth();
    createWindow();
  } catch (e) {
    dialog.showErrorBox('KEYCODE — boot failed', `Server did not become healthy.\n\n${e.message}\n\n${serverLogs.slice(-20).join('')}`);
    app.quit();
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  quitting = true;
  app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  if (serverProc && !serverProc.killed) {
    try { serverProc.kill(); } catch { /* best effort */ }
  }
});
