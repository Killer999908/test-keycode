'use strict';
// ============================================================
//  mockStore — shared JSON file store for mock data collections
//  (mock-payments.json, mock-orders.json, mock-audit.json …)
//
//  All writes are serialized through an in-process promise chain
//  so concurrent read-modify-write operations cannot clobber each
//  other (the previous loadPayments()/savePayments() copies in
//  routes/payments.js and routes/webhooks.js had this race).
// ============================================================
const fs = require('fs');
const path = require('path');

const writeQueues = new Map(); // filePath -> promise chain

function load(file) {
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return []; }
}

function loadObject(file) {
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return {}; }
}

// serialize writes per-file: each mutation runs after the previous one finishes
function write(file, listOrObj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const prev = writeQueues.get(file) || Promise.resolve();
  const next = prev.then(() =>
    new Promise((resolve, reject) => {
      fs.writeFile(file, JSON.stringify(listOrObj, null, 2), (err) =>
        err ? reject(err) : resolve());
    })
  );
  writeQueues.set(file, next.catch(() => { })); // keep chain alive on errors
  return next;
}

// Atomic read-modify-write: the mutator receives the parsed contents and
// returns the value to persist. Mutations for the same file are queued.
function update(file, mutator) {
  const prev = writeQueues.get(file) || Promise.resolve();
  const next = prev.then(() => {
    const current = fs.existsSync(file)
      ? (function () { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } })()
      : null;
    const result = mutator(current === null ? (Array.isArray([]) ? [] : {}) : current);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    return new Promise((resolve, reject) => {
      fs.writeFile(file, JSON.stringify(result, null, 2), (err) =>
        err ? reject(err) : resolve(result));
    });
  });
  writeQueues.set(file, next.catch(() => { }));
  return next;
}

function paymentsPath() { return path.join(process.cwd(), 'data', 'mock-payments.json'); }
function ordersPath() { return path.join(process.cwd(), 'data', 'mock-orders.json'); }
function auditPath() { return path.join(process.cwd(), 'data', 'mock-audit.json'); }

module.exports = {
  load, loadObject, write, update,
  paymentsPath, ordersPath, auditPath,
  loadPayments: () => load(paymentsPath()),
  loadOrders: () => load(ordersPath()),
};
