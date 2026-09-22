/* ============================================================
   KEYCODE OS — Application Core
   Boot, home screen, shell, agents, live streaming, panels,
   terminal, code viewer, 3D viewer, command palette.
   ============================================================ */
import { Universe } from './universe.js';
import { AGENT_DEFS, generateProject, flattenFiles } from './sim.js';
import { Viewer3D } from './viewer3d.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const state = {
  phase: 'boot',
  project: null,
  buildActive: false,
  agents: new Map(),
  panelTab: 'preview',
  cmdOpen: false,
  sidebarOpen: window.innerWidth > 860,
  chat: [],
};

/* ============================================================
   Boot sequence
   ============================================================ */
const BOOT_LINES = [
  ['KEYCODE OS v1.0.0 — initializing', 'dim'],
  ['✔ neural core linked', 'ok'],
  ['✔ loading 12 specialist agents', 'ok'],
  ['✔ mounting glass interface layer', 'dl'],
  ['✔ calibration: spatial compute', 'dl'],
  ['✔ gesture + voice input ready', 'ok'],
  ['✔ universe shader compiled', 'dl'],
  ['✔ all systems nominal', 'ok'],
];

function runBoot() {
  const log = $('#boot-log');
  const bar = $('#boot-bar');
  const status = $('#boot-status');
  let i = 0;

  gsap.fromTo('.boot-mark-path', { strokeDashoffset: 320 }, {
    strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut',
  });
  gsap.fromTo('.boot-mark-core', { scale: 0 }, {
    scale: 1, duration: 0.6, delay: 1.0, ease: 'back.out(3)',
  });

  const step = () => {
    if (i >= BOOT_LINES.length) {
      status.textContent = 'Launching interface';
      gsap.to('#boot', {
        opacity: 0, duration: 0.7, ease: 'power2.inOut',
        onComplete: () => {
          $('#boot').style.display = 'none';
          state.phase = 'home';
          revealHome();
        },
      });
      return;
    }
    const [txt, cls] = BOOT_LINES[i];
    const line = document.createElement('div');
    line.className = cls;
    line.textContent = txt;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    bar.style.width = `${Math.round(((i + 1) / BOOT_LINES.length) * 100)}%`;
    status.textContent = txt.replace(/^[✔✘▶◆]/g, '').trim();
    i++;
    setTimeout(step, 380 + Math.random() * 260);
  };
  setTimeout(step, 700);
}

function revealHome() {
  gsap.fromTo('#home', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, ease: 'power2.out' });
  gsap.fromTo('.home-badge', { y: -18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, delay: 0.15, ease: 'power2.out' });
  gsap.fromTo('.line-greeting', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, delay: 0.25, ease: 'power2.out' });
  gsap.fromTo('.line-ask', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, delay: 0.4, ease: 'power2.out' });
  gsap.fromTo('#prompt-box', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, delay: 0.55, ease: 'power2.out' });
  gsap.to('.chip', {
    opacity: 1, y: 0, duration: 0.5, stagger: 0.05, delay: 0.85, ease: 'power2.out',
  });
  gsap.fromTo('.home-footer', { opacity: 0 }, { opacity: 1, duration: 0.8, delay: 1.2 });
  setTimeout(() => $('#prompt-input').focus(), 900);
}

/* ============================================================
   Home → Workspace transition
   ============================================================ */
function launchBuild(promptRaw) {
  const prompt = promptRaw.trim();
  if (!prompt || state.buildActive) return;
  state.buildActive = true;
  state.project = generateProject(prompt);

  const input = $('#prompt-input');
  input.value = prompt;
  const box = $('#prompt-box');
  box.classList.add('busy');
  const enter = $('#prompt-enter');
  enter.style.pointerEvents = 'none';

  gsap.to('.home-title', { y: -30, opacity: 0, duration: 0.5, ease: 'power2.in' });
  gsap.to('.examples', { opacity: 0, y: 20, duration: 0.4, delay: 0.05 });
  gsap.to('.home-footer', { opacity: 0, duration: 0.3 });

  gsap.to('#prompt-box', {
    scale: 0.98, opacity: 0.2, duration: 0.6, delay: 0.15, ease: 'power2.in',
    onComplete: () => {
      // Collapse the input into the workspace and reveal shell
      $('#home').style.display = 'none';
      const shell = $('#shell');
      shell.hidden = false;
      gsap.fromTo(shell, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power2.out' });
      gsap.fromTo('#sidebar', { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: 'power2.out' });
      gsap.fromTo('#conversation', { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, delay: 0.1, ease: 'power2.out' });
      gsap.fromTo('#generation', { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, delay: 0.15, ease: 'power2.out' });
      $('#crumb-proj').textContent = state.project.name;
      $('#tb-status-text').textContent = 'Building';
      state.phase = 'build';
      setTimeout(() => runBuild(prompt), 500);
    },
  });
}

/* ============================================================
   Agent system
   ============================================================ */
function createAgentCards() {
  const grid = $('#agents-grid');
  grid.innerHTML = '';
  const defs = state.project.activeAgents;
  defs.forEach((def, i) => {
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.id = `agent-${def.id}`;
    card.innerHTML = `
      <div class="ag-top">
        <div class="ag-avatar" style="color:${def.color}">${def.icon}</div>
        <div class="ag-info">
          <div class="ag-name">${def.name}</div>
          <div class="ag-status">standby</div>
        </div>
      </div>
      <div class="ag-bar"><div class="ag-bar-fill"></div></div>
      <div class="ag-log"></div>`;
    grid.appendChild(card);
    state.agents.set(def.id, { def, el: card, progress: 0, status: 'standby' });
    gsap.fromTo(card, { opacity: 0, y: 14 }, {
      opacity: 1, y: 0, duration: 0.45, delay: 0.4 + i * 0.05, ease: 'power2.out',
    });
  });
  const maxAgents = Math.max(4, defs.length);
  $('#st-agents').textContent = `Agents: 0/${maxAgents}`;
}

function setAgent(id, { status, progress, log }) {
  const a = state.agents.get(id);
  if (!a) return;
  if (status !== undefined) {
    a.status = status;
    a.el.classList.toggle('active', status === 'working');
    a.el.classList.toggle('done', status === 'done');
    const label = { standby: 'standby', working: 'working…', done: 'complete' };
    $('.ag-status', a.el).textContent = label[status] || status;
  }
  if (progress !== undefined) {
    a.progress = progress;
    $('.ag-bar-fill', a.el).style.width = `${progress}%`;
  }
  if (log !== undefined) $('.ag-log', a.el).textContent = log;
}

function updateDockProgress() {
  const list = [...state.agents.values()];
  const done = list.filter((a) => a.status === 'done').length;
  const total = list.length;
  $('#dock-progress').textContent = `${Math.round((done / total) * 100)}%`;
  $('#st-agents').textContent = `Agents: ${done}/${total}`;
  return done / total;
}

/* ============================================================
   Conversation
   ============================================================ */
function addUserMessage(text) {
  const wrap = document.createElement('div');
  wrap.className = 'msg user';
  wrap.innerHTML = `
    <div class="msg-avatar">✦</div>
    <div class="msg-body">
      <div class="msg-name">You</div>
      <div class="msg-text"></div>
    </div>`;
  $('.msg-text', wrap).textContent = text;
  $('#conv-messages').appendChild(wrap);
  setTimeout(() => wrap.classList.add('in'), 10);
  scrollConv();
  return wrap;
}

function addAIMessage(html) {
  const wrap = document.createElement('div');
  wrap.className = 'msg';
  wrap.innerHTML = `
    <div class="msg-avatar">◈</div>
    <div class="msg-body">
      <div class="msg-name">KEYCODE Core</div>
      <div class="msg-text">${html}</div>
    </div>`;
  $('#conv-messages').appendChild(wrap);
  setTimeout(() => wrap.classList.add('in'), 10);
  scrollConv();
  return wrap;
}

function addTypingIndicator() {
  const wrap = document.createElement('div');
  wrap.className = 'msg';
  wrap.innerHTML = `
    <div class="msg-avatar">◈</div>
    <div class="msg-body">
      <div class="msg-name">KEYCODE Core</div>
      <div class="msg-text"><span class="msg-typing"><i></i><i></i><i></i></span></div>
    </div>`;
  $('#conv-messages').appendChild(wrap);
  wrap.id = 'typing-indicator';
  setTimeout(() => wrap.classList.add('in'), 10);
  scrollConv();
  return wrap;
}

function removeTypingIndicator() {
  const t = $('#typing-indicator');
  if (t) t.remove();
}

function streamText(el, text, speed = 16, cb) {
  const tgt = el;
  tgt.textContent = '';
  let i = 0;
  const tick = () => {
    if (i <= text.length) {
      tgt.textContent = text.slice(0, i);
      i += 2;
      scrollConv();
      setTimeout(tick, speed);
    } else if (cb) cb();
  };
  tick();
}

function scrollConv() {
  const s = $('#conv-messages');
  s.scrollTop = s.scrollHeight;
}

/* ============================================================
   Terminal
   ============================================================ */
function termWrite(text, cls = '') {
  const body = $('#term-body');
  const line = document.createElement('div');
  line.className = `term-line ${cls}`.trim();
  line.innerHTML = text;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
  return line;
}

function termCmd(text) {
  termWrite(`<span class="t-path">~/keycode</span> <span style="color:#eef2ff">$</span> ${text}`);
}

async function runTerminalScript(script) {
  termWrite('<div style="height:6px"></div>');
  for (const [cls, txt] of script) {
    if (cls === 'cmd') termCmd(txt);
    else termWrite(txt, cls);
    await sleep(360 + Math.random() * 320);
  }
  termWrite('<span class="term-caret"></span>', '');
}

/* ============================================================
   Code viewer + file tree
   ============================================================ */
const TOKEN_RULES = [
  [/^\s+/, 'plain'],
  [/^\b(return|const|let|var|function|import|export|from|class|if|else|for|while|await|async|new|this|extends|switch|case|break|true|false|null|void|enum|model|datasource|generator|provider)\b/, 'tk-kw'],
  [/^"[^"]*"|^'[^']*'|^`[^`]*`/, 'tk-str'],
  [/^\b\d+(\.\d+)?\b/, 'tk-num'],
  [/^\b(#[A-Za-z_][\w-]*|<!--|\/\/.*|#.*)$/, 'tk-com'],
  [/^[(){}[\].,;:]/ , 'tk-punc'],
  [/^<\/?[a-zA-Z][^>]*>|^<[a-zA-Z]/, 'tk-tag'],
  [/^[a-zA-Z_][\w-]*\s*(?=\()/, 'tk-fn'],
  [/^[a-zA-Z_][\w-]*\s*(?=:)/, 'tk-attr'],
];

function highlight(code) {
  let out = '';
  let rest = code;
  while (rest.length) {
    let matched = false;
    for (const [re, cls] of TOKEN_RULES) {
      const m = re.exec(rest);
      if (m) {
        const txt = m[0];
        out += cls === 'plain' ? txt.replace(/&/g, '&amp;').replace(/</g, '&lt;') : `<span class="${cls}">${txt.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`;
        rest = rest.slice(txt.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      const ch = rest[0];
      out += ch === '<' ? '&lt;' : ch;
      rest = rest.slice(1);
    }
  }
  return out;
}

function renderFileTree() {
  const root = $('#ft-root');
  root.innerHTML = '';
  const tree = state.project.tree;
  const walk = (node, depth) => {
    for (const [key, val] of Object.entries(node)) {
      const isDir = val && typeof val === 'object' && !Array.isArray(val) && !('icon' in val);
      const item = document.createElement('div');
      item.className = 'ft-item';
      item.style.paddingLeft = `${10 + depth * 14}px`;
      item.dataset.path = key;
      item.innerHTML = `<span class="ft-ic">${isDir ? '▸' : val.icon}</span>${key}`;
      item.addEventListener('click', () => {
        $$('.ft-item', root).forEach((x) => x.classList.remove('active'));
        item.classList.add('active');
        const code = state.project.code[key];
        if (code) renderCode(key, code);
      });
      root.appendChild(item);
      if (isDir) walk(val, depth + 1);
    }
  };
  walk(tree, 0);
}

function renderCode(filename, code) {
  const tabs = $('#editor-tabs');
  tabs.innerHTML = `<div class="editor-tab active">${filename.split('/').pop()}</div>`;
  const codeEl = $('#editor-code');
  codeEl.innerHTML = highlight(code);
}

async function streamCode(filename, code) {
  const tabs = $('#editor-tabs');
  tabs.innerHTML = `<div class="editor-tab active">${filename.split('/').pop()}</div>`;
  const codeEl = $('#editor-code');
  codeEl.innerHTML = '';
  const n = code.length;
  const chunk = 4;
  const perTick = 10;
  const ticks = Math.ceil(n / chunk);
  const delay = Math.max(4, Math.min(22, Math.round(3600 / n)));
  for (let t = 1; t <= ticks; t++) {
    const slice = code.slice(0, t * chunk);
    codeEl.innerHTML = highlight(slice) + '<span class="tk-cursor">▍</span>';
    if (t % perTick === 0) codeEl.scrollTop = codeEl.scrollHeight;
    if (t % perTick === 0) await sleep(delay);
  }
  codeEl.innerHTML = highlight(code);
  // mark file active in tree
  $$('.ft-item').forEach((x) => {
    x.classList.toggle('active', x.dataset.path === filename);
  });
}

/* ============================================================
   Files + DB + Git + Deploy panels
   ============================================================ */
function renderFiles() {
  const grid = $('#files-grid');
  grid.innerHTML = '';
  const files = flattenFiles(state.project.tree);
  $('#files-count').textContent = `· ${files.length}`;
  const order = Object.keys(state.project.code).concat(files.filter((f) => !state.project.code[f.path]).map((f) => f.path));
  // unique ordering
  const seen = new Set();
  for (const f of order) {
    if (seen.has(f)) continue;
    seen.add(f);
    const card = document.createElement('div');
    card.className = 'file-card';
    const icon = files.find((x) => x.path === f)?.icon || '📄';
    card.innerHTML = `<span class="fc-ic">${icon}</span><div class="fc-name">${f}</div><div class="fc-size"></div>`;
    grid.appendChild(card);
    gsap.fromTo(card, { opacity: 0, scale: 0.9 }, {
      opacity: 1, scale: 1, duration: 0.4, delay: 0.05, ease: 'back.out(2)',
    });
  }
}

function renderDB() {
  const wrap = $('#db-tables');
  wrap.innerHTML = '';
  state.project.dbTables.forEach((t, ti) => {
    const table = document.createElement('div');
    table.className = 'db-table';
    table.innerHTML = `
      <div class="db-table-head"><span>▤ ${t.name}</span><span>${t.rows.length} cols</span></div>
      ${t.rows.map(([k, v]) => `<div class="db-row"><span style="color:#a78bfa">${k}</span><span>${v}</span></div>`).join('')}`;
    wrap.appendChild(table);
    gsap.fromTo(table, { opacity: 0, y: 10 }, {
      opacity: 1, y: 0, duration: 0.4, delay: ti * 0.12, ease: 'power2.out',
    });
  });
}

function renderGit() {
  const wrap = $('#git-log');
  wrap.innerHTML = '';
  state.project.git.forEach(([msg, hash], i) => {
    const item = document.createElement('div');
    item.className = 'git-item';
    item.innerHTML = `<span class="gi-hash">${hash}</span><span class="gi-msg">${msg}</span><span class="gi-hash" style="margin-left:auto">${i === 0 ? 'HEAD' : ''}</span>`;
    wrap.appendChild(item);
    gsap.fromTo(item, { opacity: 0, x: -14 }, {
      opacity: 1, x: 0, duration: 0.4, delay: i * 0.14, ease: 'power2.out',
    });
  });
}

async function renderDeploy() {
  const list = $('#deploy-list');
  list.innerHTML = '';
  const steps = state.project.deploy;
  for (let i = 0; i < steps.length; i++) {
    const step = document.createElement('div');
    step.className = 'deploy-step run';
    step.innerHTML = `<span class="ds-ic">⟳</span>${steps[i]}`;
    list.appendChild(step);
    gsap.fromTo(step, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35 });
    await sleep(520);
    step.className = 'deploy-step done';
    step.querySelector('.ds-ic').textContent = '✓';
  }
  const url = `https://${state.project.name}.keycode.studio`;
  const done = document.createElement('div');
  done.className = 'deploy-step done';
  done.style.opacity = '1';
  done.innerHTML = `<span class="ds-ic">🚀</span><span>Live: <span style="color:var(--prim-2)">${url}</span></span>`;
  list.appendChild(done);
  gsap.fromTo(done, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.4 });
  toast('Deployment complete', url, 'ok');
}

/* ============================================================
   Preview
   ============================================================ */
function buildPreview() {
  const frame = $('#preview-frame');
  frame.hidden = false;
  $('#preview-empty').style.display = 'none';
  const html = state.project.code['src/index.html'] || state.project.code['src/app.tsx'] || '';
  const fallback = `<!DOCTYPE html><html><head><style>body{font-family:system-ui;background:#0a0a12;color:#eef2ff;display:grid;place-items:center;height:100vh;margin:0}h1{font-size:2rem;background:linear-gradient(90deg,#6d5cff,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}</style></head><body><h1>${state.project.previewTitle}</h1></body></html>`;
  const src = html.includes('<body') || html.includes('<html') ? html : fallback;
  frame.srcdoc = src;
  // pick a code file to auto-open
  const firstCodeKey = Object.keys(state.project.code)[0];
  streamCode(firstCodeKey, state.project.code[firstCodeKey]);
}

/* ============================================================
   Build orchestrator
   ============================================================ */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBuild(prompt) {
  addUserMessage(prompt);
  createAgentCards();

  // Planner message
  const typer = addTypingIndicator();
  await sleep(900);
  removeTypingIndicator();

  const planText = [
    '<span class="plan-head">▸ Initializing build</span>',
    `<span class="plan-line">Project: <b>${state.project.previewTitle}</b></span>`,
    `<span class="plan-line">Domain: <b>${state.project.domain.toUpperCase()}</b></span>`,
    `<span class="plan-line">Team: <b>${state.project.activeAgents.length} agents</b> dispatched in parallel</span>`,
    `<span class="plan-line">Streaming live: code · terminal · preview · deployment</span>`,
  ].join('\n');
  addAIMessage(planText);
  await sleep(700);

  setAgent('planner', { status: 'working', progress: 20, log: 'Architecting solution…' });
  await sleep(800);
  setAgent('planner', { status: 'done', progress: 100, log: 'Blueprint complete' });
  updateDockProgress();

  // launch terminal + code streaming + agents concurrently
  const agentScript = state.project.agents;
  const terminalScript = state.project.terminal;
  const codeEntries = Object.entries(state.project.code);

  switchPanel('terminal');
  renderFileTree();

  const agentRunner = runAgentSequence(agentScript);
  const termRunner = runTerminalScript(terminalScript);

  // Stream code in the background (switch to code tab once started)
  await sleep(500);
  switchPanel('code');
  renderFileTree();
  for (const [fname, code] of codeEntries) {
    await streamCode(fname, code);
    const ft = $(`.ft-item[data-path="${fname}"]`);
    if (ft) { ft.classList.add('active'); }
    await sleep(180);
  }

  await Promise.all([agentRunner, termRunner]);

  // Database + git + files
  switchPanel('database');
  renderDB();
  await sleep(600);
  switchPanel('git');
  renderGit();
  await sleep(600);
  switchPanel('files');
  renderFiles();
  await sleep(400);

  // Deploy
  switchPanel('deploypanel');
  await renderDeploy();
  await sleep(400);

  // Final states
  setAgent('devops', { status: 'done', progress: 100, log: 'Deployed ✓' });
  updateDockProgress();

  state.buildActive = false;
  $('#tb-status-text').textContent = 'Deployed';
  $('#conv-sub').textContent = 'Build complete';
  addAIMessage('✅ <b>Build complete.</b><br>Preview, code, terminal, database and deployment are all live. Ask me to iterate, add features, or ship it for real.');
  toast('Build complete', `${state.project.previewTitle} is ready`, 'ok');
}

async function runAgentSequence(script) {
  for (const [agentId, log] of script) {
    const a = state.agents.get(agentId);
    if (!a) continue;
    setAgent(agentId, { status: 'working', progress: 15, log: log });
    // slow progress over a random duration
    const steps = 6 + ((Math.random() * 4) | 0);
    for (let s = 1; s <= steps; s++) {
      await sleep(160 + Math.random() * 200);
      if (a.status === 'working') {
        setAgent(agentId, { progress: Math.round((s / steps) * 100) });
      }
    }
    setAgent(agentId, { status: 'done', progress: 100, log: '✓ ' + log.split('—')[0] });
    updateDockProgress();
  }
}

/* ============================================================
   Panel switching
   ============================================================ */
function switchPanel(tab) {
  state.panelTab = tab;
  $$('.ptab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.ptab-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
}

/* ============================================================
   Command palette
   ============================================================ */
const COMMANDS = [
  { ic: '⬡', label: 'New Web Project', act: 'new-web', hint: 'Start a web build' },
  { ic: '⊞', label: 'New PCB Project', act: 'new-pcb', hint: 'Hardware + firmware' },
  { ic: '⬢', label: 'New CAD Project', act: 'new-cad', hint: 'Mechanical design' },
  { ic: '▶', label: 'New Game Project', act: 'new-game', hint: 'Interactive 3D' },
  { ic: '⌁', label: 'Open Terminal', act: 'panel:terminal', hint: 'Terminal tab' },
  { ic: '◐', label: 'Open 3D Viewer', act: 'panel:viewer3d', hint: 'Model viewer' },
  { ic: '◧', label: 'Go to Dashboard', act: 'home', hint: 'Back to home' },
  { ic: '⇪', label: 'View Deployments', act: 'panel:deploypanel', hint: 'Deployment tab' },
];

function openCmdPalette() {
  const cmd = $('#cmd');
  cmd.hidden = false;
  const input = $('#cmd-input');
  input.value = '';
  renderCmdList('');
  requestAnimationFrame(() => {
    cmd.classList.add('show');
    input.focus();
  });
  state.cmdOpen = true;
}

function closeCmdPalette() {
  const cmd = $('#cmd');
  cmd.classList.remove('show');
  setTimeout(() => { cmd.hidden = true; }, 180);
  state.cmdOpen = false;
}

let cmdIndex = 0;
function renderCmdList(filter) {
  const list = $('#cmd-list');
  const filtered = COMMANDS.filter((c) => c.label.toLowerCase().includes(filter.toLowerCase()));
  cmdIndex = 0;
  list.innerHTML = filtered.map((c, i) => `
    <div class="cmd-item ${i === 0 ? 'hl' : ''}" data-act="${c.act}">
      <span class="ci-ic">${c.ic}</span>
      <span style="flex:1">${c.label}</span>
      <span style="font-size:10.5px;color:var(--text-2)">${c.hint}</span>
    </div>`).join('') || '<div style="padding:16px;color:var(--text-2);font-size:13px">No commands found</div>';
  list.querySelectorAll('.cmd-item').forEach((item) => {
    item.addEventListener('mouseenter', () => {
      list.querySelectorAll('.cmd-item').forEach((x) => x.classList.remove('hl'));
      item.classList.add('hl');
    });
    item.addEventListener('click', () => runCommand(item.dataset.act));
  });
}

function runCommand(act) {
  closeCmdPalette();
  if (act.startsWith('panel:')) {
    switchPanel(act.split(':')[1]);
    return;
  }
  if (act === 'home') {
    resetToHome();
    return;
  }
  if (act.startsWith('new-')) {
    const labels = { 'new-web': 'Build a modern web app', 'new-pcb': 'Design a 4-layer drone PCB with flight controller', 'new-cad': 'Design a parametric product enclosure', 'new-game': 'Create a WebGL game with neon worlds' };
    resetToHome(labels[act]);
    return;
  }
}

function resetToHome(prefill) {
  state.buildActive = false;
  $('#shell').hidden = true;
  $('#home').style.display = 'flex';
  gsap.fromTo('#home', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 });
  if (prefill) {
    const input = $('#prompt-input');
    input.value = prefill;
    setTimeout(() => launchBuild(prefill), 500);
  } else {
    gsap.to('#prompt-box', { scale: 1, opacity: 1, duration: 0.4, delay: 0.2 });
    setTimeout(() => $('#prompt-input').focus(), 400);
  }
}

/* ============================================================
   Sidebar navigation
   ============================================================ */
function handleNav(view) {
  $$('.nav-item').forEach((n) => n.classList.remove('active'));
  const btn = $(`.nav-item[data-view="${view}"]`);
  if (btn) btn.classList.add('active');

  // Map studio views to command actions
  const map = {
    dashboard: 'home',
    chat: null,
    terminal: 'panel:terminal',
    deploy: 'panel:deploypanel',
    web: 'new-web',
    cad: 'new-cad',
    pcb: 'new-pcb',
    game: 'new-game',
  };
  const act = map[view];
  if (act) runCommand(act);
  if (view === 'chat') {
    switchPanel('preview');
  }
  if (state.sidebarOpen && window.innerWidth <= 860) {
    $('#sidebar').classList.remove('open');
  }
}

/* ============================================================
   Toasts
   ============================================================ */
function toast(title, sub, type = '') {
  const box = document.createElement('div');
  box.className = `toast ${type}`.trim();
  box.innerHTML = `<span class="t-ic">${type === 'ok' ? '✓' : type === 'warn' ? '⚠' : '◈'}</span><div><div style="font-weight:600">${title}</div><div style="font-size:12px;color:var(--text-1)">${sub}</div></div>`;
  $('#toasts').appendChild(box);
  gsap.to(box, { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out' });
  setTimeout(() => {
    gsap.to(box, { opacity: 0, x: 24, duration: 0.3, onComplete: () => box.remove() });
  }, 3800);
}

/* ============================================================
   Clock + stats
   ============================================================ */
function tickStatus() {
  const now = new Date();
  $('#st-clock').textContent = now.toLocaleTimeString();
  const done = [...state.agents.values()].filter((a) => a.status === 'done').length;
  const total = state.agents.size;
  const pct = total ? Math.round((done / total) * 100) : 0;
  $('#st-gpu').textContent = `GPU: ${Math.min(99, 8 + pct * 0.8 | 0)}%`;
  $('#st-cpu').textContent = `CPU: ${Math.min(99, 12 + pct * 0.85 | 0)}%`;
  $('#st-mem').textContent = `MEM: ${(1.2 + pct * 0.02).toFixed(1)} GB`;
}

/* ============================================================
   Global init
   ============================================================ */
function init() {
  const universe = new Universe($('#universe'));
  window.__universe = universe;
  const viewer = new Viewer3D('#v3d-canvas');
  window.__viewer = viewer;

  runBoot();

  // Home interactions
  const input = $('#prompt-input');
  const enterBtn = $('#prompt-enter');
  const submit = () => launchBuild(input.value);
  enterBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  // auto-grow
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  });
  $$('.chip').forEach((c) => {
    c.addEventListener('click', () => {
      input.value = c.dataset.prompt;
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
      input.focus();
    });
  });

  // Conversation input
  const convInput = $('#conv-input');
  const convSend = $('#conv-send');
  const convSubmit = () => {
    const txt = convInput.value.trim();
    if (!txt) return;
    addUserMessage(txt);
    const t = addTypingIndicator();
    setTimeout(() => {
      removeTypingIndicator();
      addAIMessage(`On it. I've queued that as an iteration on <b>${state.project?.previewTitle || 'the project'}</b> — routing to the appropriate agents.`);
      toast('Task queued', txt.length > 40 ? txt.slice(0, 40) + '…' : txt);
    }, 900);
    convInput.value = '';
    convInput.style.height = 'auto';
  };
  convSend.addEventListener('click', convSubmit);
  convInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); convSubmit(); }
  });

  // Panel tabs
  $$('.ptab').forEach((t) => {
    t.addEventListener('click', () => switchPanel(t.dataset.tab));
  });

  // Sidebar
  $$('.nav-item[data-view]').forEach((n) => {
    n.addEventListener('click', () => handleNav(n.dataset.view));
  });
  $('#tb-hamburger').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
    state.sidebarOpen = $('#sidebar').classList.contains('open');
  });

  // Command palette
  $('#tb-cmd').addEventListener('click', openCmdPalette);
  $('#tb-search').addEventListener('click', openCmdPalette);
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      state.cmdOpen ? closeCmdPalette() : openCmdPalette();
    }
    if (e.key === 'Escape' && state.cmdOpen) closeCmdPalette();
  });
  const cmdInput = $('#cmd-input');
  cmdInput.addEventListener('input', () => renderCmdList(cmdInput.value));
  cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveCmd(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveCmd(-1); }
    if (e.key === 'Enter') {
      const hl = $('.cmd-item.hl');
      if (hl) runCommand(hl.dataset.act);
    }
  });
  function moveCmd(d) {
    const items = $$('.cmd-item', $('#cmd-list'));
    if (!items.length) return;
    cmdIndex = (cmdIndex + d + items.length) % items.length;
    items.forEach((x, i) => x.classList.toggle('hl', i === cmdIndex));
  }
  $('#cmd').addEventListener('click', (e) => { if (e.target === $('#cmd')) closeCmdPalette(); });

  // Notifications
  $('#tb-notif').addEventListener('click', () => toast('Notifications', '3 system updates since last check', 'warn'));

  // Stats ticker
  setInterval(tickStatus, 1000);
  tickStatus();

  // Keep universe alive
  window.addEventListener('beforeunload', () => universe.dispose());
}

document.addEventListener('DOMContentLoaded', init);
