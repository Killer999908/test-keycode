'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface Profile {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  emailVerified?: boolean;
  createdAt?: string;
  lastLogin?: string;
  avatar?: string;
  social?: { github?: string; twitter?: string; linkedin?: string; website?: string; instagram?: string; youtube?: string };
  [k: string]: unknown;
}

interface Preferences {
  theme?: string;
  locale?: string;
  timezone?: string;
  units?: string;
  defaultProjectType?: string;
  editor?: { fontSize?: number; tabSize?: number; wordWrap?: boolean };
  notifications?: { email?: boolean; push?: boolean; marketing?: boolean };
  [k: string]: unknown;
}

interface NotifPref {
  email?: boolean;
  push?: boolean;
  marketing?: boolean;
  [k: string]: unknown;
}

function Toggle({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 py-2 group text-left">
      <span
        className="w-9 h-5 rounded-full relative transition-colors shrink-0"
        style={{ background: on ? 'rgba(52,224,161,0.35)' : 'rgba(255,255,255,0.08)' }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
          style={{ left: on ? '18px' : '2px', background: on ? '#34e0a1' : 'rgba(255,255,255,0.4)' }}
        />
      </span>
      <span>
        <span className="block text-[12.5px] text-white">{label}</span>
        {hint && <span className="block text-[10px] text-[var(--os-text-faint)]">{hint}</span>}
      </span>
    </button>
  );
}

/**
 * Settings — real backend wiring:
 *   GET/PUT /api/settings/profile        → identity + social links (auth)
 *   GET/PUT /api/settings/preferences    → workspace prefs (auth)
 *   GET/PUT /api/settings/notifications  → notification toggles (auth)
 */
export default function SettingsPane() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [notif, setNotif] = useState<NotifPref | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // section key being saved
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('token') || '';
    setAuthed(Boolean(token));
    if (!token) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const headers = { 'Content-Type': 'application/json', ...authHeaders() };
      const [pRes, prRes, nRes] = await Promise.all([
        fetch('/api/settings/profile', { headers }),
        fetch('/api/settings/preferences', { headers }),
        fetch('/api/settings/notifications', { headers }),
      ]);
      if (pRes.status === 401) {
        setError('Session expired — sign in again on the main site.');
        setLoading(false);
        return;
      }
      const p = await pRes.json().catch(() => null);
      if (p?.success) setProfile(p.profile);
      const pr = await prRes.json().catch(() => null);
      if (pr?.success) setPrefs(pr.preferences);
      const n = await nRes.json().catch(() => null);
      if (n?.success) setNotif(n.notifications);
    } catch {
      setError('could not reach the settings service');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const saveProfile = useCallback(async () => {
    if (!profile || saving) return;
    setSaving('profile');
    setMsg(null);
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: profile.name,
          phone: profile.phone,
          avatar: profile.avatar,
          social: profile.social,
        }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.success) {
        setMsg({ ok: true, text: 'Profile saved.' });
        load();
      } else {
        setMsg({ ok: false, text: j?.error || `save failed (${res.status})` });
      }
    } catch {
      setMsg({ ok: false, text: 'could not reach the settings service' });
    } finally {
      setSaving(null);
    }
  }, [profile, saving, authHeaders, load]);

  const savePrefs = useCallback(async () => {
    if (!prefs || saving) return;
    setSaving('prefs');
    setMsg(null);
    try {
      const res = await fetch('/api/settings/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(prefs),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.success) {
        setMsg({ ok: true, text: 'Preferences saved.' });
      } else {
        setMsg({ ok: false, text: j?.error || `save failed (${res.status})` });
      }
    } catch {
      setMsg({ ok: false, text: 'could not reach the settings service' });
    } finally {
      setSaving(null);
    }
  }, [prefs, saving, authHeaders]);

  const saveNotif = useCallback(
    async (next: NotifPref) => {
      setNotif(next);
      setSaving('notif');
      setMsg(null);
      try {
        const res = await fetch('/api/settings/notifications', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ notifications: next }),
        });
        const j = await res.json().catch(() => null);
        if (!(res.ok && j?.success)) {
          setMsg({ ok: false, text: j?.error || 'notification save failed' });
        }
      } catch {
        setMsg({ ok: false, text: 'could not reach the settings service' });
      } finally {
        setSaving(null);
      }
    },
    [authHeaders]
  );

  const inputCls =
    'w-full bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[var(--os-text-faint)] outline-none focus:border-[var(--os-border-bright)] transition-colors';
  const labelCls = 'text-[9px] tracking-[0.25em] uppercase text-[var(--os-text-faint)] mb-1.5 block';

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-3">
        <div className="os-panel p-8 text-center w-full max-w-md">
          <div className="os-loading-bar w-48 mx-auto" />
          <div className="mt-4 text-[12px] font-mono text-[var(--os-text-faint)]">loading settings…</div>
        </div>
      </div>
    );
  }

  if (authed === false) {
    return (
      <div className="h-full flex items-center justify-center p-3">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="os-panel os-hud p-10 text-center max-w-sm"
        >
          <div className="os-display text-xl mb-2">
            <span className="os-grad-text">Settings</span>
          </div>
          <p className="text-[12px] text-[var(--os-text-dim)] leading-relaxed">
            Sign in on the main site to manage your profile, workspace preferences, and notifications.
          </p>
          <div className="os-loading-bar w-32 mx-auto mt-5" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto os-scrollbar p-3 max-w-4xl mx-auto space-y-3">
      <div className="os-panel px-4 py-2.5 flex items-center gap-3 sticky top-0 z-10">
        <span className="text-[12px] text-white font-medium">Settings</span>
        <span className="text-[10.5px] font-mono text-[var(--os-text-faint)] ml-auto">
          GET · PUT /api/settings/*
        </span>
      </div>

      {error && <div className="os-panel p-4 text-[12px] text-[var(--os-amber)] font-mono">⚠ {error}</div>}

      {msg && (
        <div className={`os-panel p-3 text-[11.5px] font-mono ${msg.ok ? 'text-[var(--os-green)]' : 'text-[var(--os-red)]'}`}>
          {msg.ok ? '✓ ' : '✗ '}
          {msg.text}
        </div>
      )}

      {/* Profile */}
      {profile && (
        <div className="os-panel p-4">
          <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">Profile</div>
          <div className="flex items-center gap-3 mb-4">
            <span
              className="w-12 h-12 rounded-xl flex items-center justify-center text-[16px] font-mono shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(109,124,255,0.3), rgba(155,109,255,0.2))', color: '#fff' }}
            >
              {(profile.name ?? '?').slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="text-[14px] text-white font-medium truncate">{profile.name}</div>
              <div className="text-[11px] font-mono text-[var(--os-text-faint)] truncate">{profile.email}</div>
              <div className="flex items-center gap-2 mt-1">
                {profile.role && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded text-[var(--os-accent-3)] bg-[rgba(56,214,255,0.08)]">
                    {profile.role}
                  </span>
                )}
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                    profile.emailVerified
                      ? 'text-[var(--os-green)] bg-[rgba(52,224,161,0.08)]'
                      : 'text-[var(--os-amber)] bg-[rgba(255,196,107,0.08)]'
                  }`}
                >
                  {profile.emailVerified ? 'verified' : 'unverified'}
                </span>
              </div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Display name</label>
              <input value={profile.name ?? ''} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={profile.phone ?? ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+1…" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Website</label>
              <input
                value={profile.social?.website ?? ''}
                onChange={(e) => setProfile({ ...profile, social: { ...profile.social, website: e.target.value } })}
                placeholder="https://…"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>GitHub</label>
              <input
                value={profile.social?.github ?? ''}
                onChange={(e) => setProfile({ ...profile, social: { ...profile.social, github: e.target.value } })}
                placeholder="github.com/…"
                className={inputCls}
              />
            </div>
          </div>
          <button
            onClick={saveProfile}
            disabled={saving === 'profile'}
            className="os-btn os-btn-primary text-[12px] px-4 mt-4 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving === 'profile' ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      )}

      {/* Workspace preferences */}
      {prefs && (
        <div className="os-panel p-4">
          <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">Workspace</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Default project type</label>
              <select
                value={prefs.defaultProjectType ?? 'web-app'}
                onChange={(e) => setPrefs({ ...prefs, defaultProjectType: e.target.value })}
                className={inputCls}
              >
                {['web-app', 'game', 'cad', 'pcb', 'mobile', 'backend'].map((t) => (
                  <option key={t} value={t} className="bg-[#0b0e17]">{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Units</label>
              <select value={prefs.units ?? 'metric'} onChange={(e) => setPrefs({ ...prefs, units: e.target.value })} className={inputCls}>
                {['metric', 'imperial'].map((u) => (
                  <option key={u} value={u} className="bg-[#0b0e17]">{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Editor font size · {prefs.editor?.fontSize ?? 14}px</label>
              <input
                type="range"
                min={10}
                max={22}
                value={prefs.editor?.fontSize ?? 14}
                onChange={(e) => setPrefs({ ...prefs, editor: { ...prefs.editor, fontSize: parseInt(e.target.value) } })}
                className="w-full accent-[var(--os-accent)]"
              />
            </div>
            <div>
              <label className={labelCls}>Editor tab size</label>
              <select
                value={prefs.editor?.tabSize ?? 2}
                onChange={(e) => setPrefs({ ...prefs, editor: { ...prefs.editor, tabSize: parseInt(e.target.value) } })}
                className={inputCls}
              >
                {[2, 4, 8].map((t) => (
                  <option key={t} value={t} className="bg-[#0b0e17]">{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2">
            <Toggle
              on={Boolean(prefs.editor?.wordWrap)}
              onClick={() => setPrefs({ ...prefs, editor: { ...prefs.editor, wordWrap: !prefs.editor?.wordWrap } })}
              label="Word wrap"
              hint="Wrap long lines in the code pane"
            />
          </div>
          <button
            onClick={savePrefs}
            disabled={saving === 'prefs'}
            className="os-btn os-btn-primary text-[12px] px-4 mt-3 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving === 'prefs' ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      )}

      {/* Notifications */}
      {notif && (
        <div className="os-panel p-4">
          <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-1">Notifications</div>
          <Toggle on={Boolean(notif.email)} onClick={() => saveNotif({ ...notif, email: !notif.email })} label="Email" hint="Build results, receipts, invites" />
          <Toggle on={Boolean(notif.push)} onClick={() => saveNotif({ ...notif, push: !notif.push })} label="Push" hint="Deploy status, agent events" />
          <Toggle on={Boolean(notif.marketing)} onClick={() => saveNotif({ ...notif, marketing: !notif.marketing })} label="Product updates" hint="Changelog and features" />
          {saving === 'notif' && <div className="text-[10.5px] font-mono text-[var(--os-text-faint)] mt-1">saving…</div>}
        </div>
      )}
    </div>
  );
}
