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

const { app } = require('../server');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PAYMENTS_FILE = path.join(DATA_DIR, 'mock-payments.json');
const backup = fs.existsSync(PAYMENTS_FILE) ? fs.readFileSync(PAYMENTS_FILE, 'utf8') : null;

afterAll(() => {
  if (backup === null) fs.rmSync(PAYMENTS_FILE, { force: true });
  else fs.writeFileSync(PAYMENTS_FILE, backup);
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
