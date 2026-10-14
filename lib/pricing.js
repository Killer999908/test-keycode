'use strict';
// ============================================================
//  PRICING — lib/pricing.js
//  One resolver for "which price does this visitor pay", used by
//  /api/services (what the page shows), /api/subscriptions/checkout
//  (what Stripe is asked to charge) and /api/payment/create-intent
//  (what the UPI QR requests). One source of truth, so the page and
//  the charge can never disagree.
// ============================================================
const fs = require('fs');
const path = require('path');

const TABLE_PATH = path.join(__dirname, 'pricing-regions.json');

function loadTable() {
  try {
    return JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  } catch (err) {
    console.warn('[pricing] could not read pricing-regions.json:', err && err.message);
    return { default: { label: 'Global', currency: 'USD', symbol: '$', prices: {} }, groups: {} };
  }
}

const TABLE = loadTable();

// country code -> group key, built once from each group's countries list
const COUNTRY_TO_GROUP = (function () {
  const map = {};
  Object.keys(TABLE.groups || {}).forEach(function (key) {
    const group = TABLE.groups[key];
    (group.countries || []).forEach(function (country) {
      map[String(country).toUpperCase()] = key;
    });
  });
  return map;
})();

function countryFromRequest(req) {
  if (!req) return null;
  const q = (req.query || {}).region || (req.query || {}).country;
  if (q) return String(q).trim().toUpperCase();

  const headers = req.headers || {};
  const headerCountry = headers['cf-ipcountry'] || headers['x-vercel-ip-country'] ||
    headers['x-country'] || headers['x-geo-country'];
  if (headerCountry) return String(headerCountry).trim().toUpperCase();

  // "en-IN,en;q=0.9" -> IN
  const lang = String(headers['accept-language'] || '');
  const match = lang.match(/[a-z]{2}-([A-Za-z]{2})/);
  if (match) return match[1].toUpperCase();
  return null;
}

/**
 * resolve(req) -> { key, label, currency, symbol, prices, regional }
 * `regional` is true when the visitor is not on the default price list, so the
 * UI can say so out loud instead of quietly showing different numbers.
 */
function resolve(req) {
  const country = countryFromRequest(req);
  const groupKey = country ? COUNTRY_TO_GROUP[country] : null;
  const group = groupKey ? TABLE.groups[groupKey] : null;
  if (!group) {
    return {
      key: 'default',
      label: TABLE.default.label || 'Global',
      currency: TABLE.default.currency || 'USD',
      symbol: TABLE.default.symbol || '$',
      prices: TABLE.default.prices || {},
      country: country || null,
      regional: false,
    };
  }
  return {
    key: groupKey,
    label: group.label || groupKey,
    currency: group.currency || 'USD',
    symbol: group.symbol || '$',
    prices: group.prices || {},
    country: country || null,
    regional: true,
  };
}

/** Price for a plan slug in this region; falls back to the catalog's own price. */
function priceFor(slug, region, fallback) {
  const key = String(slug || '').toLowerCase();
  const listed = region && region.prices ? region.prices[key] : undefined;
  if (Number.isFinite(Number(listed))) return Number(listed);
  if (Number.isFinite(Number(fallback))) return Number(fallback);
  return null;
}

/** Amount in the smallest unit Stripe expects (paise, cents, ...). */
function minorUnits(amount, currency) {
  const zeroDecimal = ['jpy', 'krw', 'vnd', 'clp', 'xaf', 'xof'];
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  return zeroDecimal.indexOf(String(currency || '').toLowerCase()) !== -1
    ? Math.round(value)
    : Math.round(value * 100);
}

module.exports = {
  resolve: resolve,
  priceFor: priceFor,
  minorUnits: minorUnits,
  table: TABLE,
  countryFromRequest: countryFromRequest,
};
