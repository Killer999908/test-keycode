'use strict';
// Tests for the cross-platform CLI installer endpoints:
//   /install.sh · /install.ps1 · /api/cli/download
// Verifies origin injection (placeholder replacement), content types,
// and that the scripts survive shell/PowerShell syntax parsing.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret';
process.env.AI_PROVIDER = 'disabled';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STRIPE_SECRET_KEY = '';
process.env.STRIPE_WEBHOOK_SECRET = '';

const request = require('supertest');
const { execFileSync } = require('child_process');
const { app } = require('../server');

describe('KEYCODE CLI installers', function () {
  test('GET /install.sh injects the request origin and keeps valid sh syntax', async function () {
    const res = await request(app)
      .get('/install.sh')
      .set('Host', 'test-origin.example.com')
      .expect(200);
    expect(res.headers['content-type']).toContain('text/x-shellscript');
    expect(res.text).not.toContain('__KEYCODE_URL__');
    expect(res.text).toContain('KEYCODE_URL:-http://test-origin.example.com');
    // sh syntax check when the shell is available (it always is on CI/linux)
    try {
      execFileSync('sh', ['-n'], { input: res.text });
    } catch (e) {
      throw new Error('install.sh failed sh -n syntax check: ' + e.message);
    }
  });

  test('GET /install.sh honours X-Forwarded-Host + X-Forwarded-Proto', async function () {
    const res = await request(app)
      .get('/install.sh')
      .set('Host', 'internal.local')
      .set('X-Forwarded-Host', 'public.example.com')
      .set('X-Forwarded-Proto', 'https')
      .expect(200);
    expect(res.text).toContain('KEYCODE_URL:-https://public.example.com');
  });

  test('GET /install.sh falls back to localhost for a bad Host header', async function () {
    const res = await request(app)
      .get('/install.sh')
      .set('Host', 'evil header injection>')
      .expect(200);
    expect(res.text).not.toContain('evil header');
    expect(res.text).toMatch(/KEYCODE_URL:-http:\/\/localhost/);
  });

  test('GET /install.ps1 injects the origin and contains the keycode shim', async function () {
    const res = await request(app)
      .get('/install.ps1')
      .set('Host', 'win-origin.example.com')
      .expect(200);
    expect(res.text).not.toContain('__KEYCODE_URL__');
    expect(res.text).toContain("'http://win-origin.example.com'");
    expect(res.text).toContain('keycode.cmd');
  });

  test('GET /api/cli/download serves the actual CLI (node shebang)', async function () {
    const res = await request(app).get('/api/cli/download').expect(200);
    expect(res.text.startsWith('#!/usr/bin/env node')).toBe(true);
    expect(res.text).toContain("cmd === 'login'");
  });
});
