'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface Listing {
  _id?: string;
  slug: string;
  title: string;
  description?: string;
  category?: string;
  price: number;
  currency?: string;
  image?: string;
  tags?: string[];
  stock?: number; // -1 = unlimited
  [k: string]: unknown;
}

interface MyOrder {
  _id?: string;
  quantity?: number;
  total?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
  listing?: { slug?: string; title?: string; price?: number; image?: string; category?: string } | string;
  [k: string]: unknown;
}

const money = (n: number, currency = 'USD') => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
  } catch {
    return `$${n}`;
  }
};

/**
 * Marketplace — real backend wiring:
 *   GET  /api/marketplace/list        → active listings (public)
 *   POST /api/marketplace/purchase    → create an order (auth)
 *   GET  /api/marketplace/my-orders   → order history (auth)
 */
export default function MarketplacePane() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [buying, setBuying] = useState<string | null>(null); // slug being purchased
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const [orders, setOrders] = useState<MyOrder[] | null>(null);

  const loadListings = useCallback(async (cat: string, q: string) => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cat) params.set('category', cat);
      if (q) params.set('search', q);
      const res = await fetch(`/api/marketplace/list?${params.toString()}`);
      const j = await res.json().catch(() => null);
      if (j?.success) {
        setListings(Array.isArray(j.listings) ? j.listings : []);
      } else {
        setError(j?.error || 'marketplace unavailable');
        setListings([]);
      }
    } catch {
      setError('could not reach the marketplace service');
      setListings([]);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    const token = localStorage.getItem('token') || '';
    if (!token) {
      setOrders([]);
      return;
    }
    try {
      const res = await fetch('/api/marketplace/my-orders', { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json().catch(() => null);
      setOrders(j?.success && Array.isArray(j.orders) ? j.orders : []);
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    setAuthed(Boolean(localStorage.getItem('token')));
  }, []);

  useEffect(() => {
    loadListings(category, search.trim());
  }, [category, search, loadListings]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const openBuy = (slug: string) => {
    setBuying(slug);
    setQty(1);
    setMsg(null);
  };

  const purchase = useCallback(
    async (slug: string) => {
      if (buying) return;
      setBuying(slug);
      setMsg(null);
      try {
        const token = localStorage.getItem('token') || '';
        const res = await fetch('/api/marketplace/purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ slug, quantity: qty }),
        });
        const j = await res.json().catch(() => null);
        if (res.status === 401) {
          setMsg({ ok: false, text: 'Sign in on the main site to purchase.' });
        } else if (res.status === 201 && j?.success) {
          setMsg({ ok: true, text: `Order placed — status ${j.order?.status ?? 'pending'}.` });
          loadOrders();
        } else {
          setMsg({ ok: false, text: j?.error || `purchase failed (${res.status})` });
        }
      } catch {
        setMsg({ ok: false, text: 'could not reach the marketplace service' });
      } finally {
        setBuying(null);
      }
    },
    [buying, qty, loadOrders]
  );

  const categories = Array.from(new Set((listings ?? []).map((l) => l.category).filter(Boolean))) as string[];

  const listingTitle = (o: MyOrder) => {
    const l = o.listing;
    if (!l) return 'listing removed';
    return typeof l === 'string' ? l : l.title || l.slug || 'listing';
  };

  return (
    <div className="h-full overflow-y-auto os-scrollbar p-3 max-w-4xl mx-auto space-y-3">
      <div className="os-panel px-4 py-2.5 flex items-center gap-3 sticky top-0 z-10">
        <span className="text-[12px] text-white font-medium">Marketplace</span>
        <span className="text-[10.5px] font-mono text-[var(--os-text-faint)] ml-auto">
          GET /api/marketplace/list · POST /api/marketplace/purchase
        </span>
      </div>

      {error && <div className="os-panel p-4 text-[12px] text-[var(--os-amber)] font-mono">⚠ {error}</div>}

      {/* Filters */}
      <div className="os-panel p-4">
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search listings…"
            className="flex-1 min-w-48 bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[var(--os-text-faint)] outline-none focus:border-[var(--os-border-bright)] transition-colors"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[12.5px] text-white outline-none focus:border-[var(--os-border-bright)] transition-colors"
          >
            <option value="" className="bg-[#0b0e17]">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c} className="bg-[#0b0e17]">{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Listings grid */}
      {listings === null ? (
        <div className="os-panel p-8 text-center">
          <div className="os-loading-bar w-48 mx-auto" />
          <div className="mt-4 text-[12px] font-mono text-[var(--os-text-faint)]">loading marketplace…</div>
        </div>
      ) : listings.length === 0 ? (
        <div className="os-panel p-10 text-center">
          <div className="os-display text-xl mb-2">
            <span className="os-grad-text">Nothing listed yet</span>
          </div>
          <p className="text-[12px] text-[var(--os-text-dim)] max-w-sm mx-auto leading-relaxed">
            Active listings appear here. Admins can seed the catalog from the control panel.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2.5">
          {listings.map((l, i) => (
            <motion.div
              key={l.slug}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="os-panel os-panel-hover p-4 flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="text-[13px] text-white font-medium leading-snug">{l.title}</span>
                <span className="text-[13px] font-mono text-[var(--os-green)] shrink-0">{money(l.price, l.currency)}</span>
              </div>
              {l.description && (
                <p className="text-[11.5px] text-[var(--os-text-dim)] leading-relaxed line-clamp-2 mb-2">{l.description}</p>
              )}
              <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                {l.category && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-[var(--os-border)] text-[var(--os-text-faint)]">
                    {l.category}
                  </span>
                )}
                {(l.tags ?? []).slice(0, 3).map((t) => (
                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full border border-[var(--os-border)] text-[var(--os-text-faint)]">
                    {t}
                  </span>
                ))}
                {typeof l.stock === 'number' && l.stock >= 0 && (
                  <span className="text-[9px] font-mono text-[var(--os-text-faint)] ml-auto">{l.stock} in stock</span>
                )}
              </div>
              <button
                onClick={() => openBuy(l.slug)}
                className="os-btn os-btn-primary text-[11.5px] px-3 py-1.5 mt-3 self-start disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={buying === l.slug}
              >
                {buying === l.slug ? '…' : 'Purchase'}
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Buy bar: quantity + confirm for the selected listing */}
      {buying && (
        <div className="os-panel p-4">
          <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">Checkout — {buying}</div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11.5px] text-[var(--os-text-dim)] font-mono">qty</label>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 bg-[rgba(255,255,255,0.03)] border border-[var(--os-border)] rounded-lg px-3 py-2 text-[13px] font-mono text-white outline-none focus:border-[var(--os-border-bright)] transition-colors"
            />
            <button onClick={() => purchase(buying)} className="os-btn os-btn-primary text-[12px] px-4">
              Confirm order
            </button>
            <button onClick={() => setBuying(null)} className="os-btn text-[12px] px-3 text-[var(--os-text-dim)]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className={`os-panel p-3 text-[11.5px] font-mono ${msg.ok ? 'text-[var(--os-green)]' : 'text-[var(--os-red)]'}`}>
          {msg.ok ? '✓ ' : '✗ '}
          {msg.text}
        </div>
      )}

      {/* My orders */}
      <div className="os-panel p-4">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--os-text-faint)] mb-3">
          My orders {orders?.length ? `· ${orders.length}` : ''}
        </div>
        {orders === null ? (
          <div className="os-loading-bar w-48" />
        ) : orders.length === 0 ? (
          <div className="text-[12px] text-[var(--os-text-dim)] leading-relaxed">
            {authed === false
              ? 'Sign in on the main site — your purchase history will appear here.'
              : 'No orders yet. Purchases you make above will show up in this list.'}
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((o, i) => (
              <motion.div
                key={String(o._id ?? i)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35 }}
                className="rounded-lg border border-[var(--os-border)] bg-[rgba(255,255,255,0.02)] px-3.5 py-2.5 flex items-center gap-3 flex-wrap"
              >
                <span className="text-[12px] text-white truncate max-w-52">{listingTitle(o)}</span>
                <span className="text-[11px] font-mono text-[var(--os-text-faint)]">×{o.quantity ?? 1}</span>
                {typeof o.total === 'number' && (
                  <span className="text-[11px] font-mono text-[var(--os-green)]">{money(o.total, o.currency)}</span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <span
                    className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded ${
                      o.status === 'paid' || o.status === 'fulfilled'
                        ? 'text-[var(--os-green)] bg-[rgba(52,224,161,0.08)]'
                        : o.status === 'cancelled'
                        ? 'text-[var(--os-red)] bg-[rgba(255,93,108,0.08)]'
                        : 'text-[var(--os-amber)] bg-[rgba(255,196,107,0.08)]'
                    }`}
                  >
                    {o.status ?? 'pending'}
                  </span>
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
