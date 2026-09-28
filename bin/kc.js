#!/usr/bin/env node
// ============================================================
// kc — KEYCODE terminal agent
// ============================================================
// Full-power ReAct agent in your terminal. Same runtime as the web
// builder, no server needed:
//
//   kc chat                      interactive session (streaming trace)
//   kc run "task"                one-shot run
//   kc run --yolo "task"         full-auto, no permission prompts
//   kc serve [--port 5000]       start the web server + AI builder
//   kc tools                     list the agent's tool catalog
//   kc status                    router health check
//   kc mcp                       MCP connector status
//
// Config via .env in the CURRENT directory or ~/.kcenv — same keys
// as the server (GROQ_API_KEY, DEEPSEEK_API_KEY, OLLAMA_URL, …).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { PermissionGate } from './kc-permissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── env: current dir .env first, then ~/.kcenv, then server/.env ──
function loadEnv() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(os.homedir(), '.kcenv'),
    path.join(ROOT, 'server', '.env'),
  ];
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    let lines = [];
    try { lines = fs.readFileSync(f, 'utf8').split(/\r?\n/); } catch { continue; }
    for (const line of lines) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
    process.env.KC_ENV_FILE = f;
    break; // first match wins
  }
}

// ── CLI arg parsing (no deps) ──
const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--yolo') flags.yolo = true;
  else if (a === '--verbose' || a === '-v') flags.verbose = true;
  else if (a === '--json') flags.json = true;
  else if (a === '--steps') { flags.steps = +args[++i] || 14; }
  else if (a === '--allow') {
    const v = args[++i] || '';
    flags.allow = (flags.allow || []).concat(v.split(',').map((s) => s.trim()).filter(Boolean));
  }
  else if (a === '--port') { flags.port = +args[++i] || 5000; }
  else if (a.startsWith('--')) { flags[a.slice(2)] = true; }
  else positional.push(a);
}

const HELP = `
kc — KEYCODE terminal agent (autonomous coding, builds, and research)

USAGE
  kc chat                       interactive agent session
  kc run [options] "task"       one-shot task
  kc serve [--port N]           run the full KEYCODE web server
  kc tools                      print the agent tool catalog
  kc status                     AI router health check
  kc mcp                        MCP connector status

RUN OPTIONS
  --yolo                        auto-approve every tool call (full autonomy)
  --steps N                     max ReAct steps (default 14, max 40)
  --allow tool[,tool…]          pre-approve specific tools
  -v, --verbose                 log auto-approved calls
  --json                        emit raw JSONL events instead of the pretty trace

CONFIG
  Environment keys (current .env → ~/.kcenv → bundled server/.env):
    GROQ_API_KEY, DEEPSEEK_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY,
    GEMINI_API_KEY, HF_TOKEN, OLLAMA_URL, DIFY_URL/DIFY_KEY, …

EXAMPLES
  kc run "scaffold a REST API with auth in ./myapi"
  kc run --yolo --steps 25 "audit this repo and fix the failing tests"
  kc chat
`;

function die(msg, code = 1) { console.error('kc: ' + msg); process.exit(code); }

// ── lazy runtime imports (fast --help, no heavy side effects) ──
let _runtime = null;
async function runtime() {
  if (_runtime) return _runtime;
  loadEnv();
  const toolsMod = await import(pathToFileURL(path.join(ROOT, 'server/agent/toolDispatch.js')));
  const advMod = await import(pathToFileURL(path.join(ROOT, 'server/agent/advancedTools.js')));
  advMod.registerAdvancedTools();
  const engineMod = await import(pathToFileURL(path.join(ROOT, 'server/agent/reactEngine.js')));
  _runtime = { toolsMod, engineMod };
  return _runtime;
}

// ── pretty streaming trace ──
const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
};

function printEvent(evt) {
  if (evt.type === 'start') {
    console.log(C.dim(`◆ ${evt.tools} tools · ≤${evt.maxSteps} steps`));
  } else if (evt.type === 'step' && evt.thought) {
    console.log(C.magenta(`  ◈ thought ${evt.step}`) + ' ' + String(evt.thought).slice(0, 200));
  } else if (evt.type === 'todos') {
    console.log(C.cyan('  ◈ plan'));
    for (const t of evt.todos || []) {
      console.log(`    ${t.completed ? C.green('☑') : '☐'} ${t.task}`);
    }
  } else if (evt.type === 'tool') {
    console.log(C.bold(`  ▸ ${evt.tool}`) + ' ' + JSON.stringify(evt.args || {}).slice(0, 160));
  } else if (evt.type === 'observation') {
    const flag = evt.ok ? C.green('✓') : C.red('✗');
    const text = String(evt.result || '').split('\n').slice(0, 4).join('\n       ').slice(0, 400);
    console.log(`    ${flag} ${text}`);
  } else if (evt.type === 'artifact') {
    console.log(C.green(`  ⬢ artifact: ${evt.artifact}`) + C.dim(` (${((evt.size || 0) / 1024).toFixed(1)}KB) → exports/agent-artifacts/`));
  } else if (evt.type === 'done') {
    console.log('');
    if (evt.answer) {
      console.log(C.bold('◆ ' + evt.answer));
    } else if (evt.exhausted) {
      console.log(C.red('◆ step budget exhausted — partial results above.'));
    }
  } else if (evt.type === 'error') {
    console.log(C.red('◆ error: ' + evt.message));
  }
}

// ── core run loop shared by chat/run ──
async function runTask(task, gate, { maxSteps = 14, json = false } = {}) {
  const { engineMod } = await runtime();
  const stream = engineMod.runReAct({
    task,
    maxSteps: Math.min(40, Math.max(1, maxSteps)),
    permissions: ['*'],
    // every dispatch passes through the permission gate
    toolGate: gate ? (name, argsArg, info) => gate.check(name, argsArg, info) : null,
  });
  for await (const evt of stream) {
    if (json) console.log(JSON.stringify(evt));
    else printEvent(evt);
  }
  return gate ? gate.stats() : null;
}

// ── commands ──
async function cmdRun() {
  const task = positional.join(' ').trim();
  if (!task) die('run needs a task — kc run "your task"');
  const gate = new PermissionGate({ yolo: flags.yolo, allow: flags.allow, verbose: flags.verbose });
  const stats = await runTask(task, gate, { maxSteps: flags.steps || 14, json: flags.json });
  if (stats) console.log(C.dim(`\n— ${stats.approved} approved · ${stats.denied} denied${stats.yolo ? ' · yolo mode' : ''}`));
}

async function cmdChat() {
  const gate = new PermissionGate({ yolo: flags.yolo, allow: flags.allow, verbose: flags.verbose });
  console.log(C.bold('kc interactive') + C.dim(' — describe a task. /yolo toggles full-auto, /exit quits.\n'));
  const readline = await import('readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  while (true) {
    process.stderr.write(C.cyan('\nkc> '));
    const line = (await rl.question('')).trim();
    if (!line) continue;
    if (line === '/exit' || line === '/quit') break;
    if (line === '/yolo') {
      gate.yolo = !gate.yolo;
      console.log(C.dim('yolo ' + (gate.yolo ? 'ON — auto-approving everything' : 'OFF — prompting again')));
      continue;
    }
    if (line === '/help') { console.log(HELP); continue; }
    await runTask(line, gate, { maxSteps: flags.steps || 14 });
  }
  rl.close();
}

async function cmdServe() {
  loadEnv();
  const serverPath = path.join(ROOT, 'server', 'server.js');
  const child = (await import('child_process')).spawn(process.execPath, [serverPath], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(flags.port || process.env.PORT || 5000) },
  });
  child.on('exit', (code) => process.exit(code || 0));
}

async function cmdTools() {
  const { toolsMod } = await runtime();
  const catalog = toolsMod.toolCatalog();
  console.log(C.bold(`${catalog.length} tools available\n`));
  const byGroup = {};
  for (const t of catalog) (byGroup[t.group] = byGroup[t.group] || []).push(t);
  for (const [g, list] of Object.entries(byGroup)) {
    console.log(C.cyan(g) + C.dim(` (${list.length})`));
    for (const t of list) console.log(`  ${t.name.padEnd(28)} ${String(t.description).slice(0, 88)}`);
    console.log('');
  }
}

async function cmdStatus() {
  loadEnv();
  const mod = await import(pathToFileURL(path.join(ROOT, 'server/services/agentRouterService.js')));
  const ids = mod.ROUTER_IDS || Object.keys(mod.ROUTERS || {});
  console.log(C.bold(`checking ${ids.length} routers…\n`));
  for (const id of ids) {
    process.stdout.write(`  ${id.padEnd(16)} `);
    try {
      const out = await mod.runAgent('reply with the single word: ok', { router: id, maxTokens: 10, timeoutMs: 12000 });
      console.log(out.ok ? C.green('alive') + C.dim(` (${out.router})`) : C.red('dead') + C.dim(` — ${out.error || ''}`));
    } catch (e) {
      console.log(C.red('dead') + C.dim(` — ${e.message}`));
    }
  }
}

async function cmdMcp() {
  loadEnv();
  const m = await import(pathToFileURL(path.join(ROOT, 'server/agent/mcpClient.js')));
  const cm = m.connectorManager;
  const status = typeof cm?.status === 'function' ? cm.status() : { note: 'no connector manager' };
  console.log(JSON.stringify(status, null, 2).slice(0, 3000));
}

// ── dispatch ──
if (flags.help || flags.h || (args.length === 0)) {
  if (args.length === 0) {
    // bare `kc` with no TTY would hang in chat — show help instead
    if (!process.stdin.isTTY) { console.log(HELP); process.exit(0); }
  } else {
    console.log(HELP); process.exit(0);
  }
}
const cmd = positional.shift() || 'chat';
const COMMANDS = {
  run: cmdRun,
  chat: cmdChat,
  serve: cmdServe,
  tools: cmdTools,
  status: cmdStatus,
  mcp: cmdMcp,
  help: () => console.log(HELP),
};
if (!COMMANDS[cmd]) die(`unknown command "${cmd}" — try kc --help`);
COMMANDS[cmd]().catch((e) => die(e.message));
