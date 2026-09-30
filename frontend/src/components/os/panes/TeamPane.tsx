'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface Team {
  _id?: string;
  name?: string;
  slug?: string;
  description?: string;
  owner?: { _id?: string; name?: string; email?: string } | string;
  [k: string]: unknown;
}

interface Invite {
  _id?: string;
  email?: string;
  role?: string;
  expiresAt?: string;
  team?: { name?: string; slug?: string } | string;
  [k: string]: unknown;
}

interface Member {
  _id?: string;
  role?: string;
  joinedAt?: string;
  user?: { _id?: string; name?: string; email?: string; avatar?: string } | string;
  [k: string]: unknown;
}

const ROLE_ORDER = ['owner', 'admin', 'member', 'viewer'];

/**
 * Team — real backend wiring:
 *   GET    /api/teams/me                       → current team + my role
 *   POST   /api/teams                          → create a team
 *   GET    /api/teams/invites                  → invites waiting for me
 *   POST   /api/teams/invites/:token/accept    → accept an invite
 *   POST   /api/teams/invites/:token/reject    → reject an invite
 *   POST   /api/teams/:teamId/invite           → invite by email (owner/admin)
 *   GET    /api/teams/:teamId/members          → member roster
 *   DELETE /api/teams/:teamId/members/:userId  → remove a member (owner/admin)
 */
export default function TeamPane() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // invite form
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState('member');
  const [inviting, setInviting] = useState(false);

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadMembers = useCallback(async (teamId: string) => {
    try {
      const res = await fetch(`/api/teams/${teamId}/members`, { headers: authHeaders() });
      const j = await res.json().catch(() => null);
      setMembers(j?.success && Array.isArray(j.members) ? j.members : []);
    } catch {
      setMembers([]);
    }
  }, [authHeaders]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('token') || '';
    setAuthed(Boolean(token));
    if (!token) {
      setTeam(null);
      setInvites([]);
      setMembers(null);
      setLoading(false);
      return;
    }
    try {
      const meRes = await fetch('/api/teams/me', { headers: authHeaders() });
      const me = await meRes.json().catch(() => null);
      if (me?.success) {
        setTeam(me.team ?? null);
        setMyRole(me.role ?? null);
        setIsOwner(Boolean(me.isOwner));
        if (me.team?._id) loadMembers(me.team._id);
        else setMembers(null);
      } else {
        setTeam(null);
        setMembers(null);
        if (meRes.status === 401) setError('Session expired — sign in again on the main site.');
      }

      const invRes = await fetch('/api/teams/invites', { headers: authHeaders() });
      const inv = await invRes.json().catch(() => null);
      setInvites(inv?.success && Array.isArray(inv.invites) ? inv.invites : []);
    } catch {
      setError('could not reach the team service');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, loadMembers]);

  useEffect(() => {
    load();
  }, [load]);

  const createTeam = useCallback(async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    setMsg(null);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 401) {
        setMsg({ ok: false, text: 'Sign in on the main site to create a team.' });
      } else if (res.status === 201 && j?.success) {
        setMsg({ ok: true, text: `Team "${j.team?.name}" created.` });
        setName('');
        setDesc('');
        load();
      } else {
        setMsg({ ok: false, text: j?.error || `create failed (${res.status})` });
      }
    } catch {
      setMsg({ ok: false, text: 'could not reach the team service' });
    } finally {
      setCreating(false);
    }
  }, [name, desc, creating, authHeaders, load]);

  const invite = useCallback(async () => {
    if (!team?._id || !invEmail.trim() || inviting) return;
    setInviting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/teams/${team._id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ email: invEmail.trim(), role: invRole }),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 401) {
        setMsg({ ok: false, text: 'Sign in to send invites.' });
      } else if (res.status === 201 && j?.success) {
        setMsg({ ok: true, text: `Invite sent to ${j.invite?.email ?? invEmail.trim()}.` });
        setInvEmail('');
      } else {
        setMsg({ ok: false, text: j?.error || `invite failed (${res.status})` });
      }
    } catch {
      setMsg({ ok: false, text: 'could not reach the team service' });
    } finally {
      setInviting(false);
    }
  }, [team, invEmail, invRole, inviting, authHeaders]);

  const respond = useCallback(
    async (token: string, accept: boolean) => {
      setMsg(null);
      try {
        const res = await fetch(`/api/teams/invites/${token}/${accept ? 'accept' : 'reject'}`, {
          method: 'POST',
          headers: authHeaders(),
        });
        const j = await res.json().catch(() => null);
        if (res.ok && j?.success) {
          setMsg({ ok: true, text: accept ? `Joined ${j.team?.name ?? 'the team'}.` : 'Invite rejected.' });
          load();
        } else {
          setMsg({ ok: false, text: j?.error || 'invite response failed' });
        }
      } catch {
        setMsg({ ok: false, text: 'could not reach the team service' });
      }
    },
    [authHeaders, load]
  );

  const removeMember = useCallback(
    async (userId: string) => {
      if (!team?._id) return;
      setMsg(null);
      try {
        const res = await fetch(`/api/teams/${team._id}/members/${userId}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        const j = await res.json().catch(() => null);
        if (res.ok && j?.success) {
          setMsg({ ok: true, text: 'Member removed.' });
          loadMembers(String(team._id));
        } else {
          setMsg({ ok: false, text: j?.error || 'remove failed' });
        }
      } catch {
        setMsg({ ok: false, text: 'could not reach the team service' });
      }
    },
    [team, authHeaders, loadMembers]
  );

  const canManage = isOwner || myRole === 'admin';
  const userName = (u: Member['user']) => (u && typeof u !== 'string' ? u.name || u.email || 'unknown' : 'unknown');
  const userId = (u: Member['user']) => (u && typeof u !== 'string' ? String(u._id ?? '') : '');
  const teamName = (t: Invite['team']) => (t && typeof t !== 'string' ? t.name : 'a team');

  return (
    <div className="h-full overflow-y-auto os-scrollbar p-3 max-w-4xl mx-auto space-y-3">
      <div className="os-panel px-4 py-2.5 flex items-center gap-3 sticky top-0 z-10">
        <span className="text-[12px] text-white font-medium">Team</span>
        <span className="text-[10.5px] font-mono text-[var(--os-text-faint)] ml-auto">
          /api/teams · invites · members
        </span>
      </div>

      {error && <div className="os-panel p-4 text-[12px] text-[var(--os-amber)] font-mono">⚠ {error}</div>}

      {msg && (
        <div className={`os-panel p-3 text-[11.5px] font-mono ${msg.ok ? 'text-[var(--os-green)]' : 'text-[var(--os-red)]'}`}>
          {msg.ok ? '✓ ' : '✗ '}
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="os-panel p-8 text-center">
          <div className="os-loading-bar w-48 mx-auto" />
          <div className="mt-4 text-[12px] font-mono text-[var(--os-text-faint)]">loading team…</div>
        </div>
      ) : authed === false ? (
        <div className="os-panel p-10 text-center">
          <div className="os-display text-xl mb-2">
            <span className="os-grad-text">Teams are one sign-in away</span>
          </div>
          <p className="text-[12px] text-[var(--os-text-dim)] max-w-sm mx-auto leading-relaxed">
            Sign in on the main site to create a team, invite collaborators, and manage roles.
          </p>
        </div>
      ) : (
        <>
          {/* Pending invites */}
          {invites !== null && invites.length > 0 && (
            <div className="os-panel p-4">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">
                Invitations · {invites.length}
              </div>
              <div className="space-y-2">
                {invites.map((inv, i) => (
                  <motion.div
                    key={String(inv._id ?? i)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.35 }}
                    className="rounded-lg border border-[rgba(109,124,255,0.3)] bg-[rgba(109,124,255,0.06)] px-3.5 py-2.5 flex items-center gap-3 flex-wrap"
                  >
                    <span className="text-[12.5px] text-white">{teamName(inv.team)}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-[var(--os-accent-3)] bg-[rgba(56,214,255,0.08)]">
                      {inv.role ?? 'member'}
                    </span>
                    <span className="ml-auto flex gap-1.5">
                      <button
                        onClick={() => inv._id && respond(String((inv as { token?: string }).token ?? ''), true)}
                        className="os-btn os-btn-primary text-[11px] px-3 py-1"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => inv._id && respond(String((inv as { token?: string }).token ?? ''), false)}
                        className="os-btn text-[11px] px-3 py-1 text-[var(--os-text-dim)]"
                      >
                        Reject
                      </button>
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {team ? (
            <>
              {/* Current team */}
              <div className="os-panel p-4">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="text-[15px] text-white font-medium">{team.name}</span>
                  {myRole && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded text-[var(--os-accent-3)] bg-[rgba(56,214,255,0.08)]">
                      you: {myRole}
                    </span>
                  )}
                </div>
                {team.description && <p className="text-[11.5px] text-[var(--os-text-dim)] leading-relaxed">{team.description}</p>}
              </div>

              {/* Invite form (owner/admin only) */}
              {canManage && (
                <div className="os-panel p-4">
                  <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">Invite a collaborator</div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={invEmail}
                      onChange={(e) => setInvEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && invite()}
                      placeholder="teammate@email.com"
                      className="flex-1 min-w-48 bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[var(--os-text-faint)] outline-none focus:border-[var(--os-border-bright)] transition-colors"
                    />
                    <select
                      value={invRole}
                      onChange={(e) => setInvRole(e.target.value)}
                      className="bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[12.5px] text-white outline-none focus:border-[var(--os-border-bright)] transition-colors"
                    >
                      {['admin', 'member', 'viewer'].map((r) => (
                        <option key={r} value={r} className="bg-[#0b0e17]">{r}</option>
                      ))}
                    </select>
                    <button
                      onClick={invite}
                      disabled={!invEmail.trim() || inviting}
                      className="os-btn os-btn-primary text-[12px] px-4 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {inviting ? '…' : 'Send invite'}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] font-mono text-[var(--os-text-faint)]">
                    invite expires in 7 days · email delivery via the studio mailer
                  </p>
                </div>
              )}

              {/* Members */}
              <div className="os-panel p-4">
                <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">
                  Members {members ? `· ${members.length}` : ''}
                </div>
                {members === null ? (
                  <div className="os-loading-bar w-48" />
                ) : members.length === 0 ? (
                  <div className="text-[12px] text-[var(--os-text-dim)]">No members found.</div>
                ) : (
                  <div className="space-y-2">
                    {[...members]
                      .sort((a, b) => ROLE_ORDER.indexOf(a.role ?? 'member') - ROLE_ORDER.indexOf(b.role ?? 'member'))
                      .map((m, i) => {
                        const uid = userId(m.user);
                        const removable = canManage && uid && uid !== String(team.owner && typeof team.owner !== 'string' ? team.owner._id ?? '' : '') && m.role !== 'owner';
                        return (
                          <motion.div
                            key={String(m._id ?? uid ?? i)}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04, duration: 0.35 }}
                            className="rounded-lg border border-[var(--os-border)] bg-[rgba(255,255,255,0.02)] px-3.5 py-2.5 flex items-center gap-3"
                          >
                            <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-mono shrink-0"
                              style={{ background: 'rgba(109,124,255,0.14)', color: 'var(--os-accent)' }}>
                              {userName(m.user).slice(0, 2).toUpperCase()}
                            </span>
                            <span className="text-[12.5px] text-white truncate">{userName(m.user)}</span>
                            <span
                              className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded ${
                                m.role === 'owner'
                                  ? 'text-[var(--os-amber)] bg-[rgba(255,196,107,0.08)]'
                                  : m.role === 'admin'
                                  ? 'text-[var(--os-accent-3)] bg-[rgba(56,214,255,0.08)]'
                                  : 'text-[var(--os-text-faint)] bg-[rgba(255,255,255,0.04)]'
                              }`}
                            >
                              {m.role ?? 'member'}
                            </span>
                            {removable && (
                              <button
                                onClick={() => removeMember(uid)}
                                className="ml-auto text-[10.5px] font-mono text-[var(--os-red)] hover:opacity-70 transition-opacity"
                              >
                                remove ✕
                              </button>
                            )}
                          </motion.div>
                        );
                      })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Create team */
            <div className="os-panel p-4">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">Create a team</div>
              <div className="space-y-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Team name — e.g. Orbital Labs"
                  className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[var(--os-text-faint)] outline-none focus:border-[var(--os-border-bright)] transition-colors"
                />
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={2}
                  placeholder="What does this team build? (optional)"
                  className="w-full bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[var(--os-text-faint)] outline-none resize-none focus:border-[var(--os-border-bright)] transition-colors"
                />
                <button
                  onClick={createTeam}
                  disabled={!name.trim() || creating}
                  className="os-btn os-btn-primary text-[12px] px-4 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating…' : 'Create team'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
