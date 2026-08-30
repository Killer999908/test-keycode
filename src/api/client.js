/* Thin, resilient client for the KEYCODE backend. */

const TIMEOUT = 8000;

async function request(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: ctrl.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  async featuredServices() {
    const data = await request('/api/services/featured');
    return Array.isArray(data) ? data : [];
  },

  async health() {
    const data = await request('/api/health');
    return data || {};
  },

  async subscribe(email) {
    return request('/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async me() {
    const token = localStorage.getItem('keycode_token');
    if (!token) return null;
    try {
      const data = await request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return data.user || data;
    } catch {
      return null;
    }
  }
};
