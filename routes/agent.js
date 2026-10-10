'use strict';
// ============================================================
//  AUTONOMOUS AGENT ROUTES — routes/agent.js  (/api/agent/*)
//   POST /api/agent/run          { goal, maxSteps?, allowedTools? }  -> session (blocking)
//   GET  /api/agent/stream?goal=...   SSE live run (auth via query token)
//   GET  /api/agent/tools        tool manifest
//   GET  /api/agent/sessions     recent sessions
//   GET  /api/agent/sessions/:id full session transcript
//   GET  /api/agent/memory       agent memory (facts + skills)
//   POST /api/agent/memory/fact  { text } remember a fact
//   POST /api/agent/skills       { name, prompt, notes } teach a skill
//   POST /api/agent/react        reasoning-step ingest (legacy CLI)
// ============================================================
const agent = require('../lib/agent-core');
const tools = require('../lib/agent-tools');
const ai = require('../lib/ai-provider');
const ai_poolStatus = () => ai.poolStatus();

module.exports = function AgentRoutes(opts) {
  const { app, requireAuth, now } = opts;

  // running-task registry + fair per-user queue
  // Instead of rejecting users when busy, runs are queued FIFO with a
  // per-user fair-share slot: pick the next queued run whose owner has
  // the fewest active runs. MAX_CONCURRENT / MAX_PER_USER via env.
  const MAX_CONCURRENT = Math.max(1, parseInt(process.env.AGENT_MAX_CONCURRENT || '6', 10));
  const MAX_PER_USER = Math.max(1, parseInt(process.env.AGENT_MAX_PER_USER || '2', 10));
  const QUEUE_LIMIT = Math.max(10, parseInt(process.env.AGENT_QUEUE_LIMIT || '100', 10));
  const running = new Set(); // requests currently executing
  const waiting = [];        // {req,res,goal,opts}

  function activeCountFor(userId) {
    let n = 0;
    for (const r of running) { if (r.userId === userId) n++; }
    return n;
  }
  function workspaceIsRunning(userId, workspaceId) {
    for (const r of running) {
      if (r.userId === userId && r.workspaceId === workspaceId) return true;
    }
    return false;
  }
  function pumpQueue() {
    while (running.size < MAX_CONCURRENT && waiting.length) {
      // Fair-share users while serializing work that targets the same workspace.
      let best = -1, bestCount = Infinity;
      for (let i = 0; i < waiting.length; i++) {
        const candidate = waiting[i];
        const c = activeCountFor(candidate.userId);
        if (c >= MAX_PER_USER || workspaceIsRunning(candidate.userId, candidate.workspaceId)) continue;
        if (c < bestCount) { bestCount = c; best = i; if (c === 0) break; }
      }
      if (best === -1) break;
      const item = waiting.splice(best, 1)[0];
      startRun(item);
    }
  }
  function startRun(item) {
    running.add(item);
    agent.runTask(item.opts, item.onEvent)
      .then(function (session) { item.onDone(session); })
      .catch(function (e) { item.onError(e); })
      .finally(function () { running.delete(item); pumpQueue(); });
  }

  function enqueue(res, opts, onEvent, onDone, onError, userIdLabel) {
    if (waiting.length >= QUEUE_LIMIT) {
      res.status(429).json({ success: false, error: 'Agent queue is full — try again shortly', queued: false });
      return null;
    }
    const item = { userId: userIdLabel, opts: opts, onEvent: onEvent, onDone: onDone, onError: onError, res: res };
    waiting.push(item);
    res.setHeader('X-Agent-Queued', String(waiting.length));
    pumpQueue();
    return item;
  }

  app.get('/api/agent/tools', function (req, res) {
    res.json({ success: true, tools: tools.manifest() });
  });

  app.get('/api/agent/sessions', requireAuth, function (req, res) {
    res.json({ success: true, sessions: agent.listSessions(req.user.userId) });
  });

  app.get('/api/agent/sessions/:id', requireAuth, function (req, res) {
    const s = agent.getSession(req.params.id, req.user.userId);
    if (!s) return res.status(404).json({ success: false, error: 'session not found' });
    res.json({ success: true, session: s });
  });

  app.get('/api/agent/memory', requireAuth, function (req, res) {
    const m = agent.loadMemory(req.user.userId);
    res.json({ success: true, facts: m.facts, skills: m.skills });
  });

  app.post('/api/agent/memory/fact', requireAuth, function (req, res) {
    const text = String((req.body || {}).text || '').trim();
    if (!text) return res.status(400).json({ success: false, error: 'text required' });
    res.json({ success: true, stored: agent.rememberFact(text, req.user.userId) });
  });

  app.post('/api/agent/skills', requireAuth, function (req, res) {
    const b = req.body || {};
    if (!b.name || !b.prompt) return res.status(400).json({ success: false, error: 'name and prompt required' });
    const skill = agent.learnSkill(b.name, b.prompt, b.notes, req.user.userId);
    res.status(201).json({ success: true, skill: skill });
  });

  app.get('/api/agent/workspaces/:workspaceId/files', requireAuth, function (req, res) {
    if (!agent.isValidWorkspaceId(req.params.workspaceId)) return res.status(400).json({ success: false, error: 'invalid workspaceId' });
    try {
      const files = agent.listWorkspaceFiles(req.user.userId, req.params.workspaceId);
      res.json({ success: true, workspaceId: req.params.workspaceId, files: files });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e && e.message || e) });
    }
  });

  app.get('/api/agent/workspaces/:workspaceId/file', requireAuth, function (req, res) {
    if (!agent.isValidWorkspaceId(req.params.workspaceId)) return res.status(400).json({ success: false, error: 'invalid workspaceId' });
    let file;
    try { file = agent.workspaceFilePath(req.user.userId, req.params.workspaceId, String(req.query.path || '')); }
    catch (e) { return res.status(404).json({ success: false, error: String(e && e.message || e) }); }
    res.download(file, function (e) {
      if (e && !res.headersSent) res.status(e.statusCode === 404 ? 404 : 500).json({ success: false, error: 'could not download artifact' });
    });
  });

  // blocking run — queued fairly, never rejected unless the queue is full
  app.post('/api/agent/run', requireAuth, function (req, res) {
    const b = req.body || {};
    const goal = String(b.goal || '').trim();
    if (!goal) return res.status(400).json({ success: false, error: 'goal required' });
    const workspaceId = b.workspaceId || 'default';
    if (!agent.isValidWorkspaceId(workspaceId)) return res.status(400).json({ success: false, error: 'invalid workspaceId' });
    const uid = req.user && req.user.userId;
    enqueue(res, {
      goal: goal,
      userId: uid,
      workspaceId: workspaceId,
      maxSteps: b.maxSteps,
      allowedTools: Array.isArray(b.allowedTools) ? b.allowedTools : undefined,
    }, function () { },
    function (session) { res.json({ success: session.status === 'done', session: session }); },
    function (e) { try { res.status(500).json({ success: false, error: String(e && e.message || e) }); } catch (_) { } },
    uid);
  });

  // SSE live run — token in query for EventSource
  app.get('/api/agent/stream', async function (req, res) {
    const token = String(req.query.token || '').replace(/^Bearer\s+/i, '');
    let userId;
    try { userId = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'dev-secret').userId; } catch (_) { }
    if (!userId) return res.status(401).json({ success: false, error: 'invalid token' });
    const goal = String(req.query.goal || '').trim();
    if (!goal) return res.status(400).json({ success: false, error: 'goal required' });
    const workspaceId = String(req.query.workspaceId || 'default');
    if (!agent.isValidWorkspaceId(workspaceId)) return res.status(400).json({ success: false, error: 'invalid workspaceId' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (_) { } };
    send({ type: 'start', goal: goal });
    enqueue(res, {
      goal: goal,
      userId: userId,
      workspaceId: workspaceId,
      maxSteps: Number(req.query.maxSteps) || undefined,
    },
    function (evt) { send(evt); },
    function (session) {
      send({ type: 'result', sessionId: session.id, status: session.status, final: session.final });
      try { res.end(); } catch (_) { }
    },
    function (e) {
      send({ type: 'error', error: String(e && e.message || e) });
      try { res.end(); } catch (_) { }
    },
    userId);
  });

  app.get('/api/agent/status', function (req, res) {
    res.json({
      success: true,
      running: running.size,
      waiting: waiting.length,
      maxConcurrent: MAX_CONCURRENT,
      maxPerUser: MAX_PER_USER,
      queueLimit: QUEUE_LIMIT,
      llmPool: ai_poolStatus(),
    });
  });

  // SSE streaming endpoint for AI builder and interactive agent clients
  app.post('/api/agent/react', function (req, res) {
    const b = req.body || {};
    const goal = String(b.task || b.goal || '').trim();
    if (!goal) return res.status(400).json({ success: false, error: 'task or goal required' });

    let userId = (req.user && req.user.userId) || null;
    if (!userId) {
      const auth = req.headers.authorization || '';
      const token = auth.replace(/^Bearer\s+/i, '') || (req.cookies && req.cookies.kc_token);
      if (token) {
        try { userId = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'dev-secret').userId; } catch (_) { }
      }
    }
    if (!userId) userId = 'guest_' + Date.now().toString(36);

    const workspaceId = String(b.workspaceId || 'default');
    if (!agent.isValidWorkspaceId(workspaceId)) return res.status(400).json({ success: false, error: 'invalid workspaceId' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (_) { } };

    const manifest = tools.manifest();
    const maxSteps = Number(b.maxSteps) || 14;
    send({ type: 'start', tools: manifest.length, maxSteps: maxSteps, goal: goal });

    let finalAnswer = '';
    enqueue(res, {
      goal: goal,
      userId: userId,
      workspaceId: workspaceId,
      maxSteps: maxSteps,
      allowedTools: Array.isArray(b.allowedTools) ? b.allowedTools : undefined,
    },
    function (evt) {
      if (evt.type === 'plan' && Array.isArray(evt.plan)) {
        send({ type: 'todos', todos: evt.plan.map(p => ({ task: typeof p === 'string' ? p : (p.task || String(p)), completed: false })) });
      } else if (evt.type === 'step' && evt.step) {
        const s = evt.step;
        if (s.kind === 'malformed') {
          send({ type: 'step', step: s.step, kind: 'malformed' });
        } else if (s.thought) {
          send({ type: 'step', step: s.step, thought: s.thought });
        }
        if (s.tool) {
          send({ type: 'tool', step: s.step, tool: s.tool, args: s.args || {} });
        }
        if (s.result !== undefined) {
          send({ type: 'observation', step: s.step, tool: s.tool, ok: Boolean(s.ok), result: s.result });
        }
      } else if (evt.type === 'final') {
        finalAnswer = evt.text || '';
      }
    },
    function (session) {
      // Check for any zip or generated artifacts in the workspace
      try {
        const wsFiles = agent.listWorkspaceFiles(userId, workspaceId);
        const zips = wsFiles.filter(f => f.path && f.path.endsWith('.zip'));
        if (zips.length) {
          send({ type: 'artifact', artifact: zips[zips.length - 1].path });
        }
      } catch (_) { }

      send({
        type: 'done',
        sessionId: session.id,
        answer: session.final || finalAnswer,
        status: session.status,
        exhausted: session.status !== 'done'
      });
      try { res.end(); } catch (_) { }
    },
    function (e) {
      send({ type: 'error', message: String(e && e.message || e) });
      try { res.end(); } catch (_) { }
    },
    userId);
  });

  // Direct artifact download for agent builds
  app.get('/api/agent/artifacts/:filename', function (req, res) {
    const filename = path.basename(req.params.filename);
    let userId = (req.user && req.user.userId) || null;
    if (!userId) {
      const auth = req.headers.authorization || '';
      const token = auth.replace(/^Bearer\s+/i, '') || (req.cookies && req.cookies.kc_token);
      if (token) {
        try { userId = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'dev-secret').userId; } catch (_) { }
      }
    }

    // Try user workspace first, then default workspace, then public artifacts
    const candidates = [];
    if (userId) {
      try { candidates.push(agent.workspaceFilePath(userId, 'default', filename)); } catch (_) { }
    }
    const fs = require('fs');
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return res.download(c, filename);
      }
    }
    res.status(404).json({ success: false, error: 'artifact not found' });
  });
};
