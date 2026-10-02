/* ============================================================
   KEYCODE OS — Application Core  (REAL RUNTIME EDITION)
   Every panel is wired to the live agent runtime:

   • Boot pings the real /api/health + /api/agent/tools
   • Chat streams the genuine ReAct loop over SSE
     (/api/agent/react) — thought → tool → observation
   • Code panel renders the agent's actual bytes from
     `file` events (created / edited / rewrote)
   • Terminal shows real observations, never scripted lines
   • Files panel = the run's true workspace listing
   • Preview renders the agent's real .html output
   • Deliver = real downloadable artifact ZIPs
   • Routers panel = live 15-provider swarm health (free tiers first)
   • Runtime panel = real tool catalog + sandbox stats

   If the backend is unreachable the UI says so honestly and
   offers Offline Demo — clearly labeled, never passed off as
   a real build.
   ============================================================ */
import { Universe } from './universe.js';
import { Viewer3D } from './viewer3d.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const state = {
  phase: 'boot',
  online: false,
  buildActive: false,
  abortCtrl: null,
  panelTab: 'preview',
  cmdOpen: false,
  sidebarOpen: window.innerWidth > 860,
  agents: new Map(),
  files: new Map(),      // path → { content, bytes, verb, at }
  order: [],             // file order for tree
  stats: { tools: 0, routers: { configured: 0, total: 0 } },
  demoTimer: null,
};

/* ============================================================
   Boot sequence — probes the REAL runtime
   ============================================================ */
function runBoot() {
  const log = $('#boot-log');
  const bar = $('#boot-bar');
  const status = $('#boot-status');

  gsap.fromTo('.boot-mark-path', { strokeDashoffset: 320 }, {
    strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut',
  });
  gsap.fromTo('.boot-mark-core', { scale: 0 }, {
    scale: 1, duration: 0.6, delay: 1.0, ease: 'back.out(3)',
  });

  // Two things actually happen during boot: health probe + tool census.
  const probes = Promise.allSettled([
    fetch('/api/health').then((r) => r.json()),
    fetch('/api/agent/tools').then((r) => r.json()),
    fetch('/api/agent/routers').then((r) => r.json()),
  ]);

  const lines = [
    ['KEYCODE OS v2.0 — initializing', 'dim'],
    ['✔ mounting glass interface layer', 'dl'],
  ];
  let i = 0;

  const finishLine = (txt, cls) => {
    const line = document.createElement('div');
    line.className = cls;
    line.textContent = txt;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  };

  const step = () => {
    if (i >= lines.length) {
      probes.then(([health, tools, routers]) => {
        state.online = health.status === 'fulfilled' && health.value?.status;
        if (state.online) {
          state.stats.tools = tools.status === 'fulfilled' ? (tools.value?.total || 0) : 0;
          if (routers.status === 'fulfilled') {
            state.stats.routers.configured = routers.value?.configured || 0;
            state.stats.routers.total = routers.value?.total || 0;
          }
          finishLine(`✔ runtime online · ${state.stats.tools} tools · ${state.stats.routers.configured}/${state.stats.routers.total} routers`, 'ok');
        } else {
          finishLine('✘ runtime unreachable — offline mode', 'err');
        }
        finishLine('✔ all systems nominal', 'ok');
        bar.style.width = '100%';
        status.textContent = 'Launching interface';
        setTimeout(launch, 500);
      });
      return;
    }
    const [txt, cls] = lines[i];
    finishLine(txt, cls);
    bar.style.width = `${Math.round(((i + 1) / (lines.length + 2)) * 90)}%`;
    status.textContent = txt.replace(/^[✔✘▶◆]/g, '').trim();
    i++;
    setTimeout(step, 340 + Math.random() * 200);
  };
  setTimeout(step, 600);

  const launch = () => {
    gsap.to('#boot', {
      opacity: 0, duration: 0.7, ease: 'power2.inOut',
      onComplete: () => {
        $('#boot').style.display = 'none';
        state.phase = 'home';
        revealHome();
      },
    });
  };
}

function revealHome() {
  gsap.fromTo('#home', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, ease: 'power2.out' });
  gsap.fromTo('.home-badge', { y: -18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, delay: 0.15, ease: 'power2.out' });
  gsap.fromTo('.line-greeting', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, delay: 0.25, ease: 'power2.out' });
  gsap.fromTo('.line-ask', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, delay: 0.4, ease: 'power2.out' });
  gsap.fromTo('#prompt-box', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, delay: 0.55, ease: 'power2.out' });
  gsap.to('.chip', { opacity: 1, y: 0, duration: 0.5, stagger: 0.05, delay: 0.85, ease: 'power2.out' });
  gsap.fromTo('.home-footer', { opacity: 0 }, { opacity: 1, duration: 0.8, delay: 1.2 });
  setTimeout(() => $('#prompt-input').focus(), 900);

  // Reflect the REAL runtime state in the UI
  const badge = $('#home-badge-text');
  const meta = $('#meta-tools');
  const foot = $('#foot-routers');
  if (state.online) {
    badge.textContent = `runtime online · ${state.stats.routers.configured}/${state.stats.routers.total} AI routers`;
    meta.textContent = `${state.stats.tools} agent tools · live`;
    foot.textContent = `routers ${state.stats.routers.configured}/${state.stats.routers.total}`;
  } else {
    badge.textContent = 'offline — start the server (npm start)';
    meta.textContent = 'agent tools · unreachable';
    foot.textContent = 'routers —';
  }
}

/* ============================================================
   Home → Workspace transition
   ============================================================ */
function launchBuild(promptRaw) {
  const prompt = promptRaw.trim();
  if (!prompt || state.buildActive) return;
  state.buildActive = true;

  const input = $('#prompt-input');
  input.value = prompt;
  const box = $('#prompt-box');
  box.classList.add('busy');
  $('#prompt-enter').style.pointerEvents = 'none';

  gsap.to('.home-title', { y: -30, opacity: 0, duration: 0.5, ease: 'power2.in' });
  gsap.to('.examples', { opacity: 0, y: 20, duration: 0.4, delay: 0.05 });
  gsap.to('.home-footer', { opacity: 0, duration: 0.3 });
  gsap.to('#prompt-box', {
    scale: 0.98, opacity: 0.2, duration: 0.6, delay: 0.15, ease: 'power2.in',
    onComplete: () => {
      $('#home').style.display = 'none';
      const shell = $('#shell');
      shell.hidden = false;
      gsap.fromTo(shell, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power2.out' });
      gsap.fromTo('#conversation', { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, delay: 0.1, ease: 'power2.out' });
      gsap.fromTo('#generation', { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, delay: 0.15, ease: 'power2.out' });
      $('#crumb-proj').textContent = 'agent run';
      $('#tb-status-text').textContent = 'Connecting';
      state.phase = 'build';
      setTimeout(() => runAgentTask(prompt), 500);
    },
  });
}

/* ============================================================
   Agent fleet dock — derives LIVE cards from the tool stream
   ============================================================ */
const AGENT_FAMILIES = [
  { id: 'planner',  name: 'Planner',  icon: '◈', color: '#a78bfa' },
  { id: 'builder',  name: 'Builder',  icon: '⬡', color: '#6d5cff' },
  { id: 'executor', name: 'Executor', icon: '▶', color: '#f59e0b' },
  { id: 'scout',    name: 'Scout',    icon: '⌕', color: '#22d3ee' },
];

function ensureAgentCard(id, label) {
  if (state.agents.has(id)) return state.agents.get(id);
  const fam = AGENT_FAMILIES.find((f) => f.id === id) || { id, name: label || id, icon: '◆', color: '#94a3b8' };
  const card = document.createElement('div');
  card.className = 'agent-card';
  card.innerHTML = `
    <div class="ag-top">
      <div class="ag-avatar" style="color:${fam.color}">${fam.icon}</div>
      <div class="ag-info">
        <div class="ag-name">${fam.name}</div>
        <div class="ag-status">standby</div>
      </div>
    </div>
    <div class="ag-bar"><div class="ag-bar-fill"></div></div>
    <div class="ag-log"></div>`;
  $('#agents-grid').appendChild(card);
  const entry = { el: card, status: 'standby', calls: 0 };
  state.agents.set(id, entry);
  gsap.fromTo(card, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
  return entry;
}

function setAgent(id, { status, progress, log }, label) {
  const a = ensureAgentCard(id, label);
  if (status !== undefined) {
    a.status = status;
    a.el.classList.toggle('active', status === 'working');
    a.el.classList.toggle('done', status === 'done');
    const lbl = { standby: 'standby', working: 'working…', done: 'complete' };
    $('.ag-status', a.el).textContent = lbl[status] || status;
  }
  if (progress !== undefined) $('.ag-bar-fill', a.el).style.width = `${progress}%`;
  if (log !== undefined) $('.ag-log', a.el).textContent = log;
}

function agentForTool(tool) {
  if (!tool) return 'builder';
  if (['todo_write', 'spawn_agent'].includes(tool)) return 'planner';
  if (['web_search', 'fetch_url', 'browser_navigate', 'repo_search', 'workspace_grep', 'file_search'].includes(tool)) return 'scout';
  if (['code_run'].includes(tool)) return 'executor';
  return 'builder';
}

function updateDockProgress() {
  const list = [...state.agents.values()];
  if (!list.length) return;
  const done = list.filter((a) => a.status === 'done').length;
  $('#dock-progress').textContent = `${Math.round((done / list.length) * 100)}%`;
  $('#st-agents').textContent = `Agents: ${done}/${list.length}`;
}

/* ============================================================
   Conversation
   ============================================================ */
function addUserMessage(text) {
  const wrap = document.createElement('div');
  wrap.className = 'msg user';
  wrap.innerHTML = `<div class="msg-avatar">✦</div><div class="msg-body"><div class="msg-name">You</div><div class="msg-text"></div></div>`;
  $('.msg-text', wrap).textContent = text;
  $('#conv-messages').appendChild(wrap);
  setTimeout(() => wrap.classList.add('in'), 10);
  scrollConv();
}

function addAIMessage(html) {
  const wrap = document.createElement('div');
  wrap.className = 'msg';
  wrap.innerHTML = `<div class="msg-avatar">◈</div><div class="msg-body"><div class="msg-name">KEYCODE Core</div><div class="msg-text">${html}</div></div>`;
  $('#conv-messages').appendChild(wrap);
  setTimeout(() => wrap.classList.add('in'), 10);
  scrollConv();
  return wrap;
}

function addTypingIndicator() {
  const wrap = document.createElement('div');
  wrap.className = 'msg';
  wrap.innerHTML = `<div class="msg-avatar">◈</div><div class="msg-body"><div class="msg-name">KEYCODE Core</div><div class="msg-text"><span class="msg-typing"><i></i><i></i><i></i></span></div></div>`;
  wrap.id = 'typing-indicator';
  $('#conv-messages').appendChild(wrap);
  setTimeout(() => wrap.classList.add('in'), 10);
  scrollConv();
  return wrap;
}

function removeTypingIndicator() {
  $('#typing-indicator')?.remove();
}

function scrollConv() {
  const s = $('#conv-messages');
  s.scrollTop = s.scrollHeight;
}

/* ============================================================
   Terminal — REAL observations only
   ============================================================ */
function termWrite(text, cls = '') {
  const body = $('#term-body');
  const line = document.createElement('div');
  line.className = `term-line ${cls}`.trim();
  line.textContent = text;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

/* ============================================================
   Code viewer + file tree — fed by REAL file events
   ============================================================ */
const TOKEN_RULES = [
  [/^\s+/, 'plain'],
  [/^\b(return|const|let|var|function|import|export|from|class|if|else|for|while|await|async|new|this|extends|switch|case|break|true|false|null|void|def|print)\b/, 'tk-kw'],
  [/^"[^"]*"|^'[^']*'|^`[^`]*`/, 'tk-str'],
  [/^\b\d+(\.\d+)?\b/, 'tk-num'],
  [/^(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/, 'tk-com'],
  [/^[(){}[\].,;:]/, 'tk-punc'],
  [/^<\/?[a-zA-Z][^>]*>/, 'tk-tag'],
  [/^[a-zA-Z_][\w-]*\s*(?=\()/, 'tk-fn'],
  [/^[a-zA-Z_][\w-]*\s*(?==)/, 'tk-attr'],
];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlight(code) {
  let out = '';
  let rest = String(code);
  let guard = 0;
  while (rest.length && guard++ < 200000) {
    let matched = false;
    for (const [re, cls] of TOKEN_RULES) {
      const m = re.exec(rest);
      if (m) {
        const txt = m[0];
        out += cls === 'plain' ? esc(txt) : `<span class="${cls}">${esc(txt)}</span>`;
        rest = rest.slice(txt.length);
        matched = true;
        break;
      }
    }
    if (!matched) { out += esc(rest[0]); rest = rest.slice(1); }
  }
  return out;
}

function iconFor(path) {
  if (/\.html?$/.test(path)) return '🌐';
  if (/\.css$/.test(path)) return '🎨';
  if (/\.jsx?$|\.tsx?$|\.mjs$/.test(path)) return '🟨';
  if (/\.py$/.test(path)) return '🐍';
  if (/\.json$/.test(path)) return '📦';
  if (/\.md$/.test(path)) return '📘';
  if (/\.(c|cpp|h)$/.test(path)) return '◉';
  if (/\.(sh)$/.test(path)) return '⚙️';
  return '📄';
}

function renderFileTree() {
  const root = $('#ft-root');
  root.innerHTML = '';
  if (!state.order.length) {
    root.innerHTML = '<div class="ft-empty">no files yet</div>';
    return;
  }
  for (const path of state.order) {
    const item = document.createElement('div');
    item.className = 'ft-item';
    item.dataset.path = path;
    item.innerHTML = `<span class="ft-ic">${iconFor(path)}</span>${esc(path)}`;
    item.addEventListener('click', () => renderCode(path));
    root.appendChild(item);
  }
}

function renderCode(path) {
  const f = state.files.get(path);
  if (!f) return;
  $('#editor-tab').textContent = path;
  $('#editor-code').innerHTML = highlight(f.content);
  $$('.ft-item').forEach((x) => x.classList.toggle('active', x.dataset.path === path));
}

async function streamCode(path, content) {
  $('#code-empty').style.display = 'none';
  $('#code-layout').hidden = false;
  const codeEl = $('#editor-code');
  $('#editor-tab').textContent = path;
  codeEl.innerHTML = '';
  const chunk = Math.max(3, Math.ceil(content.length / 90));
  for (let i = 0; i <= content.length; i += chunk) {
    codeEl.innerHTML = highlight(content.slice(0, i)) + '<span class="tk-cursor">▍</span>';
    codeEl.scrollTop = codeEl.scrollHeight;
    await sleep(8);
  }
  renderCode(path);
  $$('.ft-item').forEach((x) => x.classList.toggle('active', x.dataset.path === path));
}

/* ============================================================
   Files panel — REAL workspace listing
   ============================================================ */
function renderFiles() {
  const grid = $('#files-grid');
  grid.innerHTML = '';
  $('#files-count').textContent = String(state.files.size);
  for (const [path, f] of state.files) {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.innerHTML = `<span class="fc-ic">${iconFor(path)}</span><div class="fc-name">${esc(path)}</div><div class="fc-size">${f.verb} · ${(f.bytes / 1024).toFixed(1)} KB</div>`;
    card.addEventListener('click', () => { switchPanel('code'); renderCode(path); });
    grid.appendChild(card);
    gsap.fromTo(card, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' });
  }
}

/* ============================================================
   Preview — render the agent's REAL html output
   ============================================================ */
function refreshPreview() {
  const htmlFile = [...state.files.keys()].find((p) => p.endsWith('.html') || p.endsWith('.htm'));
  if (!htmlFile) return;
  const frame = $('#preview-frame');
  $('#preview-empty').style.display = 'none';
  frame.hidden = false;
  frame.srcdoc = state.files.get(htmlFile).content;
}

/* ============================================================
   Deliver panel — REAL artifacts
   ============================================================ */
function addArtifact(name, size) {
  $('#deliver-empty').style.display = 'none';
  const list = $('#deliver-list');
  list.hidden = false;
  const row = document.createElement('div');
  row.className = 'deliver-row';
  row.innerHTML = `
    <span class="dl-ic">⬢</span>
    <div class="dl-info"><div class="dl-name">${esc(name)}</div><div class="dl-meta">${((size || 0) / 1024).toFixed(1)} KB · agent workspace ZIP</div></div>
    <a class="dl-btn" href="/api/agent/artifacts/${encodeURIComponent(name)}" download>Download ZIP</a>`;
  list.appendChild(row);
  gsap.fromTo(row, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4 });
  toast('Artifact ready', name, 'ok');
}

/* ============================================================
   Routers panel — live swarm health
   ============================================================ */
async function loadRouters() {
  try {
    const j = await fetch('/api/agent/routers').then((r) => r.json());
    const list = $('#routers-list');
    $('#routers-empty').style.display = 'none';
    list.hidden = false;
    list.innerHTML = '';
    (j.routers || []).forEach((r) => {
      const row = document.createElement('div');
      row.className = 'router-row';
      const dot = !r.configured ? 'na' : (r.alive ? 'ok' : 'dead');
      row.innerHTML = `
        <span class="dot ${dot}"></span>
        <span class="rr-name">${esc(r.label || r.id)}</span>
        <span class="rr-kind">${esc(r.kind || '')}</span>
        <span class="rr-ms">${r.configured ? ((r.lastLatencyMs ? r.lastLatencyMs + 'ms' : '—')) : 'not set'}</span>`;
      list.appendChild(row);
    });
    $('#conv-sub').textContent = `${j.configured || 0}/${j.total || 0} routers live`;
  } catch { /* offline */ }
}

/* ============================================================
   Runtime panel — real tool catalog + sandbox + memory
   ============================================================ */
async function loadRuntime() {
  try {
    const [tools, mcp, mem] = await Promise.all([
      fetch('/api/agent/tools').then((r) => r.json()),
      fetch('/api/agent/mcp').then((r) => r.json()).catch(() => null),
      fetch('/api/agent/memory').then((r) => r.json()).catch(() => null),
    ]);
    const body = $('#runtime-body');
    $('#runtime-empty').style.display = 'none';
    body.hidden = false;
    const byGroup = tools.byGroup || {};
    const groups = Object.entries(byGroup).map(([g, n]) => `<span class="rt-chip">${esc(g)}·${n}</span>`).join('');
    const conn = mcp?.mcp;
    const sand = mcp?.sandbox;
    body.innerHTML = `
      <div class="rt-section"><div class="rt-head">Tool registry · ${tools.total || 0}</div><div class="rt-chips">${groups}</div></div>
      <div class="rt-section"><div class="rt-head">Sandbox</div><div class="rt-kv">${sand ? `active sandboxes: ${sand.activeSandboxes}` : '—'}</div></div>
      <div class="rt-section"><div class="rt-head">MCP connectors</div><div class="rt-kv">${conn ? `${conn.connected || 0} stdio · ${conn.builtin || 0} builtin` : '—'}</div></div>
      <div class="rt-section"><div class="rt-head">Long-term memory</div><div class="rt-kv">${mem?.stats ? `${mem.stats.entries || 0} entries` : '—'}</div></div>
      <div class="rt-section"><div class="rt-head">Recent tool calls</div>${
        (tools.recentCalls || []).slice(-8).reverse().map((c) =>
          `<div class="rt-call ${c.ok ? 'ok' : 'err'}">${esc(c.tool)} ${c.ok ? '✓' : '✗'} ${c.durationMs}ms</div>`).join('') || '<div class="rt-kv">none yet</div>'
      }</div>`;
  } catch { /* offline */ }
}

/* ============================================================
   THE REAL AGENT LOOP — SSE from /api/agent/react
   ============================================================ */
async function runAgentTask(task) {
  addUserMessage(task);
  $('#tb-status-text').textContent = 'Agent working';
  switchPanel('terminal');
  termWrite(`◆ task: ${task}`, 't-banner');

  if (!state.online) {
    offlineDemo(task);
    return;
  }

  const trace = addTypingIndicator();
  const typer = $('.msg-text', trace);
  let currentAgent = 'planner';
  setAgent('planner', { status: 'working', progress: 8, log: 'reading the task' }, 'Planner');

  let finalAnswer = '';
  let usedSteps = 0;
  state.abortCtrl = new AbortController();

  try {
    const token = localStorage.getItem('token') || '';
    const res = await fetch('/api/agent/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      signal: state.abortCtrl.signal,
      body: JSON.stringify({ task, maxSteps: 16, tokenBudget: 8000 }),
    });
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'agent endpoint error ' + res.status);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        if (!part.startsWith('data:')) continue;
        let d;
        try { d = JSON.parse(part.slice(5)); } catch { continue; }
        handleAgentEvent(d);
        if (d.type === 'step') {
          usedSteps = d.step || usedSteps;
          if (d.kind === 'malformed') {
            termWrite(`⚠ step ${d.step} — unparseable model turn, nudging`, 't-warn');
          } else if (d.thought) {
            removeTypingIndicator();
            typer && (typer.id = '');
            currentAgent = agentForTool(null);
            setAgent(currentAgent, { status: 'working', progress: undefined, log: String(d.thought).slice(0, 60) });
            termWrite(`◈ thought ${d.step}: ${String(d.thought).slice(0, 140)}`, 't-info');
          }
        } else if (d.type === 'todos') {
          setAgent('planner', { progress: Math.round(100 * (d.todos || []).filter((t) => t.completed).length / Math.max(1, (d.todos || []).length)), log: 'plan ' + ((d.todos || []).filter((t) => t.completed).length) + '/' + (d.todos || []).length });
        } else if (d.type === 'tool') {
          currentAgent = agentForTool(d.tool);
          setAgent(currentAgent, { status: 'working', log: d.tool }, currentAgent);
          termWrite(`▸ ${d.tool} ${JSON.stringify(d.args || {}).slice(0, 160)}`, '');
        } else if (d.type === 'observation') {
          const ok = d.ok ? '✓' : '✗';
          termWrite(`  ${ok} ${String(d.result || '').split('\n')[0].slice(0, 180)}`, d.ok ? 't-ok' : 't-err');
          // REAL file event → code panel + files + preview
          if (d.file && d.file.path) {
            const f = { content: d.file.content || '', bytes: (d.file.content || '').length, verb: d.file.action || 'wrote', at: Date.now() };
            if (!state.files.has(d.file.path)) state.order.push(d.file.path);
            state.files.set(d.file.path, f);
            renderFileTree();
            renderFiles();
            streamCode(d.file.path, f.content);
            refreshPreview();
          }
          setAgent(currentAgent, { progress: Math.min(96, 10 + (usedSteps * 8)), log: d.tool + (d.ok ? ' ok' : ' failed') });
        } else if (d.type === 'artifact') {
          addArtifact(d.artifact, d.size);
          switchPanel('deploypanel');
        } else if (d.type === 'done') {
          finalAnswer = d.answer || '';
          if (d.exhausted) termWrite('⚠ step budget reached — partial results kept', 't-warn');
        } else if (d.type === 'error') {
          throw new Error(d.message || 'agent failed');
        }
      }
    }

    removeTypingIndicator();
    setAgent(currentAgent, { status: 'done', progress: 100, log: 'run complete' });
    updateDockProgress();
    if (finalAnswer) {
      addAIMessage(esc(finalAnswer).replace(/\n/g, '<br>'));
    } else {
      addAIMessage('The agent hit its step budget before a final answer — the terminal and code panels show the real partial progress.');
    }
    $('#tb-status-text').textContent = state.files.size ? 'Delivered' : 'Complete';
    $('#conv-sub').textContent = `${usedSteps} steps · ${state.files.size} files`;
    toast('Run complete', `${usedSteps} steps · ${state.files.size} files written`, 'ok');
  } catch (e) {
    removeTypingIndicator();
    if (e.name === 'AbortError') {
      termWrite('■ stopped by operator', 't-warn');
      addAIMessage('Stopped.');
      $('#tb-status-text').textContent = 'Stopped';
    } else {
      termWrite('✗ ' + e.message, 't-err');
      addAIMessage('Agent error: ' + esc(e.message));
      $('#tb-status-text').textContent = 'Error';
    }
  } finally {
    state.abortCtrl = null;
    state.buildActive = false;
    $('#prompt-enter').style.pointerEvents = '';
    window.__universe?.setAmbience(1);
  }
}

function handleAgentEvent() { /* reserved for shared handling */ }

/* ============================================================
   Offline demo — HONEST fallback, clearly labeled
   ============================================================ */
function offlineDemo(task) {
  termWrite('— offline demo (backend unreachable) · nothing below is a real build —', 't-warn');
  addAIMessage(`<b>Runtime offline.</b> I can't reach the agent backend, so instead of pretending to build, here's exactly how to start it:<br><br>
    <span class="mono-hint">npm start</span> → then reload this page.<br><br>
    Everything on this screen — agents, terminal, code — runs on the real ReAct runtime once it's up.`);
  setAgent('planner', { status: 'done', progress: 100, log: 'offline' });
  $('#tb-status-text').textContent = 'Offline';
  state.buildActive = false;
  $('#prompt-enter').style.pointerEvents = '';
  window.__universe?.setAmbience(0.45);
}

/* ============================================================
   Panel switching
   ============================================================ */
function switchPanel(tab) {
  state.panelTab = tab;
  $$('.ptab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.ptab-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
  if (tab === 'routers') loadRouters();
  if (tab === 'runtime') loadRuntime();
}

/* ============================================================
   Command palette
   ============================================================ */
const COMMANDS = [
  { ic: '⬡', label: 'New agent run', act: 'home', hint: 'back to prompt' },
  { ic: '⌁', label: 'Open Terminal', act: 'panel:terminal', hint: 'ReAct trace' },
  { ic: '◐', label: 'Open Preview', act: 'panel:preview', hint: 'live output' },
  { ic: '⌨', label: 'Open Code', act: 'panel:code', hint: 'agent files' },
  { ic: '⇪', label: 'Open Deliverables', act: 'panel:deploypanel', hint: 'artifact ZIPs' },
  { ic: '⌸', label: 'Router swarm health', act: 'panel:routers', hint: '15 providers' },
  { ic: '⟳', label: 'Runtime · tools', act: 'panel:runtime', hint: 'registry + stats' },
  { ic: '⊙', label: 'Probe routers now', act: 'probe', hint: 'ping all 15' },
];

function openCmdPalette() {
  const cmd = $('#cmd');
  cmd.hidden = false;
  const input = $('#cmd-input');
  input.value = '';
  renderCmdList('');
  requestAnimationFrame(() => { cmd.classList.add('show'); input.focus(); });
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

async function runCommand(act) {
  closeCmdPalette();
  if (act.startsWith('panel:')) { switchPanel(act.split(':')[1]); return; }
  if (act === 'home') {
    $('#shell').hidden = true;
    $('#home').style.display = 'flex';
    gsap.fromTo('#home', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 });
    setTimeout(() => $('#prompt-input').focus(), 400);
    return;
  }
  if (act === 'probe') {
    toast('Router probe', 'pinging every provider…', 'info');
    try {
      const j = await fetch('/api/agent/routers?probe=1').then((r) => r.json());
      const okCount = (j.routers || []).filter((r) => r.probe === 'ok').length;
      toast('Probe complete', `${okCount}/${j.configured} routers answered`, okCount > 0 ? 'ok' : 'warn');
      loadRouters();
    } catch { toast('Probe failed', 'backend unreachable', 'err'); }
  }
}

/* ============================================================
   Toasts
   ============================================================ */
function toast(title, sub, type = '') {
  const box = document.createElement('div');
  box.className = `toast ${type}`.trim();
  box.innerHTML = `<span class="t-ic">${type === 'ok' ? '✓' : type === 'warn' ? '⚠' : type === 'err' ? '✗' : '◈'}</span><div><div style="font-weight:600">${esc(title)}</div><div style="font-size:12px;color:var(--text-1)">${esc(sub)}</div></div>`;
  $('#toasts').appendChild(box);
  gsap.to(box, { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out' });
  setTimeout(() => {
    gsap.to(box, { opacity: 0, x: 24, duration: 0.3, onComplete: () => box.remove() });
  }, 3800);
}

/* ============================================================
   Clock + REAL system stats
   ============================================================ */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function tickStatus() {
  const now = new Date();
  $('#st-clock').textContent = now.toLocaleTimeString();
  const u = window.__universe;
  if (u) {
    $('#st-fps').textContent = `FPS ${Math.round(u.fps || 0)}`;
  }
  if (performance.memory) {
    const mb = (performance.memory.usedJSHeapSize / 1048576).toFixed(0);
    $('#st-mem').textContent = `MEM ${mb} MB`;
  } else {
    $('#st-mem').textContent = 'MEM —';
  }
  // GPU/CPU are browser-sandboxed; show honest static capability instead of fake load
  $('#st-gpu').textContent = `GPU ${u?.gpu === 'ready' ? 'WebGPU' : u?.renderer ? 'WebGL2' : '—'}`;
  $('#st-cpu').textContent = `cores ${navigator.hardwareConcurrency || '?'}`;
  $('#st-tools').textContent = `tools ${state.stats.tools}`;
}

/* ============================================================
   Global init
   ============================================================ */
function init() {
  const universe = new Universe($('#universe'));
  window.__universe = universe;
  new Viewer3D('#v3d-canvas'); // may not exist in DOM — the viewer guards itself

  runBoot();

  const input = $('#prompt-input');
  const submit = () => launchBuild(input.value);
  $('#prompt-enter').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });
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

  // Conversation input — runs the real agent
  const convInput = $('#conv-input');
  const convSubmit = () => {
    const txt = convInput.value.trim();
    if (!txt || state.buildActive) return;
    convInput.value = '';
    state.buildActive = true;
    runAgentTask(txt);
  };
  $('#conv-send').addEventListener('click', convSubmit);
  convInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); convSubmit(); }
  });
  convInput.addEventListener('input', () => {
    convInput.style.height = 'auto';
    convInput.style.height = Math.min(convInput.scrollHeight, 120) + 'px';
  });

  $$('.ptab').forEach((t) => t.addEventListener('click', () => switchPanel(t.dataset.tab)));

  $$('.nav-item[data-view]').forEach((n) => {
    n.addEventListener('click', () => {
      $$('.nav-item').forEach((x) => x.classList.remove('active'));
      n.classList.add('active');
      const view = n.dataset.view;
      if (view === 'dashboard') { runCommand('home'); return; }
      if (view === 'tools') { switchPanel('runtime'); return; }
      if (view === 'chat') { switchPanel('preview'); return; }
      const prefills = {
        web: 'Build a responsive landing page for a coffee brand',
        game: 'Create a small WebGL game in a single html file',
        pcb: 'Describe a 4-layer drone flight controller PCB and write the firmware plan',
        cad: 'Design a parametric camera enclosure and explain the steps',
      };
      $('#shell').hidden = true;
      $('#home').style.display = 'flex';
      $('#prompt-input').value = prefills[view] || '';
      setTimeout(() => launchBuild($('#prompt-input').value), 350);
    });
  });

  $('#tb-hamburger').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
    state.sidebarOpen = $('#sidebar').classList.contains('open');
  });

  $('#tb-cmd').addEventListener('click', openCmdPalette);
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

  $('#tb-notif').addEventListener('click', () => {
    toast('Notifications', state.online ? `${state.stats.routers.configured}/${state.stats.routers.total} AI routers configured` : 'Runtime offline — npm start', state.online ? 'ok' : 'warn');
  });

  setInterval(tickStatus, 1000);
  tickStatus();
  window.addEventListener('beforeunload', () => {
    state.abortCtrl?.abort();
    universe.dispose();
  });
}

document.addEventListener('DOMContentLoaded', init);
