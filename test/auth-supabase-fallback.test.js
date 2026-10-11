'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'supabase-fallback-test-secret';
process.env.APP_URL = 'http://localhost:3000';

const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AuthRoutes = require('../routes/auth');

describe('Supabase to local auth fallback', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'keycode-auth-fallback-'));
  const email = 'local-fallback@example.com';
  const password = 'local-password-123';
  const jwtSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    fs.mkdirSync(path.join(projectRoot, 'data'), { recursive: true });
    const passwordHash = crypto.createHash('sha256').update(password + jwtSecret).digest('hex');
    fs.writeFileSync(path.join(projectRoot, 'data', 'mock-users.json'), JSON.stringify({
      [email]: {
        id: 'local-user',
        email,
        name: 'Local User',
        passwordHash,
        role: 'user',
      },
    }));
  });

  afterAll(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  function createAuthApp(supabase) {
    const app = express();
    app.use(express.json());
    AuthRoutes({
      app,
      SUPABASE: supabase,
      SUPABASE_ADMIN: null,
      STRIPE: null,
      crypto,
      rand: length => crypto.randomBytes(length).toString('hex'),
      hash: value => crypto.createHash('sha256').update(value).digest('hex'),
      now: () => new Date().toISOString(),
      JWT_SECRET: jwtSecret,
      JWT_EXPIRY: '7d',
      setSessionCookie: (res, token) => res.cookie('kc_token', token),
      clearSessionCookie: res => res.clearCookie('kc_token'),
      optionalAuth: (_req, _res, next) => next(),
      requireAuth: (_req, _res, next) => next(),
      IS_PROD: false,
      projectRoot,
    });
    return app;
  }

  test('accepts valid local credentials when Supabase rejects the login', async () => {
    const app = createAuthApp({
      auth: {
        signInWithPassword: async () => ({
          data: { user: null },
          error: { message: 'Invalid login credentials' },
        }),
      },
    });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.email).toBe(email);
  });

  test('allows Supabase sign-in when no admin client is configured', async () => {
    const app = createAuthApp({
      auth: {
        signInWithPassword: async () => ({
          data: {
            user: { id: 'supabase-user', email, created_at: new Date().toISOString(), user_metadata: {} },
            session: { access_token: 'access', refresh_token: 'refresh' },
          },
          error: null,
        }),
      },
    });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.email).toBe(email);
    expect(response.body.accessToken).toBe('access');
  });
});
