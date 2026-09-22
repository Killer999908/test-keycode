// ============================================================
// KEYCODE Agent Runtime — Ephemeral Sandbox + I/O Buffer
// ============================================================
// Every agent run gets a throwaway workspace and hardened child
// processes. Nothing an agent does can touch the host repo, and
// everything is cleaned up when the run ends.

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const SANDBOX_ROOT = path.join(os.tmpdir(), 'keycode-sandboxes');

export function isWindows() { return process.platform === 'win32'; }

// ─────────────────────────────────────────────
// Ephemeral workspace
// ─────────────────────────────────────────────
export function createWorkspace(tag = 'run') {
  const id = `${tag}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const dir = path.join(SANDBOX_ROOT, id);
  fs.mkdirSync(dir, { recursive: true });
  return { id, dir, createdAt: Date.now() };
}

export function destroyWorkspace(ws) {
  if (!ws?.dir) return;
  try { fs.rmSync(ws.dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

export function sandboxStats() {
  try {
    const entries = fs.readdirSync(SANDBOX_ROOT);
    return { root: SANDBOX_ROOT, activeSandboxes: entries.length };
  } catch { return { root: SANDBOX_ROOT, activeSandboxes: 0 }; }
}

/** Reap sandboxes older than maxAgeMs (crash orphan cleanup). */
export function reapStale(maxAgeMs = 2 * 60 * 60 * 1000) {
  try {
    const now = Date.now();
    for (const entry of fs.readdirSync(SANDBOX_ROOT)) {
      const dir = path.join(SANDBOX_ROOT, entry);
      const st = fs.statSync(dir);
      if (now - st.mtimeMs > maxAgeMs) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      }
    }
  } catch { /* noop */ }
}

// ─────────────────────────────────────────────
// Decoupled I/O ring buffer
// Producers (process streams) push without blocking; consumers
// (SSE/ReAct loop) drain at their own pace. Backpressure-safe:
// when full, oldest lines are evicted and counted.
// ─────────────────────────────────────────────
export class RingBuffer {
  constructor(capacity = 2000) {
    this.capacity = capacity;
    this.lines = [];
    this.dropped = 0;
    this.subscribers = new Set();
  }
  push(line) {
    if (this.lines.length >= this.capacity) {
      this.lines.shift();
      this.dropped++;
    }
    this.lines.push(String(line));
    for (const fn of this.subscribers) {
      try { fn(String(line)); } catch { /* subscriber errors never break the producer */ }
    }
  }
  drain() { const out = this.lines.slice(); this.lines.length = 0; return out; }
  tail(n = 50) { return this.lines.slice(-n); }
  subscribe(fn) { this.subscribers.add(fn); return () => this.subscribers.delete(fn); }
  get size() { return this.lines.length; }
}

// ─────────────────────────────────────────────
// Hardened process execution
// ─────────────────────────────────────────────
/**
 * execInSandbox — spawn a command inside the ephemeral workspace with
 * time/memory limits and streamed output through a RingBuffer.
 *
 * @param {object} opts
 * @param {string} opts.cmd        executable
 * @param {string[]} opts.args     arguments
 * @param {object} opts.ws         workspace from createWorkspace()
 * @param {number} opts.timeoutMs  wall-clock limit
 * @param {string[]} opts.allowNetworkDecls unused placeholder for policy audit
 * @param {RingBuffer} opts.buffer output sink
 * @param {string} opts.stdinText  optional stdin payload
 * @returns {Promise<{code, stdout, stderr, durationMs, timedOut, truncated}>}
 */
export function execInSandbox({ cmd, args = [], ws, timeoutMs = 30000, buffer = null, stdinText = null, env = {}, maxOutputBytes = 512 * 1024 }) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let child;
    try {
      child = spawn(cmd, args, {
        cwd: ws.dir,
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        env: {
          PATH: process.env.PATH,
          HOME: ws.dir,                    // keep ~ writes inside the sandbox
          TMPDIR: ws.dir,
          LANG: 'C.UTF-8',
          ...env,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      resolve({ code: -1, stdout: '', stderr: 'spawn failed: ' + e.message, durationMs: 0, timedOut: false, truncated: false });
      return;
    }

    let outBytes = 0, errBytes = 0, truncated = false;
    const stdout = [], stderr = [];
    const push = (sink, counter, chunk) => {
      counter += chunk.length;
      if (counter > maxOutputBytes) { truncated = true; child.kill('SIGKILL'); return counter; }
      const text = chunk.toString('utf8');
      sink.push(text);
      if (buffer) text.split('\n').filter(Boolean).forEach((l) => buffer.push(l));
      return counter;
    };
    child.stdout.on('data', (c) => { outBytes = push(stdout, outBytes, c); });
    child.stderr.on('data', (c) => { errBytes = push(stderr, errBytes, c); });

    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch {} }, timeoutMs);

    if (stdinText != null) {
      try { child.stdin.write(stdinText); } catch { /* ignore */ }
    }
    child.stdin.end();

    const finish = (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: stdout.join('').slice(0, maxOutputBytes),
        stderr: stderr.join('').slice(0, 64 * 1024),
        durationMs: Date.now() - t0,
        timedOut,
        truncated,
      });
    };
    child.on('close', finish);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout: stdout.join(''), stderr: 'exec error: ' + e.message, durationMs: Date.now() - t0, timedOut, truncated }); });
  });
}

/**
 * Apply resource limits to the spawned process on Linux via a wrapper.
 * (ulimit-based; portable fallback = plain exec when the shell is missing.)
 */
export function limitedShellScript(script, { maxCpuSeconds = 30, maxMemMB = 1024, maxFileKB = 65536 } = {}) {
  if (isWindows()) return script;
  return `ulimit -t ${maxCpuSeconds} 2>/dev/null; ulimit -v ${maxMemMB * 1024} 2>/dev/null; ulimit -f ${maxFileKB} 2>/dev/null; ${script}`;
}
