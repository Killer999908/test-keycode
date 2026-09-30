'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface Overview {
  totalOrders?: number;
  completedOrders?: number;
  pendingOrders?: number;
  totalRevenue?: number;
  avgOrderValue?: number;
  totalProjects?: number;
  totalUsers?: number;
  [k: string]: unknown;
}

interface ActivityEvent {
  kind?: string;
  id?: string;
  title?: string;
  type?: string;
  status?: string;
  price?: number;
  paid?: boolean;
  date?: string;
  [k: string]: unknown;
}

const money = (n: number) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${n}`;
  }
};

const when = (iso?: string) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

/** Small inline bar chart for the 30-day order series. */
function DailyBars({ data }: { data: { _id: string; orders: number; revenue: number }[] }) {
  if (!data.length) return <div className="text-[11px] font-mono text-[var(--os-text-faint)]">no orders in the last 30 days</div>;
  const max = Math.max(...data.map((d) => d.orders), 1);
  return (
    <div className="flex items-end gap-[3px] h-24">
      {data.map((d) => (
        <div key={d._id} className="flex-1 flex flex-col items-center gap-1 group relative min-w-[4px]">
          <div
            className="w-full rounded-t-sm transition-all duration-500"
            style={{
              height: `${Math.max(6, (d.orders / max) * 100)}%`,
              background: 'linear-gradient(180deg, #6d7cff, rgba(109,124,255,0.25))',
            }}
          />
          <span className="absolute -top-6 hidden group-hover:block text-[9px] font-mono text-white bg-[#0b0e17] border border-[var(--os-border)] rounded px-1.5 py-0.5 whitespace-nowrap z-10">
            {d._id.slice(5)} · {d.orders}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Analytics — real backend wiring:
 *   GET /api/analytics/overview  → KPIs + 30-day series + project breakdown
 *   GET /api/analytics/activity  → merged project/order activity stream
 */
export default function AnalyticsPane() {
  const [overview, setOverview] = useState<{
    scope?: string;
    overview?: Overview;
    ordersByStatus?: Record<string, number>;
    projectBreakdown?: Record<string, number>;
    dailyOrders?: { _id: string; orders: number; revenue: number }[];
    recentActivity?: ActivityEvent[];
  } | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const token = localStorage.getItem('token') || '';
    setAuthed(Boolean(token));
    if (!token) {
      setError('sign in on the main site to see your build analytics');
      return;
    }
    setError(null);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [oRes, aRes] = await Promise.all([
        fetch('/api/analytics/overview', { headers }),
        fetch('/api/analytics/activity?limit=25', { headers }),
      ]);
      if (oRes.status === 401) {
        setError('Session expired — sign in again on the main site.');
        return;
      }
      const o = await oRes.json().catch(() => null);
      if (o?.success) setOverview(o);
      const a = await aRes.json().catch(() => null);
      if (a?.success) setActivity(Array.isArray(a.events) ? a.events : []);
    } catch {
      setError('could not reach the analytics service');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = overview?.overview
    ? (Object.entries(overview.overview) as [string, number | undefined][])
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => ({
          label: k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
          value: k.toLowerCase().includes('revenue') || k.toLowerCase().includes('value') ? money(v as number) : String(v),
        }))
    : [];

  return (
    <div className="h-full overflow-y-auto os-scrollbar p-3 max-w-4xl mx-auto space-y-3">
      <div className="os-panel px-4 py-2.5 flex items-center gap-3 sticky top-0 z-10">
        <span className="text-[12px] text-white font-medium">Analytics</span>
        {overview?.scope && (
          <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded text-[var(--os-accent-3)] bg-[rgba(56,214,255,0.08)]">
            scope: {overview.scope}
          </span>
        )}
        <span className="text-[10.5px] font-mono text-[var(--os-text-faint)] ml-auto">
          GET /api/analytics/overview · projects · activity
        </span>
      </div>

      {error && <div className="os-panel p-4 text-[12px] text-[var(--os-amber)] font-mono">⚠ {error}</div>}

      {!error && authed === false && (
        <div className="os-panel p-10 text-center">
          <div className="os-display text-xl mb-2">
            <span className="os-grad-text">Your telemetry, visualized</span>
          </div>
          <p className="text-[12px] text-[var(--os-text-dim)] max-w-sm mx-auto leading-relaxed">
            Sign in on the main site — orders, builds, and activity will chart here.
          </p>
        </div>
      )}

      {overview && (
        <>
          {/* KPI strip */}
          {kpis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {kpis.map((k, i) => (
                <motion.div
                  key={k.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.45 }}
                  className="os-panel p-3"
                >
                  <div className="text-[9px] tracking-[0.25em] uppercase text-[var(--os-text-faint)] mb-1 truncate">{k.label}</div>
                  <div className="text-xl font-mono text-white">{k.value}</div>
                </motion.div>
              ))}
            </div>
          )}

          {/* 30-day orders */}
          <div className="os-panel p-4">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">Orders · last 30 days</div>
            <DailyBars data={overview.dailyOrders ?? []} />
          </div>

          {/* Breakdowns */}
          <div className="grid md:grid-cols-2 gap-2.5">
            <div className="os-panel p-4">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">Orders by status</div>
              {Object.keys(overview.ordersByStatus ?? {}).length === 0 ? (
                <div className="text-[11px] font-mono text-[var(--os-text-faint)]">no data yet</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(overview.ordersByStatus ?? {}).map(([status, count]) => {
                    const total = Object.values(overview.ordersByStatus ?? {}).reduce((a, b) => a + b, 0) || 1;
                    return (
                      <div key={status}>
                        <div className="flex justify-between text-[11px] font-mono mb-1">
                          <span className="text-[var(--os-text-dim)]">{status}</span>
                          <span className="text-white">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.round((count / total) * 100)}%` }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                            className="h-full rounded-full"
                            style={{ background: 'linear-gradient(90deg, #6d7cff, #9b6dff)' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="os-panel p-4">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">Projects by type</div>
              {Object.keys(overview.projectBreakdown ?? {}).length === 0 ? (
                <div className="text-[11px] font-mono text-[var(--os-text-faint)]">no builds yet — try the AI Builder</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(overview.projectBreakdown ?? {}).map(([type, count]) => {
                    const total = Object.values(overview.projectBreakdown ?? {}).reduce((a, b) => a + b, 0) || 1;
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-[11px] font-mono mb-1">
                          <span className="text-[var(--os-text-dim)]">{type}</span>
                          <span className="text-white">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.round((count / total) * 100)}%` }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                            className="h-full rounded-full"
                            style={{ background: 'linear-gradient(90deg, #38d6ff, #34e0a1)' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Activity stream */}
          <div className="os-panel p-4">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">
              Activity {activity?.length ? `· ${activity.length}` : ''}
            </div>
            {activity === null ? (
              <div className="os-loading-bar w-48" />
            ) : activity.length === 0 ? (
              <div className="text-[12px] text-[var(--os-text-dim)]">Nothing yet — builds and orders will stream in here.</div>
            ) : (
              <div className="space-y-1.5">
                {activity.map((e, i) => (
                  <motion.div
                    key={String(e.id ?? i)}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.5), duration: 0.35 }}
                    className="flex items-center gap-2.5 text-[11.5px] py-1.5 border-b border-[rgba(255,255,255,0.04)] last:border-0"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        e.kind === 'order' ? 'bg-[var(--os-amber)]' : 'bg-[var(--os-accent)]'
                      }`}
                    />
                    <span className="text-white truncate max-w-56">{e.title ?? 'event'}</span>
                    <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-full border border-[var(--os-border)] text-[var(--os-text-faint)] shrink-0">
                      {e.kind ?? 'event'}
                    </span>
                    {e.status && <span className="font-mono text-[10px] text-[var(--os-text-faint)]">{e.status}</span>}
                    <span className="ml-auto font-mono text-[10px] text-[var(--os-text-faint)] shrink-0">{when(e.date)}</span>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
