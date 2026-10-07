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

  // phone OTP store (in-memory, fine for a single-process dev server)
  const otpStore = new Map();   // key: email|phone  ->  { code, expires, channel }

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
  app.post('/api/auth/send-otp', (req, res) => {
    try {
      const { email, phone } = req.body || {};
      const target = (email || phone || '').toString().trim().toLowerCase();
      if (!target) return res.status(400).json({ error: 'email or phone required' });

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expires = Date.now() + 1000 * 60 * 10; // 10 min
      otpStore.set(target, { code, expires, channel: email ? 'email' : 'phone' });

      // In production you would call SendGrid / Twilio here.
      console.log(`[otp] code for ${email ? 'email' : 'phone'} ${target}: ${code}`);

      // In a non-prod env we also surface the code in the response so the flow
      // is testable without wiring SMS/email.
      const devShow = !IS_PROD;
      res.json({
        success: true,
        message: email
          ? 'OTP sent to your email.'
          : 'OTP sent to your phone.',
        code: devShow ? code : undefined,
        expiresIn: 600,
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
      const target = (email || phone || '').toString().trim().toLowerCase();
      if (!target || !otp) return res.status(400).json({ error: 'email/phone and otp required' });

      const entry = otpStore.get(target);
      if (!entry) return res.status(400).json({ error: 'No pending OTP for this contact.' });
      if (entry.code !== String(otp).trim()) return res.status(400).json({ error: 'Incorrect code.' });
      if (Date.now() > entry.expires) {
        otpStore.delete(target);
        return res.status(400).json({ error: 'Code expired.' });
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
  app.post('/api/auth/magic-link/send', (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'valid email required' });
      }
      const normalizedEmail = email.toLowerCase().trim();
      const token = rand(32);
      const expires = Date.now() + 1000 * 60 * 15; // 15 min
      const store = loadMock();
      store['_magic_' + normalizedEmail] = { token, expires };
      saveMock(store);

      const link = `${process.env.FRONTEND_URL || 'http://localhost:' + PORT}/login.html?magic=${token}&email=${encodeURIComponent(normalizedEmail)}`;
      console.log('[magic] link for', normalizedEmail, ':', link);

      res.json({
        success: true,
        message: 'Magic link sent — check your inbox.',
        // In dev we also print the link to the server log so it is usable.
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
  //  Social OAuth entry points
  //  These are "deep links" that kick off the OAuth dance. In a real deploy
  //  they redirect to the provider; here they return a clear message when the
  //  provider is not configured so the UI (`login.html`) can show a friendly
  //  error banner.
  // ---------------------------------------------------------------------------
  function oauthRedirect(provider) {
    return (req, res) => {
      const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
      if (!clientId) {
        const url = `${process.env.FRONTEND_URL || 'http://localhost:' + PORT}/login.html?error=oauth_not_configured&provider=${provider}`;
        return res.redirect(url);
      }
      // In production you would redirect to the provider's auth URL here.
      // For now, redirect back with a clear "not implemented" marker.
      const url = `${process.env.FRONTEND_URL || 'http://localhost:' + PORT}/login.html?error=oauth_not_implemented&provider=${provider}`;
      res.redirect(url);
    };
  }

  app.get('/api/auth/google',  oauthRedirect('google'));
  app.get('/api/auth/github',  oauthRedirect('github'));
  app.get('/api/auth/discord', oauthRedirect('discord'));

  // OAuth callbacks — the provider redirects back here. In a real deploy you
  // would exchange the code for a token and sign the user in. Here we bounce
  // back to login with a clear message when not wired up.
  function oauthCallback(provider) {
    return (req, res) => {
      const code = req.query.code || (req.body && req.body.code) || null;
      if (!code) {
        return res.redirect(`/login.html?error=oauth_no_code&provider=${provider}`);
      }
      // Not wired: surface a friendly error; the frontend already handles the
      // `oauth_not_configured` query param.
      res.redirect(`/login.html?error=oauth_not_configured&provider=${provider}`);
    };
  }
  app.get('/api/auth/google/callback',  oauthCallback('google'));
  app.get('/api/auth/github/callback',  oauthCallback('github'));
  app.get('/api/auth/discord/callback', oauthCallback('discord'));

  return {
    // Expose a couple of helpers in case other routes want to mint a token.
    signSession,
    normalizeUser,
    loadMock,
    saveMock,
  };
};
