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
const { Readable } = require('stream');

module.exports = function AgentRoutes(opts) {
  const { app, requireAuth, now } = opts;

  // running-task registry (SSE)
  const running = new Set();

  app.get('/api/agent/tools', function (req, res) {
    res.json({ success: true, tools: tools.manifest() });
  });

  app.get('/api/agent/sessions', requireAuth, function (req, res) {
    res.json({ success: true, sessions: agent.listSessions() });
  });

  app.get('/api/agent/sessions/:id', requireAuth, function (req, res) {
    const s = agent.getSession(req.params.id);
    if (!s) return res.status(404).json({ success: false, error: 'session not found' });
    res.json({ success: true, session: s });
  });

  app.get('/api/agent/memory', requireAuth, function (req, res) {
    const m = agent.loadMemory();
    res.json({ success: true, facts: m.facts, skills: m.skills });
  });

  app.post('/api/agent/memory/fact', requireAuth, function (req, res) {
    const text = String((req.body || {}).text || '').trim();
    if (!text) return res.status(400).json({ success: false, error: 'text required' });
    res.json({ success: true, stored: agent.rememberFact(text) });
  });

  app.post('/api/agent/skills', requireAuth, function (req, res) {
    const b = req.body || {};
    if (!b.name || !b.prompt) return res.status(400).json({ success: false, error: 'name and prompt required' });
    const skill = agent.learnSkill(b.name, b.prompt, b.notes);
    res.status(201).json({ success: true, skill: skill });
  });

  // blocking run
  app.post('/api/agent/run', requireAuth, async function (req, res) {
    const b = req.body || {};
    const goal = String(b.goal || '').trim();
    if (!goal) return res.status(400).json({ success: false, error: 'goal required' });
    if (running.size >= 3) return res.status(429).json({ success: false, error: 'too many concurrent agent runs' });
    running.add(req);
    try {
      const session = await agent.runTask({
        goal: goal,
        userId: req.user && req.user.userId,
        maxSteps: b.maxSteps,
        allowedTools: Array.isArray(b.allowedTools) ? b.allowedTools : undefined,
      }, function () { });
      res.json({ success: session.status === 'done', session: session });
    } catch (e) {
      res.status(500).json({ success: false, error: String(e && e.message || e) });
    } finally { running.delete(req); }
  });

  // SSE live run — token in query for EventSource
  app.get('/api/agent/stream', async function (req, res) {
    const token = String(req.query.token || '').replace(/^Bearer\s+/i, '');
    let ok = false;
    try { ok = !!require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'dev-secret'); } catch (_) { }
    if (!ok) return res.status(401).json({ success: false, error: 'invalid token' });
    const goal = String(req.query.goal || '').trim();
    if (!goal) return res.status(400).json({ success: false, error: 'goal required' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (_) { } };
    send({ type: 'start', goal: goal });
    running.add(req);
    try {
      const session = await agent.runTask({
        goal: goal,
        userId: req.user && req.user.userId,
        maxSteps: Number(req.query.maxSteps) || undefined,
      }, function (evt) { send(evt); });
      send({ type: 'result', sessionId: session.id, status: session.status, final: session.final });
    } catch (e) {
      send({ type: 'error', error: String(e && e.message || e) });
    } finally {
      running.delete(req);
      try { res.end(); } catch (_) { }
    }
  });

  // legacy CLI ingest
  app.post('/api/agent/react', requireAuth, function (req, res) {
    res.json({ success: true, received: true });
  });
};
