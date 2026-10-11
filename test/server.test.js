'use strict';
// Jest + Supertest tests for theKeyCode API server:
//   /api/health, forged-JWT rejection, payment create/confirm,
//   and the Stripe webhook (dev trust-mode path).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret';
process.env.AI_PROVIDER = 'disabled';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STRIPE_SECRET_KEY = '';
process.env.STRIPE_WEBHOOK_SECRET = '';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const agent = require('../lib/agent-core');

const { app } = require('../server');

const DATA_DIR = path.join(__dirname, '..', 'data');
const staticDataTestFile = path.join(DATA_DIR, 'static-private-test-' + Date.now() + '.json');
const staticDataTestBackup = fs.existsSync(staticDataTestFile) ? fs.readFileSync(staticDataTestFile, 'utf8') : null;
const PAYMENTS_FILE = path.join(DATA_DIR, 'mock-payments.json');
const backup = fs.existsSync(PAYMENTS_FILE) ? fs.readFileSync(PAYMENTS_FILE, 'utf8') : null;
const monetizationFile = path.join(DATA_DIR, 'monetization.json');
const monetizationBackup = fs.existsSync(monetizationFile) ? fs.readFileSync(monetizationFile, 'utf8') : null;
const revenueFile = path.join(DATA_DIR, 'monetization-revenue.json');
const revenueBackup = fs.existsSync(revenueFile) ? fs.readFileSync(revenueFile, 'utf8') : null;
const adminToken = jwt.sign({ userId: 'monetization-admin-test', role: 'admin' }, process.env.JWT_SECRET);
const agentTestId = 'agent-test-' + Date.now();
const agentUserA = agentTestId + '-a';
const agentUserB = agentTestId + '-b';
const workspaceId = 'persist-' + Date.now();
const sessionFile = path.join(DATA_DIR, 'agent-sessions.json');
const sessionBackup = fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, 'utf8') : null;
const memoryFiles = [agentUserA, agentUserB].map(function (id) {
  return path.join(DATA_DIR, 'agent-memories', crypto.createHash('sha256').update(id).digest('hex') + '.json');
});
const memoryBackups = memoryFiles.map(function (file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null; });

afterAll(() => {
  if (staticDataTestBackup === null) fs.rmSync(staticDataTestFile, { force: true });
  else fs.writeFileSync(staticDataTestFile, staticDataTestBackup);
  if (backup === null) fs.rmSync(PAYMENTS_FILE, { force: true });
  else fs.writeFileSync(PAYMENTS_FILE, backup);
  if (monetizationBackup === null) fs.rmSync(monetizationFile, { force: true });
  else fs.writeFileSync(monetizationFile, monetizationBackup);
  if (revenueBackup === null) fs.rmSync(revenueFile, { force: true });
  else fs.writeFileSync(revenueFile, revenueBackup);
  if (sessionBackup === null) fs.rmSync(sessionFile, { force: true });
  else fs.writeFileSync(sessionFile, sessionBackup);
  memoryFiles.forEach(function (file, i) {
    if (memoryBackups[i] === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, memoryBackups[i]);
  });
  [agentUserA, agentUserB].forEach(function (id) {
    const ownerDir = path.join(DATA_DIR, 'agent-workspaces', crypto.createHash('sha256').update(id).digest('hex'));
    fs.rmSync(ownerDir, { recursive: true, force: true });
  });
});

describe('GET /api/health', () => {
  test('responds ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('server middleware errors', () => {
  test('returns a JSON client error for disallowed CORS origins', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://not-allowed.example');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('CORS blocked');
  });

  test('returns a JSON client error for malformed request JSON', async () => {
    const res = await request(app)
      .post('/api/payment/create-intent')
      .set('Content-Type', 'application/json')
      .send('{"amount":');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe('KEYCODE CLI installation', () => {
  test('shows platform downloads and account setup on the homepage', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="cli-install"');
    expect(res.text).toContain('href="/install.sh"');
    expect(res.text).toContain('href="/install.ps1"');
    expect(res.text).toContain('keycode login');
    expect(res.text).toContain('api-keys.html');
  });

  test('serves origin-configured installers without trusting forwarded host headers', async () => {
    const unix = await request(app).get('/install.sh')
      .set('X-Forwarded-Host', 'attacker.example;touch /tmp/not-safe')
      .set('X-Forwarded-Proto', 'https');
    const windows = await request(app).get('/install.ps1');

    expect(unix.status).toBe(200);
    expect(unix.text).toContain('/api/cli/download');
    expect(unix.text).not.toContain('__KEYCODE_URL__');
    expect(unix.text).not.toContain('attacker.example');
    expect(windows.status).toBe(200);
    expect(windows.text).toContain('/api/cli/download');
    expect(windows.text).not.toContain('__KEYCODE_URL__');
  });

  test('downloads the functional HTTPS-capable CLI source', async () => {
    const res = await request(app).get('/api/cli/download');
    expect(res.status).toBe(200);
    expect(res.text).toContain("require('https')");
    expect(res.text).toContain("keycode login");
  });
});

describe('Public website quality', () => {
  test('keeps public SEO indexing enabled with a usable sitemap', async () => {
    const [robots, sitemap, home] = await Promise.all([
      request(app).get('/robots.txt'),
      request(app).get('/sitemap.xml'),
      request(app).get('/'),
    ]);
    expect(robots.status).toBe(200);
    expect(robots.text).toContain('Allow: /');
    expect(robots.text).toContain('Disallow: /api/');
    expect(robots.text).toContain('Sitemap: https://keycode.studio/sitemap.xml');
    expect(robots.text.split(/\r?\n/)).not.toContain('Disallow: /');
    expect(sitemap.status).toBe(200);
    expect(sitemap.text).toContain('<loc>https://keycode.studio/</loc>');
    expect(sitemap.text).toContain('https://keycode.studio/ai-builder.html');
    expect(sitemap.text).not.toContain('/dashboard.html');
    const publicPaths = Array.from(sitemap.text.matchAll(/<loc>https:\/\/keycode\.studio([^<]*)<\/loc>/g), match => match[1]);
    for (const page of publicPaths) expect((await request(app).get(page)).status).toBe(200);
    expect(robots.text).toContain('Disallow: /data/');
    expect(home.text).toContain('<link rel="canonical" href="https://keycode.studio/">');
    expect(home.text).toContain('<meta property="og:image" content="https://keycode.studio/og-image.png">');
    expect(home.text).toContain('<main class="snap-container" id="main">');
    expect(home.text).toContain("savedChoice === 'granted'");
  });

  test('uses truthful platform details instead of invented client results or metrics', async () => {
    const home = await request(app).get('/');
    expect(home.status).toBe(200);
    expect(home.text).toContain('A workspace you can inspect');
    expect(home.text).toContain('Delivery time depends on your project scope.');
    expect(home.text).not.toContain('Maya Krishnan');
    expect(home.text).not.toContain('99.9');
    expect(home.text).not.toContain('34%');
  });

  test('does not publish account and admin screens to search indexes', async () => {
    for (const page of ['/login.html', '/dashboard.html', '/api-keys.html', '/admin-panel.html']) {
      const response = await request(app).get(page);
      expect(response.status).toBe(200);
      expect(response.text).toContain('<meta name="robots" content="noindex, nofollow">');
    }
  });

  test('never serves private JSON files from the application data directory', async () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(staticDataTestFile, JSON.stringify({ private: true }));
    const response = await request(app).get('/data/' + path.basename(staticDataTestFile));
    expect(response.status).toBe(404);
    expect(response.text).not.toContain('"private":true');
  });

  test('game page social preview metadata is valid and canonical', async () => {
    const response = await request(app).get('/game.html');
    expect(response.status).toBe(200);
    expect(response.text).toContain('content="https://keycode.studio/game.html"');
    expect(response.text).not.toContain('<meta property="og:description" content="KEYCODE Studio - AI Game Engine <title>');
  });

  test('status page reports only measured health and configuration, not fabricated uptime', async () => {
    const response = await request(app).get('/status.html');
    expect(response.status).toBe(200);
    expect(response.text).toContain('API is responding');
    expect(response.text).toContain('inference not live-tested');
    expect(response.text).toContain('does not yet collect incident history');
    expect(response.text).not.toContain('99.5%');
    expect(response.text).not.toContain('All Systems Operational');
    expect(response.text).not.toContain('Subscribe to Updates');
    expect(response.text).not.toContain('2 days ago');
  });
});

describe('Ad monetization configuration', () => {
  test('shows no ads until an approved AdSense placement is configured', async () => {
    if (monetizationBackup === null) fs.rmSync(monetizationFile, { force: true });
    else fs.writeFileSync(monetizationFile, monetizationBackup);
    const response = await request(app).get('/api/monetization/config');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      enabled: false,
      network: 'none',
      publisherId: '',
      placements: { header: '', footer: '', inFeed: '' },
    });
  });

  test('lets admins configure validated AdSense placements and rejects non-admin changes', async () => {
    const denied = await request(app).put('/api/admin/monetization').send({ enabled: true });
    expect(denied.status).toBe(401);

    const invalid = await request(app).put('/api/admin/monetization')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ enabled: true, ads: { enabled: true, network: 'adsense', networkClientId: '<script>' } });
    expect(invalid.status).toBe(400);

    const saved = await request(app).put('/api/admin/monetization')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        enabled: true,
        ads: {
          enabled: true,
          network: 'adsense',
          networkClientId: 'ca-pub-1234567890123456',
          headerEnabled: true,
          headerSlotId: '1234567890',
          inFeedEnabled: true,
          inFeedSlotId: '9876543210',
        },
      });
    expect(saved.status).toBe(200);
    expect(saved.body.success).toBe(true);

    const config = await request(app).get('/api/monetization/config');
    expect(config.status).toBe(200);
    expect(config.body).toEqual({
      enabled: true,
      network: 'adsense',
      publisherId: 'ca-pub-1234567890123456',
      placements: { header: '1234567890', footer: '', inFeed: '9876543210' },
    });
  });

  test('homepage has optional ad placements and loads ads only from public configuration', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('id="ad-placement-header"');
    expect(response.text).toContain('id="ad-placement-inFeed"');
    expect(response.text).toContain('id="ad-placement-footer"');
    expect(response.text).toContain('/api/monetization/config');
    expect(response.text).toContain('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js');
  });
});

describe('auth', () => {
  test('rejects forged (unsigned) JWTs', async () => {
    // Craft a token with a valid-looking payload but no signature.
    const payload = Buffer.from(JSON.stringify({ userId: 'hacker', role: 'admin' })).toString('base64url');
    const forged = `eyJhbGciOiJIUzI1NiJ9.${payload}.invalid-signature`;
    const res = await request(app).get('/api/payment/list').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  test('accepts a properly signed JWT', async () => {
    const token = jwt.sign({ userId: 'user-1', email: 'a@b.c', role: 'user' }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/payment/list').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.payments).toEqual(expect.any(Array));
  });

  test('accepts session via kc_token cookie', async () => {
    const token = jwt.sign({ userId: 'user-1', email: 'a@b.c', role: 'user' }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/payment/list').set('Cookie', `kc_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.payments).toEqual(expect.any(Array));
  });
});

describe('payments', () => {
  let token;

  beforeAll(() => {
    token = jwt.sign({ userId: 'user-1', email: 'a@b.c', role: 'user' }, process.env.JWT_SECRET);
  });

  test('create-intent rejects non-positive amounts', async () => {
    const res = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 0, method: 'bank' });
    expect(res.status).toBe(400);
  });

  test('bank create-intent then confirm completes the payment', async () => {
    const create = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 42.5, method: 'bank', orderId: 'order-test-1' });
    expect(create.status).toBe(200);
    expect(create.body.gateway).toBe('bank');
    expect(create.body.payment.status).toBe('pending');

    const confirm = await request(app)
      .post('/api/payment/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: 'order-test-1', gateway: 'bank' });
    expect(confirm.status).toBe(200);
    expect(confirm.body.success).toBe(true);
    expect(confirm.body.payment.status).toBe('completed');
  });
});

describe('webhooks', () => {
  test('rejects payload without event type', async () => {
    const res = await request(app).post('/api/webhooks/stripe').send({ foo: 'bar' });
    expect(res.status).toBe(400);
  });

  test('handles payment_intent.succeeded in trust mode (no secret configured)', async () => {
    const tx = 'pi_test_' + Date.now();
    // Seed a pending payment directly.
    const store = require('../data/mockStore');
    await store.write(PAYMENTS_FILE, [{
      id: 'seed-1', user_id: 'user-1', order_id: 'order-wh-1',
      amount: 10, currency: 'usd', provider: 'stripe', status: 'pending',
      provider_tx_id: tx, metadata: {}, created_at: new Date().toISOString(),
    }]);

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .send({ type: 'payment_intent.succeeded', data: { object: { id: tx, amount: 1000 } } });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    await new Promise(r => setTimeout(r, 50)); // allow async write queue to drain
    const payments = store.loadPayments();
    const hit = payments.find(p => p.provider_tx_id === tx);
    expect(hit).toBeDefined();
    expect(hit.status).toBe('completed');
  });
});

describe('agent workspaces and account isolation', () => {
  const tokenA = jwt.sign({ userId: agentUserA, role: 'user' }, process.env.JWT_SECRET);
  const tokenB = jwt.sign({ userId: agentUserB, role: 'user' }, process.env.JWT_SECRET);

  test('keeps workspace artifacts across calls and prevents cross-account downloads', async () => {
    const dir = agent.getWorkspaceDir(agentUserA, workspaceId);
    fs.writeFileSync(path.join(dir, 'result.txt'), 'saved result');

    const files = await request(app).get('/api/agent/workspaces/' + workspaceId + '/files')
      .set('Authorization', 'Bearer ' + tokenA);
    expect(files.status).toBe(200);
    expect(files.body.files).toContainEqual(expect.objectContaining({ path: 'result.txt', bytes: 12, dir: false }));

    const download = await request(app).get('/api/agent/workspaces/' + workspaceId + '/file?path=result.txt')
      .set('Authorization', 'Bearer ' + tokenA);
    expect(download.status).toBe(200);
    expect(download.text).toBe('saved result');

    const crossAccount = await request(app).get('/api/agent/workspaces/' + workspaceId + '/file?path=result.txt')
      .set('Authorization', 'Bearer ' + tokenB);
    expect(crossAccount.status).toBe(404);

    const traversal = await request(app).get('/api/agent/workspaces/' + workspaceId + '/file?path=..%2Fagent-sessions.json')
      .set('Authorization', 'Bearer ' + tokenA);
    expect(traversal.status).toBe(404);
  });

  test('keeps learned facts and skills scoped to the owning account', async () => {
    const fact = 'private agent fact ' + agentTestId;
    const remember = await request(app).post('/api/agent/memory/fact')
      .set('Authorization', 'Bearer ' + tokenA).send({ text: fact });
    expect(remember.status).toBe(200);
    const teach = await request(app).post('/api/agent/skills')
      .set('Authorization', 'Bearer ' + tokenA)
      .send({ name: 'private-' + agentTestId, prompt: 'Return {{input}}' });
    expect(teach.status).toBe(201);

    const ownMemory = await request(app).get('/api/agent/memory').set('Authorization', 'Bearer ' + tokenA);
    const otherMemory = await request(app).get('/api/agent/memory').set('Authorization', 'Bearer ' + tokenB);
    expect(ownMemory.body.facts.some(function (item) { return item.text === fact; })).toBe(true);
    expect(otherMemory.body.facts.some(function (item) { return item.text === fact; })).toBe(false);
    expect(ownMemory.body.skills.some(function (item) { return item.id === teach.body.skill.id; })).toBe(true);
    expect(otherMemory.body.skills.some(function (item) { return item.id === teach.body.skill.id; })).toBe(false);
  });

  test('restricts session reads to their owner and rejects invalid workspace ids', async () => {
    const session = {
      id: 'ags_' + agentTestId,
      userId: agentUserA,
      workspaceId: workspaceId,
      goal: 'test session',
      status: 'done',
      steps: [],
      createdAt: new Date().toISOString(),
    };
    agent.saveSession(session);

    const own = await request(app).get('/api/agent/sessions/' + session.id).set('Authorization', 'Bearer ' + tokenA);
    const other = await request(app).get('/api/agent/sessions/' + session.id).set('Authorization', 'Bearer ' + tokenB);
    expect(own.status).toBe(200);
    expect(other.status).toBe(404);

    const invalid = await request(app).post('/api/agent/run')
      .set('Authorization', 'Bearer ' + tokenA).send({ goal: 'test', workspaceId: '../outside' });
    expect(invalid.status).toBe(400);
  });

  test('rejects symlink artifacts that point outside the workspace', () => {
    const dir = agent.getWorkspaceDir(agentUserA, workspaceId);
    fs.symlinkSync('/etc/passwd', path.join(dir, 'outside-link'));
    expect(() => agent.workspaceFilePath(agentUserA, workspaceId, 'outside-link')).toThrow(/symbolic links/);
    expect(agent.listWorkspaceFiles(agentUserA, workspaceId).some(function (file) { return file.path === 'outside-link'; })).toBe(false);
  });

  test('POST /api/agent/react requires authentication', async () => {
    const runTask = jest.spyOn(agent, 'runTask');
    try {
      const response = await request(app).post('/api/agent/react').send({ task: 'ping' });
      expect(response.status).toBe(401);
      expect(runTask).not.toHaveBeenCalled();
    } finally {
      runTask.mockRestore();
    }
  });

  test('POST /api/agent/react streams start event and artifacts endpoint serves saved file', async () => {
    let runOptions;
    const runTask = jest.spyOn(agent, 'runTask').mockImplementation(async function (opts, onEvent) {
      runOptions = opts;
      onEvent({ type: 'final', text: 'pong' });
      return { id: 'test-session', status: 'done', final: 'pong', steps: [] };
    });
    try {
      const reactRes = await request(app).post('/api/agent/react')
        .set('Authorization', 'Bearer ' + tokenA)
        .send({ task: 'ping', maxSteps: 1, workspaceId: workspaceId, allowedTools: ['js_eval', 'build_website'] });
      expect(reactRes.status).toBe(200);
      expect(reactRes.text).toContain('data: {"type":"start"');
      expect(reactRes.text).toContain('"type":"done"');
      expect(runOptions.allowedTools).toEqual(['build_website']);

      const runRes = await request(app).post('/api/agent/run')
        .set('Authorization', 'Bearer ' + tokenA)
        .send({ goal: 'ping', allowedTools: ['shell', 'fs_read'] });
      expect(runRes.status).toBe(200);
      expect(runOptions.allowedTools).toEqual(['fs_read']);

      // Artifacts route serves files from user default workspace
      const defDir = agent.getWorkspaceDir(agentUserA, 'default');
      fs.writeFileSync(path.join(defDir, 'sample-build.zip'), 'zipbytes');
      const dlZip = await request(app).get('/api/agent/artifacts/sample-build.zip')
        .set('Authorization', 'Bearer ' + tokenA);
      expect({ status: dlZip.status, body: dlZip.text }).toEqual({ status: 200, body: 'zipbytes' });
    } finally {
      runTask.mockRestore();
    }
  });
});

describe('AI Builder website stream', () => {
  const userId = 'builder-test-' + Date.now();
  const token = jwt.sign({ userId: userId, email: 'builder@test.local', role: 'user' }, process.env.JWT_SECRET);

  test('streams generated HTML from the POST endpoint used by the builder', async () => {
    const previousProvider = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = 'disabled';
    try {
      const unauthenticated = await request(app).post('/api/ai/stream-website').send({ description: 'a bakery website' });
      expect(unauthenticated.status).toBe(401);

      const empty = await request(app).post('/api/ai/stream-website')
        .set('Authorization', 'Bearer ' + token).send({ description: ' ' });
      expect(empty.status).toBe(400);

      const response = await request(app).post('/api/ai/stream-website')
        .set('Authorization', 'Bearer ' + token).send({ description: 'a bakery website' });
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.text).toContain('"type":"html"');
      expect(response.text).toContain('"type":"complete"');
      expect(response.text).toContain('<!DOCTYPE html>');
      const completeEvent = response.text.split('\n').find(line => line.startsWith('data: {"type":"complete"'));
      expect(completeEvent).toBeDefined();
      const completedProject = JSON.parse(completeEvent.slice(6)).data;
      expect(completedProject.fileId).toMatch(/^proj_/);
      expect(completedProject.previewUrl).toContain(completedProject.fileId);
    } finally {
      if (previousProvider === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = previousProvider;
    }
  });
});
