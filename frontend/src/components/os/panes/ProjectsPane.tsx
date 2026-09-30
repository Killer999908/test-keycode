'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface AiProject {
  _id?: string;
  id?: string;
  name?: string;
  title?: string;
  prompt?: string;
  description?: string;
  status?: string;
  createdAt?: string;
  [k: string]: unknown;
}

/**
 * Projects — real user AI projects from GET /api/user/dashboard.
 * Auth matches the legacy os.js contract: Bearer token from localStorage.
 */
export default function ProjectsPane() {
  const [projects, setProjects] = useState<AiProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    setAuthed(Boolean(token));
    if (!token) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    fetch('/api/user/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (r.status === 401) throw new Error('unauthorized');
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!cancelled) setProjects(Array.isArray(j.aiProjects) ? j.aiProjects : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setProjects([]);
          setError(e.message === 'unauthorized' ? 'Session expired — sign in again on the main site.' : 'Could not load projects.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const label = (p: AiProject) => String(p.name ?? p.title ?? p.prompt ?? p.description ?? 'Untitled project').slice(0, 80);
  const when = (p: AiProject) => {
    if (!p.createdAt) return '';
    try {
      return new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="h-full overflow-y-auto os-scrollbar p-3 max-w-4xl mx-auto">
      <div className="os-panel px-4 py-2.5 flex items-center gap-3 mb-3 sticky top-0 z-10">
        <span className="text-[12px] text-white font-medium">Projects</span>
        <span className="text-[10.5px] font-mono text-[var(--os-text-faint)] ml-auto">
          {projects ? `${projects.length} saved` : 'GET /api/user/dashboard'}
        </span>
      </div>

      {projects === null && (
        <div className="os-panel p-8 text-center text-[12px] font-mono text-[var(--os-text-faint)]">
          <span className="os-loading-bar w-48 mx-auto" />
          <div className="mt-4">loading projects…</div>
        </div>
      )}

      {projects?.length === 0 && (
        <div className="os-panel p-10 text-center">
          <div className="os-display text-xl mb-2">
            <span className="os-grad-text">No projects yet</span>
          </div>
          <p className="text-[12px] text-[var(--os-text-dim)] max-w-sm mx-auto leading-relaxed">
            {authed === false
              ? 'Sign in on the main site, then builds you create here will show up in this list.'
              : error || 'Head to the Dashboard and describe something to build — your generated projects will appear here.'}
          </p>
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="grid md:grid-cols-2 gap-2.5">
          {projects.map((p, i) => (
            <motion.div
              key={String(p._id ?? p.id ?? i)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="os-panel os-panel-hover p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="text-[13px] text-white font-medium leading-snug">{label(p)}</span>
                {p.status && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 text-[var(--os-accent-3)] bg-[rgba(56,214,255,0.08)]">
                    {String(p.status)}
                  </span>
                )}
              </div>
              {when(p) && <div className="text-[10px] font-mono text-[var(--os-text-faint)]">{when(p)}</div>}
              {typeof p.description === 'string' && p.description && (
                <p className="mt-2 text-[11.5px] text-[var(--os-text-dim)] leading-relaxed line-clamp-3">{p.description}</p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
