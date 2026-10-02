import { describe, it, expect, beforeAll } from '@jest/globals';
import { createRequire } from 'node:module';
import { mountRoutes } from '../keycode_routes.js';

const require = createRequire(import.meta.url);
const nodeCrypto = require('node:crypto');

/**
 * Minimal in-memory mocks standing in for the Mongoose models and helpers
 * that server.js passes into mountRoutes(). Only the surface used by the
 * Marketplace / Team / Analytics / Settings routes is stubbed.
 */

/** A chainable, awaitable stand-in for a Mongoose query object. */
function queryChain(getResult) {
  const obj = {
    sort: () => obj,
    skip: () => obj,
    limit: () => obj,
    select: () => obj,
    populate: () => obj,
    lean: async () => getResult(),
    then: (resolve, reject) => Promise.resolve(getResult()).then(resolve, reject),
    catch: (onRej) => obj
  };
  return obj;
}

function makeModel(name, docs = []) {
  const store = docs;
  return {
    find: () => queryChain(() => store),
    findOne: () => queryChain(() => store[0] ?? null),
    findById: () => queryChain(() => ({ _id: `${name}_id_1`, toString: () => `${name}_id_1` })),
    countDocuments: async () => store.length,
    create: async (doc) => ({ _id: `${name}_id_${store.length + 1}`, ...doc }),
    aggregate: () => queryChain(() => []),
    updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    updateMany: async () => ({ matchedCount: 1 }),
    deleteOne: async () => ({ deletedCount: 1 })
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  return res;
}

function makeApp() {
  const routes = {};
  const app = {
    routes,
    get: (p, ...h) => { routes[`GET ${p}`] = h; },
    post: (p, ...h) => { routes[`POST ${p}`] = h; },
    put: (p, ...h) => { routes[`PUT ${p}`] = h; },
    delete: (p, ...h) => { routes[`DELETE ${p}`] = h; }
  };
  return app;
}

const authStub = (req, res, next) => next();
const cryptoRef = nodeCrypto;

function buildDeps() {
  return {
    auth: authStub,
    crypto: nodeCrypto,
    sendEmail: async () => ({ success: true }),
    createAuditLog: async () => ({}),
    FRONTEND_URL: 'http://localhost:3000',
    MarketplaceListing: makeModel('Listing', [{ slug: 'pcb-kit', title: 'PCB Kit', price: 49, stock: 10, status: 'active', currency: 'USD' }]),
    MarketplaceOrder: makeModel('MkOrder'),
    Team: makeModel('Team'),
    TeamMember: makeModel('TeamMember'),
    TeamInvite: makeModel('TeamInvite'),
    User: makeModel('User'),
    Order: makeModel('Order'),
    AIProject: makeModel('AIProject'),
    AppState: makeModel('AppState'),
    Notification: makeModel('Notification'),
    defaultPreferences: () => ({ theme: 'dark', notifications: { email: true, push: true, marketing: false } })
  };
}

describe('keycode_routes mount', () => {
  it('registers marketplace, team, analytics and settings routes', async () => {
    const app = makeApp();
    mountRoutes(app, await buildDeps());
    const expected = [
      'GET /api/marketplace/list',
      'GET /api/marketplace/listings/:slug',
      'POST /api/marketplace/purchase',
      'GET /api/marketplace/my-orders',
      'GET /api/teams/me',
      'GET /api/teams',
      'POST /api/teams',
      'POST /api/teams/:teamId/invite',
      'GET /api/teams/invites',
      'POST /api/teams/invites/:token/accept',
      'POST /api/teams/invites/:token/reject',
      'GET /api/teams/:teamId/members',
      'DELETE /api/teams/:teamId/members/:userId',
      'GET /api/analytics/overview',
      'GET /api/analytics/projects',
      'GET /api/analytics/activity',
      'GET /api/settings/preferences',
      'PUT /api/settings/preferences',
      'GET /api/settings/notifications',
      'PUT /api/settings/notifications',
      'GET /api/settings/profile',
      'PUT /api/settings/profile',
      'POST /api/settings/ping'
    ];
    for (const key of expected) {
      expect(Array.isArray(app.routes[key])).toBe(true);
    }
  });
});

describe('marketplace routes', () => {
  const app = makeApp();
  let deps;
  beforeAll(async () => {
    deps = buildDeps();
    mountRoutes(app, deps);
  });

  it('lists active listings', async () => {
    const handler = app.routes['GET /api/marketplace/list'].at(-1);
    const res = makeRes();
    await handler({ query: {} }, res);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.listings)).toBe(true);
  });

  it('rejects purchase without slug/quantity', async () => {
    const handler = app.routes['POST /api/marketplace/purchase'].at(-1);
    const res = makeRes();
    await handler({ body: {}, user: { _id: 'u1' }, ip: '127.0.0.1', headers: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for unknown listing slug detail', async () => {
    const handler = app.routes['GET /api/marketplace/listings/:slug'].at(-1);
    const res = makeRes();
    // Override findOne to miss (handler awaits .lean())
    const orig = deps.MarketplaceListing.findOne;
    deps.MarketplaceListing.findOne = () => queryChain(() => null);
    await handler({ params: { slug: 'nope' } }, res);
    deps.MarketplaceListing.findOne = orig;
    expect(res.statusCode).toBe(404);
  });
});

describe('team routes', () => {
  const app = makeApp();
  beforeAll(async () => {
    mountRoutes(app, buildDeps());
  });

  it('create requires name', async () => {
    const handler = app.routes['POST /api/teams'].at(-1);
    const res = makeRes();
    await handler({ body: {}, user: { _id: 'u1' }, ip: '127.0.0.1', headers: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('invite requires email', async () => {
    const handler = app.routes['POST /api/teams/:teamId/invite'].at(-1);
    const res = makeRes();
    // Team.findById returns a team the requester owns
    const TeamMock = {
      findById: () => queryChain(() => ({ _id: 't1', name: 'T', owner: { toString: () => 'u1' }, slug: 't' }))
    };
    const deps = buildDeps();
    Object.assign(deps.Team, TeamMock);
    await handler({ params: { teamId: 't1' }, body: {}, user: { _id: 'u1' }, ip: '127.0.0.1', headers: {} }, res);
    expect(res.statusCode).toBe(400);
  });
});

describe('settings routes', () => {
  const app = makeApp();
  beforeAll(async () => {
    mountRoutes(app, await buildDeps());
  });

  it('GET preferences returns defaults when none stored', async () => {
    const handler = app.routes['GET /api/settings/preferences'].at(-1);
    const res = makeRes();
    const deps = await buildDeps();
    // one of the routes uses deps from closure; rebuild to inject AppState.findOne => null
    const AppStateMock = { findOne: () => queryChain(() => null), findOneAndUpdate: async () => ({ value: {} }) };
    const app2 = makeApp();
    const deps2 = buildDeps();
    Object.assign(deps2.AppState, AppStateMock);
    mountRoutes(app2, deps2);
    const h2 = app2.routes['GET /api/settings/preferences'].at(-1);
    await h2({ user: { _id: 'u1' } }, res);
    expect(res.body.success).toBe(true);
    expect(res.body.preferences.theme).toBe('dark');
  });

  it('profile update validates name length', async () => {
    const handler = app.routes['PUT /api/settings/profile'].at(-1);
    const res = makeRes();
    const deps = buildDeps();
    const UserMock = { findByIdAndUpdate: async () => ({}) };
    Object.assign(deps.User, UserMock);
    await handler({ body: { name: 'A' }, user: { _id: 'u1' }, ip: '127.0.0.1', headers: {} }, res);
    expect(res.statusCode).toBe(400);
  });
});

describe('analytics routes', () => {
  it('overview returns success with user scope', async () => {
    const app = makeApp();
    const deps = buildDeps();
    mountRoutes(app, deps);
    const handler = app.routes['GET /api/analytics/overview'].at(-1);
    const res = makeRes();
    await handler({ query: {}, user: { _id: 'u1', role: 'user' }, ip: '127.0.0.1', headers: {} }, res);
    expect(res.body.success).toBe(true);
    expect(res.body.scope).toBe('user');
    expect(res.body.overview).toBeDefined();
  });
});
