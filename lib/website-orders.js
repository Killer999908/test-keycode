'use strict';
// ============================================================
//  WEBSITE ORDER CATALOG — lib/website-orders.js
//  The one-off project services checkout.html sells. Names live here; PRICES do
//  not: they are per region in lib/pricing-regions.json, so the price the page
//  shows, the amount Stripe/UPI is asked for, and the total on the order record
//  all come from the same resolver.
// ============================================================
const pricing = require('./pricing');

// Each slug needs an entry in the "websiteOrders" map of every region group in
// lib/pricing-regions.json. A slug with no entry for a region is reported as
// unavailable there rather than falling back to another currency's number.
const SERVICES = [
  { slug: 'basic-website', name: 'Basic Website' },
  { slug: 'professional-website', name: 'Professional Website' },
  { slug: 'online-store', name: 'Online Store' },
];

// What an order without an explicit service falls back to (the page's current
// default, so an untagged /checkout.html visit behaves as it always has).
const DEFAULT_SLUG = 'professional-website';

function find(slug) {
  const key = String(slug == null ? '' : slug).trim().toLowerCase();
  return SERVICES.find(service => service.slug === key) || null;
}

/**
 * quote(serviceSlug, region) -> { slug, name, amount, currency, symbol, matched }
 * `amount` is null when this region has no price for the service; `matched` is
 * false when an unknown slug was requested and the default service was used.
 */
function quote(serviceSlug, region) {
  const requested = serviceSlug == null || serviceSlug === '' ? null : String(serviceSlug);
  const match = find(requested);
  const service = match || find(DEFAULT_SLUG);
  return {
    slug: service.slug,
    name: service.name,
    amount: pricing.orderPriceFor(service.slug, region),
    currency: (region && region.currency) || 'USD',
    symbol: (region && region.symbol) || '$',
    matched: Boolean(match),
    requested: requested,
  };
}

function list(region) {
  return SERVICES.map(service => quote(service.slug, region));
}

module.exports = {
  SERVICES: SERVICES,
  DEFAULT_SLUG: DEFAULT_SLUG,
  find: find,
  quote: quote,
  list: list,
};
