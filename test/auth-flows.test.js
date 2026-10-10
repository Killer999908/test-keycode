'use strict';
// Integration tests for the auth flows added in the "finish the gaps" pass:
//   · password reset (forgot → token → reset → login with new password)
//   · OAuth entry points (unconfigured → friendly redirect; configured → provider URL + state cookie)
//   · OTP send/verify (dev code path)
//   · unit checks: extractJson in agent-core, mailer provider detection
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret';
process.env.AI_PROVIDER = 'disabled'; // force local engine — no network in tests
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_KEY = '';

const request = require('supertest');
const fs = require('fs');
const path = require('path');

const { app } = require('../server');
const { extractJson } = require('../lib/agent-core');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'mock-users.json');
const RESET_FILE = path.join(DATA_DIR, 'reset-tokens.json');
const backups = {
  users: fs.existsSync(USERS_FILE) ? fs.readFileSync(USERS_FILE, 'utf8') : null,
  reset: fs.existsSync(RESET_FILE) ? fs.readFileSync(RESET_FILE, 'utf8') : null,
};
afterAll(() => {
  for (const [file, backup] of [['users', backups.users], ['reset', backups.reset]]) {
    const p = path.join(DATA_DIR, file === 'users' ? 'mock-users.json' : 'reset-tokens.json');
    if (backup === null) fs.rmSync(p, { force: true });
    else fs.writeFileSync(p, backup);
  }
});

describe('password reset flow', () => {
  const EMAIL = 'reset-test@example.com';
  const PASSWORD = 'old-password-1';

  test('forgot-password issues a dev link + persisted token', async () => {
    // create a local (mock) account first
    const reg = await request(app).post('/api/auth/register')
      .send({ name: 'Reset Tester', email: EMAIL, password: PASSWORD });
    expect([200, 409]).toContain(reg.status); // 409 ok if leftover from a previous run

    const res = await request(app).post('/api/auth/forgot-password').send({ email: EMAIL });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body._dev_link).toMatch(/reset-password\.html\?token=[0-9a-f]+/);
  });

  test('reset-password with the token updates the password and enables login', async () => {
    const tokens = JSON.parse(fs.readFileSync(RESET_FILE, 'utf8'));
    const entry = Object.entries(tokens).find(([t, v]) => v.email === EMAIL && !v.used);
    expect(entry).toBeTruthy();
    const token = entry[0];

    const reset = await request(app).post('/api/auth/reset-password')
      .send({ token, password: 'new-password-9' });
    expect(reset.status).toBe(200);
    expect(reset.body.success).toBe(true);

    // token is single-use
    const again = await request(app).post('/api/auth/reset-password')
      .send({ token, password: 'another-pass-1' });
    expect(again.status).toBe(400);

    // login with the NEW password works (mock path)
    const login = await request(app).post('/api/auth/login')
      .send({ email: EMAIL, password: 'new-password-9' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });

  test('rejects short passwords and unknown tokens', async () => {
    const bad = await request(app).post('/api/auth/reset-password')
      .send({ token: 'deadbeef', password: 'short' });
    expect(bad.status).toBe(400);
  });
});

describe('oauth entry points', () => {
  test('unconfigured provider redirects back with a clear error', async () => {
    delete process.env.GITHUB_CLIENT_ID;
    const res = await request(app).get('/api/auth/github').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=oauth_not_configured');
    expect(res.headers.location).toContain('provider=github');
  });

  test('configured provider redirects to the real authorize URL with a state cookie', async () => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'test-secret';
    const res = await request(app).get('/api/auth/github').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('https://github.com/login/oauth/authorize');
    expect(res.headers.location).toContain('client_id=test-client-id');
    expect(res.headers.location).toContain('state=');
    const cookies = (res.headers['set-cookie'] || []).join(';');
    expect(cookies).toContain('oauth_state=');
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
  });

  test('callback with mismatched state is rejected', async () => {
    const res = await request(app).get('/api/auth/github/callback?code=x&state=wrong').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=oauth_state_mismatch');
  });
});

describe('otp flow (dev)', () => {
  test('send-otp returns a dev code and verify-otp accepts it', async () => {
    const send = await request(app).post('/api/auth/send-otp').send({ email: 'otp-test@example.com' });
    expect(send.status).toBe(200);
    const code = send.body.code;
    expect(code).toMatch(/^\d{6}$/);

    const verify = await request(app).post('/api/auth/verify-otp')
      .send({ email: 'otp-test@example.com', otp: code });
    expect(verify.status).toBe(200);
    expect(verify.body.success).toBe(true);
  });

  test('verify-otp rejects a wrong code', async () => {
    await request(app).post('/api/auth/send-otp').send({ email: 'otp-bad@example.com' });
    const res = await request(app).post('/api/auth/verify-otp')
      .send({ email: 'otp-bad@example.com', otp: '000000' });
    expect(res.status).toBe(400);
  });
});

describe('mailer unit checks', () => {
  const mailer = require('../lib/mailer');
  test('reports not configured in test env', () => {
    const saved = ['RESEND_API_KEY', 'SENDGRID_API_KEY', 'MAILGUN_API_KEY', 'POSTMARK_TOKEN'];
    const old = saved.map(k => process.env[k]);
    saved.forEach(k => delete process.env[k]);
    expect(mailer.isConfigured()).toBe(false);
    old.forEach((v, i) => { if (v !== undefined) process.env[saved[i]] = v; });
  });
  test('dev fallback resolves with delivered:false (logs instead of sending)', async () => {
    const r = await mailer.send({ to: 'x@y.z', subject: 't', text: 'hello' });
    expect(r.delivered).toBe(false);
    expect(['not_configured', 'no_recipient']).toContain(r.reason);
  });
});

describe('agent-core extractJson hardening', () => {
  test('parses trailing commas in nested objects', () => {
    expect(extractJson('noise {"a":1,"b":[2,{"c":3},],} tail')).toEqual({ a: 1, b: [2, { c: 3 }] });
  });
  test('parses fenced json', () => {
    expect(extractJson('```json\n{"plan":["x"]}\n```')).toEqual({ plan: ['x'] });
  });
  test('returns null on garbage', () => {
    expect(extractJson('no json here')).toBeNull();
  });
});
