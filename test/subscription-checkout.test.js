'use strict';
// Plan checkout must charge exactly the price the pricing page showed, in the
// region's own currency. Stripe is stubbed at the require('stripe') boundary so
// the real routes, store and pricing code run against real request bodies while
// no live key (and no network) is needed.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret';
process.env.AI_PROVIDER = 'disabled';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STRIPE_SECRET_KEY = 'sk_test_0123456789abcdef';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_0123456789abcdef';

// Jest allows factory references to variables whose name starts with "mock".
const mockSessions = new Map();
const mockCreated = [];

jest.mock('stripe', () => {
  return function stripeFactory() {
    return {
      checkout: {
        sessions: {
          create: async (params) => {
            mockCreated.push(params);
            const id = 'cs_test_' + mockSessions.size;
            const session = Object.assign({}, params, {
              id,
              url: 'https://checkout.stripe.com/c/pay/' + id,
              amount_total: params.line_items[0].price_data.unit_amount,
              currency: params.line_items[0].price_data.currency,
              payment_status: 'paid',
              mode: 'subscription',
              status: 'complete',
              subscription: { id: 'sub_test_1', current_period_end: Math.floor(Date.now() / 1000) + 86400 },
            });
            mockSessions.set(id, session);
            return session;
          },
          retrieve: async (id) => mockSessions.get(id),
        },
      },
    };
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { app } = require('../server');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILES = [
  path.join(DATA_DIR, 'mock-subscriptions.json'),
  path.join(DATA_DIR, 'mock-subscription-checkouts.json'),
];
const storeBackups = STORE_FILES.map(file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null));

afterAll(() => {
  STORE_FILES.forEach((file, index) => {
    if (storeBackups[index] === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, storeBackups[index]);
  });
});

function tokenFor(userId) {
  return jwt.sign({ userId, email: userId + '@example.com', role: 'user' }, process.env.JWT_SECRET);
}

async function startCheckout(userId, plan, interval, country) {
  let call = request(app)
    .post('/api/subscriptions/checkout')
    .set('Authorization', 'Bearer ' + tokenFor(userId));
  if (country) call = call.set('X-Country', country);
  return call.send({ plan, interval });
}

describe('subscription checkout pricing', () => {
  beforeEach(() => {
    mockCreated.length = 0;
    mockSessions.clear();
  });

  test('a visitor on the default list is charged the USD list price', async () => {
    const res = await startCheckout('sub-user-global', 'starter', 'monthly');
    expect(res.status).toBe(201);
    expect(mockCreated).toHaveLength(1);
    const price = mockCreated[0].line_items[0].price_data;
    expect(price.unit_amount).toBe(1900);
    expect(price.currency).toBe('usd');
    expect(price.recurring.interval).toBe('month');
    expect(mockCreated[0].metadata.plan).toBe('starter');
  });

  test('an Indian visitor is charged the INR list price, not the USD one', async () => {
    const res = await startCheckout('sub-user-india', 'starter', 'monthly', 'IN');
    expect(res.status).toBe(201);
    const price = mockCreated[0].line_items[0].price_data;
    expect(price.unit_amount).toBe(49900);
    expect(price.currency).toBe('inr');
    expect(mockCreated[0].metadata.currency).toBe('inr');

    const verify = await request(app)
      .get('/api/subscriptions/checkout/' + res.body.sessionId + '/verify')
      .set('Authorization', 'Bearer ' + tokenFor('sub-user-india'));
    expect(verify.status).toBe(200);
    expect(verify.body.active).toBe(true);
    expect(verify.body.subscription.currency).toBe('inr');
    expect(verify.body.subscription.price).toBe(499);
  });

  test('yearly billing charges 12 months at 20% off, in the region currency', async () => {
    const global = await startCheckout('sub-user-yearly', 'starter', 'yearly');
    expect(global.status).toBe(201);
    expect(mockCreated[0].line_items[0].price_data.unit_amount).toBe(18240);
    expect(mockCreated[0].line_items[0].price_data.currency).toBe('usd');
    expect(mockCreated[0].line_items[0].price_data.recurring.interval).toBe('year');

    mockCreated.length = 0;
    const india = await startCheckout('sub-user-yearly-in', 'starter', 'yearly', 'IN');
    expect(india.status).toBe(201);
    expect(mockCreated[0].line_items[0].price_data.unit_amount).toBe(479040);
    expect(mockCreated[0].line_items[0].price_data.currency).toBe('inr');
  });

  test('a paid session whose plan disagrees with the recorded checkout cannot activate', async () => {
    const res = await startCheckout('sub-user-tamper', 'starter', 'monthly');
    expect(res.status).toBe(201);
    // A tampered Stripe session claiming a pricier plan must be refused.
    mockSessions.get(res.body.sessionId).metadata.plan = 'professional';
    const verify = await request(app)
      .get('/api/subscriptions/checkout/' + res.body.sessionId + '/verify')
      .set('Authorization', 'Bearer ' + tokenFor('sub-user-tamper'));
    expect(verify.status).toBe(409);
    expect(verify.body.error).toMatch(/does not match/i);
  });

  test('checkout refuses an unknown plan and a missing interval', async () => {
    const unknown = await startCheckout('sub-user-bad', 'does-not-exist', 'monthly');
    expect(unknown.status).toBe(400);
    const noInterval = await startCheckout('sub-user-bad', 'starter', 'weekly');
    expect(noInterval.status).toBe(400);
    expect(mockCreated).toHaveLength(0);
  });
});
