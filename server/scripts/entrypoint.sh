#!/bin/sh
# ============================================
# KEYCODE container entrypoint
# Waits for MongoDB, seeds demo data, then execs the main server.
#
# Env:
#   SEED_MARKETPLACE   set to 0 to skip demo marketplace seeding (default: on)
#   DB_WAIT_RETRIES    connection attempts before giving up (default: 30)
# ============================================
set -e

MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/keycode}"
SEED_MARKETPLACE="${SEED_MARKETPLACE:-1}"
MAX_RETRIES="${DB_WAIT_RETRIES:-30}"
RETRIES=0

echo "[entrypoint] waiting for MongoDB (attempt 1/$MAX_RETRIES)"
until node -e "
  import('dotenv/config').then(() => import('mongoose')).then((m) => {
    const mongoose = m.default;
    return mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/keycode', { serverSelectionTimeoutMS: 3000 })
      .then(() => mongoose.disconnect());
  }).catch(() => process.exit(1));
" 2>/dev/null; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "[entrypoint] MongoDB unreachable after $MAX_RETRIES attempts — starting server anyway"
    break
  fi
  sleep 2
done

if [ "$SEED_MARKETPLACE" = "1" ]; then
  echo "[entrypoint] seeding demo marketplace data (idempotent)"
  node seed-marketplace.mjs || echo "[entrypoint] seed skipped/failed — continuing without demo data"
else
  echo "[entrypoint] SEED_MARKETPLACE=0 — skipping marketplace seed"
fi

echo "[entrypoint] starting server"
exec node server.js
