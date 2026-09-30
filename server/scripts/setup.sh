#!/bin/bash
# Production setup script for KEYCODE Studio
set -e

echo "=== KEYCODE Production Setup ==="
echo ""

# Check Node version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
  echo "ERROR: Node.js 18+ required. Current: $(node -v 2>/dev/null || echo 'not installed')"
  exit 1
fi
echo "[OK] Node.js $(node -v)"

# Check for .env
if [ ! -f .env ]; then
  echo "[WARN] No .env file found"
  echo "  Creating from .env.production template..."
  cp .env.production .env
  echo "  EDIT .env with your real credentials before starting!"
else
  echo "[OK] .env file exists"
fi

# Check critical env vars
source_env() {
  set -a; source .env 2>/dev/null; set +a
}
source_env

if [ -z "$MONGODB_URI" ]; then echo "[FAIL] MONGODB_URI not set"; else echo "[OK] MONGODB_URI set"; fi
if [ -z "$JWT_SECRET" ]; then echo "[FAIL] JWT_SECRET not set"; else echo "[OK] JWT_SECRET set"; fi
if [ -z "$GROQ_API_KEY" ] && [ -z "$DEEPSEEK_API_KEY" ] && [ -z "$MISTRAL_API_KEY" ]; then
  echo "[WARN] No AI provider keys set — AI generation will fail"
else
  echo "[OK] At least one AI provider key set"
fi

# Check MongoDB connectivity
echo ""
echo "=== Testing MongoDB connectivity ==="
if command -v mongosh &> /dev/null; then
  if mongosh "$MONGODB_URI" --eval "db.adminCommand('ping')" --quiet 2>/dev/null; then
    echo "[OK] MongoDB reachable"
  else
    echo "[FAIL] Cannot connect to MongoDB — check MONGODB_URI"
  fi
else
  echo "[SKIP] mongosh not installed"
fi

# Install dependencies
echo ""
echo "=== Installing dependencies ==="
npm ci --omit=dev 2>&1 | tail -1

# Run database migrations / seed
echo ""
echo "=== Database setup ==="
node -e "
  import('./server.js').catch(e => {
    if (e.message.includes('ECONNREFUSED') || e.message.includes('MongoDB')) {
      console.log('[SKIP] MongoDB not available — skipping DB setup');
      process.exit(0);
    }
    console.error('[ERROR]', e.message);
    process.exit(1);
  });
" 2>/dev/null || true

# Seed demo marketplace listings (idempotent)
if [ "${SEED_MARKETPLACE:-1}" = "1" ]; then
  echo ""
  echo "=== Marketplace demo data ==="
  node seed-marketplace.mjs || echo "[WARN] Marketplace seed skipped — run 'npm run seed:marketplace' once MongoDB is reachable"
fi

echo ""
echo "=== Setup complete ==="
echo "  Start with: npm start"
echo "  Or with PM2: pm2 start server/server.js --name keycode"
