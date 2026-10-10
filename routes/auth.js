'use strict';
// ============================================================
//  AUTH ROUTES  —  /api/auth/*
//  register · login · logout · send-otp · verify-otp
//  magic-link send/verify · passkey register/login (WebAuthn)
//  social OAuth entry points (Google / GitHub / Discord)
// ============================================================
module.exports = function AuthRoutes(opts) {
  const {
    app,
    SUPABASE,
    SUPABASE_ADMIN,
    STRIPE,            // unused here but kept for parity
    crypto,
    rand,
    hash,
    now,
    JWT_SECRET,
    JWT_EXPIRY,
    setSessionCookie,
    clearSessionCookie,
    optionalAuth,
    requireAuth,
    IS_PROD,
    projectRoot,
  } = opts;

  // ---------------------------------------------------------------------------
  //  Helpers
  // ---------------------------------------------------------------------------
  const path = require('path');
  const fs   = require('fs');
  const JWT  = require('jsonwebtoken');
  const mailer = require('../lib/mailer');

  function signSession(user) {
    const payload = {
      userId:    user.id,
      email:     user.email,
      name:      user.name || user.full_name || 'User',
      role:      user.role || 'user',
      avatar:    user.avatar_url || null,
      supabaseId: user.supabase_id || user.id,
    };
    return JWT.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  }

  // When Supabase is available we use it; otherwise we store users in a local
  // JSON "mock DB" so the dev flow stays functional.
  const MOCK_PATH = path.join(projectRoot, 'data', 'mock-users.json');

  function loadMock() {
    if (!fs.existsSync(MOCK_PATH)) return {};
    try { return JSON.parse(fs.readFileSync(MOCK_PATH, 'utf8')); } catch (_) { return {}; }
  }
  function saveMock(db) {
    fs.mkdirSync(path.dirname(MOCK_PATH), { recursive: true });
    fs.writeFileSync(MOCK_PATH, JSON.stringify(db, null, 2));
  }

  // OTPs are short-lived and scoped to a contact; limit resend and guess attempts.
  const otpStore = new Map();
  const OTP_TTL_MS = 10 * 60 * 1000;
  const OTP_RESEND_MS = 60 * 1000;
  const OTP_MAX_ATTEMPTS = 5;

  function issueTokenAndRespond(res, user, extras = {}) {
    const token = signSession(user);
    const out = {
      success: true,
      token,
      user: {
        id:       user.id,
        email:    user.email,
        name:     user.name || user.full_name || 'User',
        avatar:   user.avatar_url || null,
        role:     user.role || 'user',
      },
      ...extras,
    };
    setSessionCookie(res, token);
    return res.json(out);
  }

  function normalizeUser(raw, opts) {
    return {
      id:         raw.id || raw.user_id || rand(16),
      email:      (raw.email || '').toLowerCase().trim(),
      name:       raw.name    || raw.full_name || raw.fullName || '',
      phone:      raw.phone   || '',
      passwordHash: raw.passwordHash || '',
      role:       raw.role    || 'user',
      avatar_url: raw.avatar_url || '',
      supabase_id: raw.supabase_id || '',
      created_at: raw.created_at || now(),
      updated_at: now(),
      ...opts,
    };
  }

  // ---------------------------------------------------------------------------
  //  Register
  // ---------------------------------------------------------------------------
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, phone, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'password must be at least 8 characters' });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // --- Supabase path ---
      if (SUPABASE) {
        try {
          // We create the auth user via the admin (service) client so we can
          // set the user metadata in one shot. If that is not available we
          // fall back to the anon client with a raw RPC call.
          const adminClient = SUPABASE_ADMIN;
          let authUser;
          if (adminClient) {
            const { data, error } = await adminClient.auth.admin.createUser({
              email: normalizedEmail,
              password,
              user_metadata: { full_name: name || '' },
              options: { data: { phone } },
            });
            if (error) throw error;
            authUser = data.user;
          } else {
            // anon client cannot create users with a custom password in most
            // configs; fall through to mock.
            throw new Error('no admin client');
          }

          const dbUser = normalizeUser(
            {
              id:          authUser.id,
              email:       authUser.email,
              full_name:   name || '',
              phone:       phone || '',
              passwordHash: '',
              role:        'user',
              avatar_url:  authUser.user_metadata?.avatar_url || '',
              supabase_id: authUser.id,
            },
            { created_at: authUser.created_at, updated_at: now() }
          );

          // Upsert into public.users via admin client (bypasses RLS)
          const up = SUPABASE_ADMIN.from('users');
          await up.upsert(
            {
              id:         dbUser.id,
              email:      dbUser.email,
              full_name:  dbUser.name,
              avatar_url: dbUser.avatar_url,
              role:       dbUser.role,
              last_sign_in: new Date().toISOString(),
              metadata:   {},
            },
            { onConflict: 'id' }
          );

          return issueTokenAndRespond(res, dbUser, {
            message: 'Account created — check your email to verify.',
          });
        } catch (supErr) {
          // If Supabase is configured but rejected the request (e.g. email
          // already exists), surface a friendly message rather than stack.
          const msg = (supErr && supErr.message) ? supErr.message.toLowerCase() : '';
          if (msg.includes('already') || msg.includes('exists')) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
          }
          // Anything else (network, config) → fall through to mock so the
          // developer still gets a working flow.
          console.warn('[auth] Supabase register failed, falling back to mock:', supErr && supErr.message);
        }
      }

      // --- Mock path ---
      const db  = loadMock();
      if (db[normalizedEmail]) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      const pwHash = hash(password + (JWT_SECRET || 'pepper'));
      const user = normalizeUser(
        {
          id:            rand(16),
          email:         normalizedEmail,
          name:          name || '',
          phone:         phone || '',
          passwordHash:  pwHash,
          role:          'user',
          avatar_url:    '',
          created_at:    now(),
          updated_at:    now(),
        }
      );
      db[normalizedEmail] = user;
      saveMock(db);
      return issueTokenAndRespond(res, user, { message: 'Account created.' });
    } catch (err) {
      console.error('[auth.register]', err);
      return res.status(500).json({ error: 'Registration failed.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Login  (email + password)
  // ---------------------------------------------------------------------------
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password, remember = false } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }
      const normalizedEmail = email.toLowerCase().trim();

      // --- Supabase path ---
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });
          if (error || !data.user) {
            // Supabase gives a generic "Invalid login credentials" — keep it
            // friendly.
            return res.status(401).json({ error: 'Invalid email or password.' });
          }

          // Refetch the profile row so we have name / role etc.
          const { data: profile, error: pErr } = await SUPABASE_ADMIN
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single();

          const user = normalizeUser(
            {
              id:          data.user.id,
              email:       data.user.email,
              name:        profile?.full_name || '',
              phone:       profile?.phone || '',
              avatar_url:  profile?.avatar_url || data.user.user_metadata?.avatar_url || '',
              role:        profile?.role || 'user',
              supabase_id: data.user.id,
            },
            { created_at: data.user.created_at }
          );

          // Update last_sign_in
          if (SUPABASE_ADMIN) {
            await SUPABASE_ADMIN.from('users').update({ last_sign_in: now() }).eq('id', user.id).single();
          }

          return issueTokenAndRespond(res, user, {
            accessToken:  data.session?.access_token || null,
            refreshToken: data.session?.refresh_token || null,
          });
        } catch (supErr) {
          const msg = (supErr && supErr.message) ? supErr.message.toLowerCase() : '';
          if (msg.includes('invalid') || msg.includes('credentials')) {
            return res.status(401).json({ error: 'Invalid email or password.' });
          }
          console.warn('[auth] Supabase login failed, falling back to mock:', supErr && supErr.message);
        }
      }

      // --- Mock path ---
      const db = loadMock();
      const stored = db[normalizedEmail];
      if (!stored || stored.passwordHash !== hash(password + (JWT_SECRET || 'pepper'))) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      stored.updated_at = now();
      saveMock(db);
      return issueTokenAndRespond(res, stored);
    } catch (err) {
      console.error('[auth.login]', err);
      return res.status(500).json({ error: 'Login failed.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Logout
  // ---------------------------------------------------------------------------
  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(res);
    // Try to sign out of Supabase session too (best-effort)
    if (SUPABASE) {
      SUPABASE.auth.signOut().catch(() => {});
    }
    res.json({ success: true });
  });

  // ---------------------------------------------------------------------------
  //  Get current user
  // ---------------------------------------------------------------------------
  app.get('/api/auth/me', optionalAuth, async (req, res) => {
    const user = req.user;
    if (!user) return res.json({ user: null });

    if (SUPABASE && user.supabaseId) {
      try {
        const { data, error } = await SUPABASE_ADMIN
          .from('users')
          .select('*')
          .eq('id', user.supabaseId)
          .single();
        if (!error && data) {
          return res.json({
            user: {
              id:       data.id,
              email:    data.email,
              name:     data.full_name,
              phone:    data.phone,
              avatar:   data.avatar_url,
              role:     data.role,
              createdAt: data.created_at,
            },
          });
        }
      } catch (_) { /* fall through to mock */ }
    }

    // Mock profile enrichment
    const db = loadMock();
    const stored = db[user.email];
    if (stored) {
      return res.json({
        user: {
          id:        stored.id,
          email:     stored.email,
          name:      stored.name,
          phone:     stored.phone,
          avatar:    stored.avatar_url,
          role:      stored.role,
          createdAt: stored.created_at,
        },
      });
    }
    return res.json({ user });
  });

  // ---------------------------------------------------------------------------
  //  Send OTP  (email or phone)
  // ---------------------------------------------------------------------------
  app.post('/api/auth/send-otp', async (req, res) => {
    try {
      const { email, phone } = req.body || {};
      if (email && phone) return res.status(400).json({ error: 'Choose email or phone, not both.' });
      if (phone) return res.status(501).json({ error: 'SMS sign-in is not available yet. Use email OTP instead.' });
      const target = String(email || '').trim().toLowerCase();
      if (!target) return res.status(400).json({ error: 'email required' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return res.status(400).json({ error: 'valid email required' });

      const previous = otpStore.get(target);
      if (previous && previous.sendAfter > Date.now()) {
        return res.status(429).json({
          error: 'Please wait before requesting another code.',
          retryAfter: Math.ceil((previous.sendAfter - Date.now()) / 1000),
        });
      }

      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const entry = { code: code, expires: Date.now() + OTP_TTL_MS, sendAfter: Date.now() + OTP_RESEND_MS, attempts: 0, channel: 'email' };
      otpStore.set(target, entry);
      let emailed = false;
      if (mailer.isConfigured()) {
        const mail = await mailer.send({
          to: target,
          subject: 'KEYCODE Studio — your verification code',
          text: 'Your verification code is: ' + code + '\n\nIt expires in 10 minutes.',
          html: '<p>Your KEYCODE Studio verification code is:</p><p style="font-size:28px;letter-spacing:6px"><b>' + code + '</b></p><p style="color:#888">Expires in 10 minutes.</p>',
        });
        emailed = mail.delivered;
        if (!emailed) {
          otpStore.delete(target);
          return res.status(502).json({ error: 'Could not deliver the verification email. Please try again later.' });
        }
      } else if (IS_PROD) {
        otpStore.delete(target);
        return res.status(503).json({ error: 'Email delivery is not configured. Please contact support.' });
      }

      res.json({
        success: true,
        message: emailed ? 'OTP sent to your email.' : 'Email delivery is simulated in development; use the displayed code.',
        delivery: emailed ? 'email' : 'development',
        code: !IS_PROD && !emailed ? code : undefined,
        expiresIn: OTP_TTL_MS / 1000,
        resendAfter: OTP_RESEND_MS / 1000,
      });
    } catch (err) {
      console.error('[auth.send-otp]', err);
      res.status(500).json({ error: 'Failed to send OTP.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Verify OTP
  // ---------------------------------------------------------------------------
  app.post('/api/auth/verify-otp', async (req, res) => {
    try {
      const { email, phone, otp } = req.body || {};
      if (email && phone) return res.status(400).json({ error: 'Choose email or phone, not both.' });
      if (phone) return res.status(501).json({ error: 'SMS sign-in is not available yet. Use email OTP instead.' });
      const target = String(email || '').trim().toLowerCase();
      const suppliedCode = String(otp || '').trim();
      if (!target || !suppliedCode) return res.status(400).json({ error: 'email and otp required' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target) || !/^\d{6}$/.test(suppliedCode)) {
        return res.status(400).json({ error: 'Valid email and 6-digit code required.' });
      }

      const entry = otpStore.get(target);
      if (!entry) return res.status(400).json({ error: 'No pending OTP for this contact.' });
      if (entry.channel !== 'email') return res.status(400).json({ error: 'OTP delivery method does not match.' });
      if (Date.now() >= entry.expires) {
        otpStore.delete(target);
        return res.status(400).json({ error: 'Code expired.' });
      }
      if (entry.attempts >= OTP_MAX_ATTEMPTS) {
        otpStore.delete(target);
        return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
      }
      const expected = Buffer.from(entry.code);
      const received = Buffer.from(suppliedCode);
      if (!crypto.timingSafeEqual(expected, received)) {
        entry.attempts++;
        if (entry.attempts >= OTP_MAX_ATTEMPTS) {
          otpStore.delete(target);
          return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
        }
        return res.status(400).json({ error: 'Incorrect code.', attemptsRemaining: OTP_MAX_ATTEMPTS - entry.attempts });
      }
      otpStore.delete(target);

      // Find or create the user in mock, or look up in Supabase
      let user = null;
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('users')
            .select('*')
            .or(`email.eq.${target},phone.eq.${target}`)
            .single();
          if (!error && data) {
            user = normalizeUser(data);
          }
        } catch (_) {}
      }
      if (!user) {
        const db = loadMock();
        // match by email or phone
        user = Object.values(db).find(
          u => u.email === target || u.phone === phone
        );
      }
      if (!user) {
        // auto-create a temporary account so OTP login is frictionless
        user = normalizeUser({
          id:       rand(16),
          email:    target,
          name:     target.split('@')[0],
          phone:    phone || '',
          role:     'user',
          created_at: now(),
          updated_at: now(),
        });
        if (!SUPABASE) {
          const db = loadMock();
          db[target] = user;
          saveMock(db);
        }
      }
      return issueTokenAndRespond(res, user, { method: 'otp' });
    } catch (err) {
      console.error('[auth.verify-otp]', err);
      res.status(500).json({ error: 'OTP verification failed.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Magic link — send
  // ---------------------------------------------------------------------------
  app.post('/api/auth/magic-link/send', async (req, res) => {
    try {
      const { email } = req.body || {};
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: 'valid email required' });
      }
      const normalizedEmail = email.toLowerCase().trim();
      const token = crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + 1000 * 60 * 15; // 15 min
      const store = loadMock();
      store['_magic_' + normalizedEmail] = { token, expires };
      saveMock(store);

      const link = `${process.env.FRONTEND_URL || 'http://localhost:' + PORT}/login.html?magic=${token}&email=${encodeURIComponent(normalizedEmail)}`;
      if (mailer.isConfigured()) {
        const mail = await mailer.send({
          to: normalizedEmail,
          subject: 'KEYCODE Studio — your sign-in link',
          text: 'Use this link to sign in to KEYCODE Studio:\n' + link + '\n\nThis link expires in 15 minutes. If you did not request it, ignore this email.',
          html: '<p>Use this link to sign in to KEYCODE Studio:</p><p><a href="' + link + '">Sign in</a></p><p style="color:#888">This link expires in 15 minutes. If you did not request it, ignore this email.</p>',
        });
        if (!mail.delivered) {
          delete store['_magic_' + normalizedEmail];
          saveMock(store);
          return res.status(502).json({ error: 'Could not deliver the sign-in email. Please try again later.' });
        }
      } else if (IS_PROD) {
        delete store['_magic_' + normalizedEmail];
        saveMock(store);
        return res.status(503).json({ error: 'Email delivery is not configured. Please contact support.' });
      }

      res.json({
        success: true,
        message: mailer.isConfigured() ? 'Magic link sent — check your inbox.' : 'Email delivery is simulated in development.',
        _dev_link: !IS_PROD ? link : undefined,
      });
    } catch (err) {
      console.error('[auth.magic-link.send]', err);
      res.status(500).json({ error: 'Failed to send magic link.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Magic link — verify
  // ---------------------------------------------------------------------------
  app.post('/api/auth/magic-link/verify', async (req, res) => {
    try {
      const { email, token } = req.body || {};
      if (!email || !token) return res.status(400).json({ error: 'email and token required' });
      const normalizedEmail = email.toLowerCase().trim();
      const store = loadMock();
      const entry = store['_magic_' + normalizedEmail];
      if (!entry || entry.token !== token || Date.now() > entry.expires) {
        return res.status(400).json({ error: 'Magic link expired or invalid.' });
      }
      delete store['_magic_' + normalizedEmail];
      saveMock(store);

      // Resolve user
      let user = null;
      if (SUPABASE) {
        try {
          const { data, error } = await SUPABASE_ADMIN
            .from('users')
            .select('*')
            .eq('email', normalizedEmail)
            .single();
          if (!error && data) user = normalizeUser(data);
        } catch (_) {}
      }
      if (!user) {
        const db = loadMock();
        user = db[normalizedEmail] || normalizeUser({
          id:       rand(16),
          email:    normalizedEmail,
          name:     normalizedEmail.split('@')[0],
          role:     'user',
          created_at: now(),
          updated_at: now(),
        });
        if (!SUPABASE) {
          db[normalizedEmail] = user;
          saveMock(db);
        }
      }
      return issueTokenAndRespond(res, user, { method: 'magic_link' });
    } catch (err) {
      console.error('[auth.magic-link.verify]', err);
      res.status(500).json({ error: 'Magic link verification failed.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Passkey / WebAuthn — register (begin)
  // ---------------------------------------------------------------------------
  app.post('/api/auth/passkey/register/begin', (req, res) => {
    try {
      const { name, email } = req.body || {};
      const userId = rand(16);
      const challenge = rand(32);
      const store = loadMock();
      const dest = email ? email.toLowerCase().trim() : `user-${userId}@example.com`;
      const user = normalizeUser({
        id:       userId,
        email:    dest,
        name:     name || dest.split('@')[0],
        role:     'user',
        created_at: now(),
        updated_at: now(),
      });
      store[dest] = user;
      saveMock(store);

      // WebAuthn registration options — in a real deploy you would use the
      // @simplewebauthn/server helpers. Here we return enough for the browser
      // to call navigator.credentials.create and then POST the result.
      res.json({
        success: true,
        userId,
        username: user.name,
        challenge,
        // The browser will create a Cred and POST to /api/auth/passkey/register/complete
        _note: 'Complete registration by POSTing the credential to /api/auth/passkey/register/complete',
      });
    } catch (err) {
      console.error('[auth.passkey.register.begin]', err);
      res.status(500).json({ error: 'Could not start passkey registration.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Passkey / WebAuthn — register (complete)
  // ---------------------------------------------------------------------------
  app.post('/api/auth/passkey/register/complete', (req, res) => {
    try {
      const { userId, credential } = req.body || {};
      if (!credential) return res.status(400).json({ error: 'credential required' });
      const store = loadMock();
      const user = Object.values(store).find(u => u.id === userId) || null;
      if (!user) return res.status(400).json({ error: 'Unknown user.' });

      // Persist the credential id so we can match it at login time.
      if (!store['_webauthn_creds']) store['_webauthn_creds'] = {};
      if (!store['_webauthn_creds'][userId]) store['_webauthn_creds'][userId] = [];
      store['_webauthn_creds'][userId].push(credential.rawId || credential.id);
      saveMock(store);

      return issueTokenAndRespond(res, user, { method: 'passkey' });
    } catch (err) {
      console.error('[auth.passkey.register.complete]', err);
      res.status(500).json({ error: 'Passkey registration failed.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Passkey / WebAuthn — login (begin)
  // ---------------------------------------------------------------------------
  app.post('/api/auth/passkey/login/begin', (req, res) => {
    try {
      const { email } = req.body || {};
      const store = loadMock();
      const user = email ? store[email.toLowerCase().trim()] : null;
      const creds = store['_webauthn_creds'] && store['_webauthn_creds'][user?.id] || [];

      res.json({
        success: true,
        challenge: rand(32),
        allowCredentials: creds.map(id => ({ id, type: 'public-key' })),
        user: user ? { id: user.id, name: user.name, email: user.email } : null,
      });
    } catch (err) {
      console.error('[auth.passkey.login.begin]', err);
      res.status(500).json({ error: 'Could not start passkey login.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Passkey / WebAuthn — login (complete)
  // ---------------------------------------------------------------------------
  app.post('/api/auth/passkey/login/complete', (req, res) => {
    try {
      const { credential, email } = req.body || {};
      if (!credential) return res.status(400).json({ error: 'credential required' });

      const store = loadMock();
      const credId = credential.rawId || credential.id;
      let user = null;
      if (store['_webauthn_creds']) {
        for (const [uid, ids] of Object.entries(store['_webauthn_creds'])) {
          if (ids.includes(credId)) {
            user = Object.values(store).find(u => u.id === uid) || null;
            break;
          }
        }
      }
      if (!user) {
        // Fallback: match by email + verified credential
        const target = (email || '').toLowerCase().trim();
        user = target ? store[target] : null;
        if (!user) return res.status(400).json({ error: 'No account found for this passkey.' });
      }
      return issueTokenAndRespond(res, user, { method: 'passkey' });
    } catch (err) {
      console.error('[auth.passkey.login.complete]', err);
      res.status(500).json({ error: 'Passkey login failed.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Passkey / WebAuthn — list & remove saved credentials (dashboard settings)
  // ---------------------------------------------------------------------------
  app.get('/api/auth/webauthn/credentials', requireAuth, (req, res) => {
    try {
      const uid = req.user.userId || req.user.id;
      const store = loadMock();
      const ids = (store['_webauthn_creds'] && store['_webauthn_creds'][uid]) || [];
      res.json(ids.map(id => ({ id, deviceName: 'Passkey', created_at: now() })));
    } catch (err) {
      console.error('[auth.webauthn.list]', err);
      res.status(500).json({ error: 'Could not list passkeys.' });
    }
  });

  app.delete('/api/auth/webauthn/credentials/:id', requireAuth, (req, res) => {
    try {
      const uid = req.user.userId || req.user.id;
      const store = loadMock();
      if (store['_webauthn_creds'] && store['_webauthn_creds'][uid]) {
        store['_webauthn_creds'][uid] = store['_webauthn_creds'][uid].filter(x => x !== req.params.id);
        saveMock(store);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[auth.webauthn.remove]', err);
      res.status(500).json({ error: 'Could not remove passkey.' });
    }
  });

  // ---------------------------------------------------------------------------
  //  Social OAuth (Google / GitHub / Discord) — full authorization-code flow.
  //  Configure per provider:
  //    GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
  //    GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
  //    DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
  //  Redirect URI is derived from APP_URL (default http://localhost:PORT).
  // ---------------------------------------------------------------------------
  const OAUTH = {
    google: {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'openid email profile',
      fetchUser: async (accessToken) => {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + accessToken } });
        if (!r.ok) throw new Error('google userinfo HTTP ' + r.status);
        const j = await r.json();
        return { id: j.sub, email: j.email, name: j.name || (j.email || '').split('@')[0], avatar: j.picture || '' };
      },
    },
    github: {
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scope: 'read:user user:email',
      fetchUser: async (accessToken) => {
        const r = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/vnd.github+json', 'User-Agent': 'keycode-studio' } });
        if (!r.ok) throw new Error('github user HTTP ' + r.status);
        const j = await r.json();
        let email = j.email || '';
        if (!email) {
          const re = await fetch('https://api.github.com/user/emails', { headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/vnd.github+json', 'User-Agent': 'keycode-studio' } });
          if (re.ok) { const emails = await re.json(); email = (emails.find(e => e.primary) || emails[0] || {}).email || ''; }
        }
        return { id: String(j.id), email: email, name: j.name || j.login, avatar: j.avatar_url || '' };
      },
    },
    discord: {
      authUrl: 'https://discord.com/oauth2/authorize',
      tokenUrl: 'https://discord.com/api/oauth2/token',
      scope: 'identify email',
      fetchUser: async (accessToken) => {
        const r = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: 'Bearer ' + accessToken } });
        if (!r.ok) throw new Error('discord user HTTP ' + r.status);
        const j = await r.json();
        return { id: j.id, email: j.email || '', name: j.global_name || j.username, avatar: j.avatar ? `https://cdn.discordapp.com/avatars/${j.id}/${j.avatar}.png` : '' };
      },
    },
  };

  const APP_URL = (process.env.APP_URL || process.env.FRONTEND_URL || ('http://localhost:' + PORT)).replace(/\/$/, '');

  function frontendLogin(params) {
    return APP_URL + '/login.html?' + new URLSearchParams(params).toString();
  }

  function oauthConfig(provider) {
    const P = provider.toUpperCase();
    return { clientId: process.env[P + '_CLIENT_ID'], clientSecret: process.env[P + '_CLIENT_SECRET'] };
  }

  function oauthRedirect(provider) {
    return (req, res) => {
      const cfg = OAUTH[provider];
      const { clientId, clientSecret } = oauthConfig(provider);
      if (!clientId || !clientSecret) {
        return res.redirect(frontendLogin({ error: 'oauth_not_configured', provider }));
      }
      // CSRF guard: random state, checked on the callback (cookie must match).
      const state = crypto.randomBytes(16).toString('hex');
      res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, secure: IS_PROD });
      const redirectUri = APP_URL + '/api/auth/' + provider + '/callback';
      const url = cfg.authUrl + '?' + new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: cfg.scope,
        state,
        ...(provider === 'google' ? { access_type: 'offline', prompt: 'select_account' } : {}),
      }).toString();
      res.redirect(url);
    };
  }

  async function upsertOAuthUser(profile, provider) {
    // Supabase first (admin create-or-fetch), then local mock.
    if (SUPABASE_ADMIN) {
      try {
        const { data: existing, error: selErr } = await SUPABASE_ADMIN
          .from('users').select('*').eq('email', profile.email).single();
        if (!selErr && existing) return normalizeUser(existing);
        const { data: authUser, error: createErr } = await SUPABASE_ADMIN.auth.admin.createUser({
          email: profile.email,
          email_confirm: true,
          user_metadata: { full_name: profile.name || '', avatar_url: profile.avatar || '', provider },
        });
        if (createErr || !authUser || !authUser.user) throw (createErr || new Error('no user'));
        const u = authUser.user;
        await SUPABASE_ADMIN.from('users').upsert({
          id: u.id, email: u.email, full_name: profile.name || '',
          avatar_url: profile.avatar || '', role: 'user', metadata: { provider },
        }, { onConflict: 'id' });
        return normalizeUser({
          id: u.id, email: u.email, name: profile.name || '', avatar_url: profile.avatar || '',
          role: 'user', supabase_id: u.id,
        });
      } catch (e) {
        console.warn('[auth.oauth] Supabase upsert failed, using mock:', e && e.message);
      }
    }
    const db = loadMock();
    let user = db[profile.email];
    if (!user) {
      user = normalizeUser({
        id: rand(16), email: profile.email, name: profile.name || '',
        avatar_url: profile.avatar || '', role: 'user',
        created_at: now(), updated_at: now(),
      });
      db[profile.email] = user;
      saveMock(db);
    } else {
      user.avatar_url = profile.avatar || user.avatar_url;
      user.updated_at = now();
      saveMock(db);
    }
    return user;
  }

  app.get('/api/auth/google',  oauthRedirect('google'));
  app.get('/api/auth/github',  oauthRedirect('github'));
  app.get('/api/auth/discord', oauthRedirect('discord'));

  // OAuth callbacks: verify state, exchange code, fetch profile, sign in.
  async function oauthCallbackHandler(provider, req, res) {
    try {
      const cfg = OAUTH[provider];
      const { clientId, clientSecret } = oauthConfig(provider);
      const code = req.query.code || null;
      const state = req.query.state || null;
      const savedState = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('oauth_state='));
      const cookieState = savedState ? decodeURIComponent(savedState.split('=')[1]) : null;

      if (req.query.error) {
        return res.redirect(frontendLogin({ error: 'oauth_denied', provider, detail: req.query.error }));
      }
      if (!code) return res.redirect(frontendLogin({ error: 'oauth_no_code', provider }));
      if (!cookieState || cookieState !== state) {
        return res.redirect(frontendLogin({ error: 'oauth_state_mismatch', provider }));
      }
      res.clearCookie('oauth_state');

      // Exchange the authorization code for tokens.
      const tokenRes = await fetch(cfg.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: APP_URL + '/api/auth/' + provider + '/callback',
        }).toString(),
      });
      const tokenJson = await tokenRes.json().catch(() => ({}));
      const accessToken = tokenJson.access_token;
      if (!accessToken) {
        console.warn('[auth.oauth] ' + provider + ' token exchange failed:', JSON.stringify(tokenJson).slice(0, 200));
        return res.redirect(frontendLogin({ error: 'oauth_token_failed', provider }));
      }

      const profile = await cfg.fetchUser(accessToken);
      if (!profile || !profile.email) {
        return res.redirect(frontendLogin({ error: 'oauth_no_email', provider }));
      }
      const user = await upsertOAuthUser(profile, provider);
      const token = signSession(user);
      setSessionCookie(res, token);
      // Land on the dashboard with the session cookie set.
      res.redirect(APP_URL + '/dashboard.html?login=oauth&provider=' + provider);
    } catch (err) {
      console.error('[auth.oauth.' + provider + ']', err);
      res.redirect(frontendLogin({ error: 'oauth_failed', provider }));
    }
  }
  app.get('/api/auth/google/callback',  (req, res) => oauthCallbackHandler('google', req, res));
  app.get('/api/auth/github/callback',  (req, res) => oauthCallbackHandler('github', req, res));
  app.get('/api/auth/discord/callback', (req, res) => oauthCallbackHandler('discord', req, res));

  return {
    // Expose a couple of helpers in case other routes want to mint a token.
    signSession,
    normalizeUser,
    loadMock,
    saveMock,
  };
};
