'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface Provider {
  id: string;
  name: string;
  icon?: string;
  free?: boolean;
  limits?: string;
  available?: boolean;
  comingSoon?: boolean;
  urlExample?: string;
}

interface Order {
  _id?: string;
  orderNumber?: string;
  project?: { name?: string; description?: string; fileId?: string };
  hosting?: { name?: string; id?: string };
  status?: string;
  paymentStatus?: string;
  createdAt?: string;
  deployment?: { deployed?: boolean; liveUrl?: string; providerName?: string; deployedAt?: string };
  [k: string]: unknown;
}

/**
 * Deployments — real backend wiring:
 *  GET /api/ai/hosting-providers → provider fleet status (token configured?)
 *  GET /api/user/dashboard       → recent orders incl. deployment info (auth)
 *  POST /api/ai/launch           → launch a generated project by fileId
 */
export default function DeploymentsPane() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileId, setFileId] = useState('');
  const [providerId, setProviderId] = useState('vercel');
  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const pRes = await fetch('/api/ai/hosting-providers').then((r) => r.json());
      setProviders(Array.isArray(pRes.all) ? pRes.all : Array.isArray(pRes.providers) ? pRes.providers : []);
    } catch {
      setError('could not reach the deploy service');
    }
    try {
      const token = localStorage.getItem('token') || '';
      if (token) {
        const dRes = await fetch('/api/user/dashboard', { headers: { Authorization: `Bearer ${token}` } });
        if (dRes.ok) {
          const j = await dRes.json();
          setOrders(Array.isArray(j.orders) ? j.orders : []);
        } else {
          setOrders([]);
        }
      } else {
        setOrders([]);
      }
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const launch = useCallback(async () => {
    const id = fileId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id || launching) return;
    setLaunching(true);
    setLaunchMsg(null);
    try {
      const res = await fetch('/api/ai/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: id, provider: providerId, planId: 'free' }),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 404) {
        setLaunchMsg({ ok: false, text: 'No generated project with that fileId — generate one in the AI Builder first.' });
      } else if (j?.success && (j.deployment?.liveUrl || j.liveUrl)) {
        const url = j.deployment?.liveUrl || j.liveUrl;
        setLaunchMsg({ ok: true, text: `Live at ${url}` });
        load();
      } else if (j?.success) {
        setLaunchMsg({ ok: true, text: j.message || 'Deployment accepted.' });
        load();
      } else {
        setLaunchMsg({ ok: false, text: j?.error || `launch failed (${res.status})` });
      }
    } catch {
      setLaunchMsg({ ok: false, text: 'could not reach the deploy service' });
    } finally {
      setLaunching(false);
    }
  }, [fileId, providerId, launching, load]);

  const when = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="h-full overflow-y-auto os-scrollbar p-3 max-w-4xl mx-auto space-y-3">
      <div className="os-panel px-4 py-2.5 flex items-center gap-3 sticky top-0 z-10">
        <span className="text-[12px] text-white font-medium">Deployments</span>
        <span className="text-[10.5px] font-mono text-[var(--os-text-faint)] ml-auto">
          /api/ai/hosting-providers · /api/ai/launch
        </span>
      </div>

      {error && <div className="os-panel p-4 text-[12px] text-[var(--os-amber)] font-mono">⚠ {error}</div>}

      {/* Provider fleet */}
      <div className="os-panel p-4">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">Hosting fleet</div>
        {providers === null ? (
          <div className="os-loading-bar w-48" />
        ) : (
          <div className="grid sm:grid-cols-2 gap-2.5">
            {providers.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.45 }}
                className="rounded-xl border border-[var(--os-border)] bg-[rgba(255,255,255,0.02)] p-3.5"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">{p.icon || '▲'}</span>
                  <span className="text-[13px] text-white font-medium">{p.name}</span>
                  {p.comingSoon ? (
                    <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded text-[var(--os-text-faint)] bg-[rgba(255,255,255,0.04)]">
                      soon
                    </span>
                  ) : p.available ? (
                    <span className="ml-auto flex items-center gap-1.5 text-[9px] font-mono text-[var(--os-green)]">
                      <span className="os-live-dot" /> ready
                    </span>
                  ) : (
                    <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded text-[var(--os-amber)] bg-[rgba(255,196,107,0.08)]">
                      needs token
                    </span>
                  )}
                </div>
                {p.limits && <div className="text-[10.5px] text-[var(--os-text-faint)] font-mono">{p.limits}</div>}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Launch form */}
      <div className="os-panel p-4">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">Launch a project</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={fileId}
            onChange={(e) => setFileId(e.target.value)}
            placeholder="fileId from a generated project…"
            className="flex-1 min-w-48 bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[13px] font-mono text-white placeholder:text-[var(--os-text-faint)] outline-none focus:border-[var(--os-border-bright)] transition-colors"
          />
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[12.5px] text-white outline-none focus:border-[var(--os-border-bright)] transition-colors"
          >
            {(providers ?? [])
              .filter((p) => !p.comingSoon)
              .map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0b0e17]">
                  {p.name}
                </option>
              ))}
          </select>
          <button
            onClick={launch}
            disabled={!fileId.trim() || launching}
            className="os-btn os-btn-primary text-[12px] px-4 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {launching ? 'Deploying…' : 'Launch ↗'}
          </button>
        </div>
        {launchMsg && (
          <div className={`mt-2.5 text-[11.5px] font-mono break-all ${launchMsg.ok ? 'text-[var(--os-green)]' : 'text-[var(--os-red)]'}`}>
            {launchMsg.ok ? '✓ ' : '✗ '}
            {launchMsg.text}
          </div>
        )}
      </div>

      {/* Recent orders / deployment history */}
      <div className="os-panel p-4">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">
          Recent orders {orders?.length ? `· ${orders.length}` : ''}
        </div>
        {orders === null ? (
          <div className="os-loading-bar w-48" />
        ) : orders.length === 0 ? (
          <div className="text-[12px] text-[var(--os-text-dim)] leading-relaxed">
            No deployments yet. Generate a project, then launch it above — or sign in to see your order history.
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((o, i) => (
              <motion.div
                key={String(o._id ?? o.orderNumber ?? i)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35 }}
                className="rounded-lg border border-[var(--os-border)] bg-[rgba(255,255,255,0.02)] px-3.5 py-2.5 flex items-center gap-3 flex-wrap"
              >
                <span className="text-[12px] font-mono text-[var(--os-amber)]">{o.orderNumber}</span>
                <span className="text-[12px] text-white truncate max-w-48">{o.project?.name || o.project?.description || 'project'}</span>
                {o.deployment?.liveUrl ? (
                  <a
                    href={o.deployment.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-mono text-[var(--os-accent-3)] hover:underline truncate max-w-56"
                  >
                    {o.deployment.liveUrl.replace(/^https?:\/\//, '')} ↗
                  </a>
                ) : (
                  <span className="text-[10.5px] font-mono text-[var(--os-text-faint)]">not deployed</span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  {o.hosting?.name && (
                    <span className="text-[9.5px] px-1.5 py-0.5 rounded-full border border-[var(--os-border)] text-[var(--os-text-faint)]">
                      {o.hosting.name}
                    </span>
                  )}
                  {o.status && (
                    <span
                      className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded ${
                        o.status === 'completed'
                          ? 'text-[var(--os-green)] bg-[rgba(52,224,161,0.08)]'
                          : 'text-[var(--os-text-dim)] bg-[rgba(255,255,255,0.04)]'
                      }`}
                    >
                      {o.status}
                    </span>
                  )}
                  {when(o.createdAt) && <span className="text-[10px] font-mono text-[var(--os-text-faint)]">{when(o.createdAt)}</span>}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
