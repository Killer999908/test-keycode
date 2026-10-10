'use strict';
// Jest + Supertest tests for theKeyCode API server:
//   /api/health, forged-JWT rejection, payment create/confirm,
//   and the Stripe webhook (dev trust-mode path).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const agent = require('../lib/agent-core');

const { app } = require('../server');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PAYMENTS_FILE = path.join(DATA_DIR, 'mock-payments.json');
const backup = fs.existsSync(PAYMENTS_FILE) ? fs.readFileSync(PAYMENTS_FILE, 'utf8') : null;
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
  if (backup === null) fs.rmSync(PAYMENTS_FILE, { force: true });
  else fs.writeFileSync(PAYMENTS_FILE, backup);
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
});
