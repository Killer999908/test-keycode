'use strict';
// ============================================================================
//  SYSTEM TEST — real signup → API key → CLI login → CLI use
//  Boots the actual server on a dynamic port, then drives the REAL CLI
//  (keycode-cli.js) as a subprocess the way a user would in a terminal.
//
//  Flow under test:
//    1. POST /api/auth/register  (a brand-new real account)
//    2. POST /api/keys           (session cookie from signup → kc_sk_ key)
//    3. `keycode login <kc_sk_…>` (subprocess; writes ~/.keycode/config.json)
//    4. `keycode list`            (subprocess; authenticated via saved key)
//    5. `keycode agent "prompt"`  (subprocess; full AI build → local file
//                                 + cloud library entry — deterministic
//                                 engine since AI_PROVIDER=disabled)
//    6. negative: bad key rejected by `keycode login`; agent without
//                 login fails cleanly
//
//  NOTE: the CLI subprocess is awaited asynchronously (child_process.spawn +
//  exit event). spawnSync would work too, but jest can report it as hung
//  when the in-process server keeps handles open between steps.
// ============================================================================
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret';
process.env.AI_PROVIDER = 'disabled';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STRIPE_SECRET_KEY = '';
process.env.STRIPE_WEBHOOK_SECRET = '';

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { app } = require('../server');

const CLI_PATH = path.join(__dirname, '..', 'keycode-cli.js');
const CLI_TIMEOUT_MS = 30_000;

// ---- data-file isolation: back up / restore around this suite ---------------
const DATA_DIR = path.join(__dirname, '..', 'data');
const MOCK_USERS = path.join(DATA_DIR, 'mock-users.json');
const API_KEYS = path.join(DATA_DIR, 'api-keys.json');
const AI_PROJECTS = path.join(DATA_DIR, 'ai-projects.json');
const AI_PROJECTS_DIR = path.join(__dirname, '..', 'ai-projects');
const backups = {};
beforeAll(function () {
  for (const f of [MOCK_USERS, API_KEYS, AI_PROJECTS]) {
    backups[f] = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  }
  // track ai-projects/ generated html files so we can remove only what THIS suite made
  backups[AI_PROJECTS_DIR] = fs.existsSync(AI_PROJECTS_DIR) ? fs.readdirSync(AI_PROJECTS_DIR) : null;
});
afterAll(function () {
  for (const f of [MOCK_USERS, API_KEYS, AI_PROJECTS]) {
    if (backups[f] === null) fs.rmSync(f, { force: true });
    else fs.writeFileSync(f, backups[f]);
  }
  // remove generated artifact files created by this suite (ai-projects/ is gitignored)
  if (backups[AI_PROJECTS_DIR] === null) {
    fs.rmSync(AI_PROJECTS_DIR, { recursive: true, force: true });
  } else {
    const before = new Set(backups[AI_PROJECTS_DIR]);
    if (fs.existsSync(AI_PROJECTS_DIR)) {
      for (const f of fs.readdirSync(AI_PROJECTS_DIR)) {
        if (!before.has(f)) fs.rmSync(path.join(AI_PROJECTS_DIR, f), { recursive: true, force: true });
      }
    }
  }
});

// ---- helpers ----------------------------------------------------------------
let server; // real listening http server
let baseUrl;

function startServer() {
  return new Promise(function (resolve, reject) {
    server = http.createServer(app);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', function () {
      baseUrl = 'http://127.0.0.1:' + server.address().port;
      resolve(baseUrl);
    });
  });
}

// Minimal cookie capture from Set-Cookie on the register response.
function extractSessionCookie(resHeaders) {
  const raw = resHeaders['set-cookie'] || [];
  for (const line of raw) {
    if (line.startsWith('kc_token=')) return line.split(';')[0];
  }
  return null;
}

function postJSON(urlPath, body, extraHeaders) {
  return new Promise(function (resolve, reject) {
    const payload = JSON.stringify(body);
    const req = http.request(baseUrl + urlPath, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        ...extraHeaders,
      },
    }, function (res) {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', function () {
        let json = null;
        try { json = JSON.parse(buf); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, json, text: buf });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Run the REAL CLI the way a user would: `node keycode-cli.js <args>`,
// in a sandbox HOME so sandboxed ~/.keycode/config.json is inspected/wiped.
// Returns a promise resolving to { status, stdout, stderr }.
function runCli(args, homeDir) {
  return new Promise(function (resolve, reject) {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      // KEYCODE_URL must WIN over any inherited/real-user config: the CLI
      // prefers env, then a pre-existing ~/.keycode/config.json. Wipe the
      // sandboxed HOME fresh each run so only our env + sandbox config apply.
      env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir, KEYCODE_URL: baseUrl },
      cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'keycode-cli-cwd-')),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(function () {
      child.kill('SIGKILL');
      reject(new Error('CLI timed out after ' + CLI_TIMEOUT_MS + 'ms: ' + args.join(' ')));
    }, CLI_TIMEOUT_MS);
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', function (e) { clearTimeout(timer); reject(e); });
    child.on('close', function (code) {
      clearTimeout(timer);
      resolve({ status: code, stdout: stdout, stderr: stderr });
    });
  });
}

let testEmail;
const testPassword = 'system-test-password-123';

beforeAll(async function () {
  await startServer();
  testEmail = 'sys-' + Date.now() + '@keycode.test';
});

afterAll(function () {
  if (server) server.close();
});

describe('signup → key → CLI login (system, real server + real CLI)', function () {
  let apiKey = '';

  test('1. a real account can be created via /api/auth/register', async function () {
    const res = await postJSON('/api/auth/register', {
      name: 'System Test',
      email: testEmail,
      password: testPassword,
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.token).toBeTruthy();
    expect(res.json.user.email).toBe(testEmail);
    // the session cookie must be set — the website-after-signup flow relies on it
    expect(extractSessionCookie(res.headers)).toBeTruthy();
  });

  test('2. duplicate signup is rejected with 409', async function () {
    const res = await postJSON('/api/auth/register', {
      name: 'System Test',
      email: testEmail,
      password: testPassword,
    });
    expect(res.status).toBe(409);
  });

  test('3. the signed-up account can mint an API key (/api/keys)', async function () {
    // Sign IN again to grab a session cookie (mirrors re-login), then /api/keys.
    const login = await postJSON('/api/auth/login', {
      email: testEmail,
      password: testPassword,
    });
    expect(login.status).toBe(200);
    const cookie = extractSessionCookie(login.headers);
    expect(cookie).toBeTruthy();

    const keyRes = await postJSON('/api/keys', { name: 'system-test' }, { cookie });
    expect(keyRes.status).toBe(201);
    expect(keyRes.json.apiKey).toMatch(/^kc_sk_[0-9a-f]+$/);
    apiKey = keyRes.json.apiKey;
  });

  test('4. real CLI `keycode login <kc_sk_…>` accepts the key and persists config', async function () {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'keycode-home-'));
    try {
      const r = await runCli(['login', apiKey], home);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('Logged in');

      const confPath = path.join(home, '.keycode', 'config.json');
      expect(fs.existsSync(confPath)).toBe(true);
      const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
      expect(conf.key).toBe(apiKey);
      expect(conf.baseUrl).toBe(baseUrl); // HOME sandbox targeted OUR server
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('5. real CLI `keycode list` authenticates with the saved key', async function () {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'keycode-home-'));
    try {
      const login = await runCli(['login', apiKey], home);
      expect(login.status).toBe(0);

      const r = await runCli(['list'], home);
      // Authenticated request against the live server: 200 → exit 0, friendly output
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('No saved projects yet.');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('6. negative: CLI rejects an invalid key and exits non-zero', async function () {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'keycode-home-'));
    try {
      const r = await runCli(['login', 'kc_sk_ffffffffffffffffffffffffffffff'], home);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('invalid API key');
      // and it must NOT have written a config with the bogus key
      expect(fs.existsSync(path.join(home, '.keycode', 'config.json'))).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('7. negative: unauthenticated key routes return 401', async function () {
    const req = await postJSON('/api/keys', { name: 'nope' }, { cookie: 'kc_token=forged.jwt.value' });
    expect(req.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  //  AGENT BUILD — the flagship command: plan → SSE stream → local file
  //  + cloud library save. With AI_PROVIDER=disabled the server uses the
  //  deterministic local engine, so no network AI provider is needed.
  // ---------------------------------------------------------------------------
  test('8. real CLI `keycode agent "…"` builds a site from the logged-in account', async function () {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'keycode-home-'));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'keycode-build-'));
    try {
      const login = await runCli(['login', apiKey], home);
      expect(login.status).toBe(0);

      // run the build in a sandboxed cwd so the generated file lands there
      const child = spawn(process.execPath, [CLI_PATH, 'agent', 'a tiny bakery page'], {
        env: { ...process.env, HOME: home, USERPROFILE: home, KEYCODE_URL: baseUrl },
        cwd: cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const result = await new Promise(function (resolve, reject) {
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(function () { child.kill('SIGKILL'); reject(new Error('agent build timed out')); }, CLI_TIMEOUT_MS);
        child.stdout.on('data', (c) => (stdout += c));
        child.stderr.on('data', (c) => (stderr += c));
        child.on('error', (e) => reject(e));
        child.on('close', (code) => { clearTimeout(timer); resolve({ status: code, stdout, stderr }); });
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Built ');           // "✓ Built N KB"
      expect(result.stdout).toContain('Saved to ');         // local file written
      expect(result.stdout).toContain('Saved to your library'); // cloud copy persisted

      // 8a. the generated file exists on disk in the CLI cwd
      const builtAbs = (result.stdout.match(/Saved to (\S+)/) || [])[1];
      expect(builtAbs).toBeTruthy();
      expect(fs.existsSync(builtAbs)).toBe(true);
      const html = fs.readFileSync(builtAbs, 'utf8');
      expect(html).toContain('<!DOCTYPE html');
      expect(html.length).toBeGreaterThan(500);

    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('9. the CLI build was saved to the account\'s cloud library (API-visible)', async function () {
    // list the account's projects with the API key as Bearer (same auth the CLI uses)
    const res = await new Promise(function (resolve, reject) {
      const req = http.request(baseUrl + '/api/user/ai-projects', {
        method: 'GET',
        headers: { authorization: 'Bearer ' + apiKey },
      }, function (r) {
        let buf = '';
        r.on('data', (c) => (buf += c));
        r.on('end', function () {
          let json = null;
          try { json = JSON.parse(buf); } catch (_) {}
          resolve({ status: r.statusCode, json, text: buf });
        });
      });
      req.on('error', reject);
      req.end();
    });
    expect(res.status).toBe(200);
    const projects = res.json.projects || [];
    expect(projects.length).toBeGreaterThan(0);
    const last = projects[projects.length - 1];
    expect(last.prompt).toContain('bakery');
    expect(last.fileId).toMatch(/^proj_/);
    // generated artifact must exist on the server too
    expect(fs.existsSync(path.join(AI_PROJECTS_DIR, last.fileId))).toBe(true);
  });

  test('10. negative: `keycode agent` without login fails cleanly, no file written', async function () {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'keycode-nolog-'));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'keycode-nolog-cwd-'));
    try {
      // fresh HOME = no ~/.keycode/config.json → the CLI must refuse to build
      const child = spawn(process.execPath, [CLI_PATH, 'agent', 'another page'], {
        env: { ...process.env, HOME: home, USERPROFILE: home, KEYCODE_URL: baseUrl },
        cwd: cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const r = await new Promise(function (resolve, reject) {
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (c) => (stdout += c));
        child.stderr.on('data', (c) => (stderr += c));
        child.on('error', reject);
        child.on('close', (code) => resolve({ status: code, stdout, stderr }));
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('Not logged in');
      // no generated html file may appear in the cwd
      const files = fs.readdirSync(cwd).filter((f) => f.endsWith('.html'));
      expect(files).toEqual([]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
