#!/bin/bash
# Production start script for KEYCODE Studio
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# Load environment
if [ -f .env ]; then
  set -a; source .env; set +a
fi

echo "=== KEYCODE Production Start ==="

# Check required vars
MISSING=0
if [ -z "$MONGODB_URI" ]; then echo "  [FAIL] MONGODB_URI is required"; MISSING=1; fi
if [ -z "$JWT_SECRET" ]; then echo "  [FAIL] JWT_SECRET is required"; MISSING=1; fi

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo "  Missing required environment variables."
  echo "  Copy .env.production to .env and fill in values."
  exit 1
fi

# Install deps
echo "  Installing dependencies..."
npm ci --omit=dev 2>&1 | tail -1

# Start with PM2 or directly
if command -v pm2 &> /dev/null; then
  echo "  Starting with PM2..."
  pm2 delete keycode 2>/dev/null || true
  pm2 start server.js --name keycode --max-memory-restart 512M --log-date-format "YYYY-MM-DD HH:mm:ss"
  pm2 save
  echo "  [OK] Started with PM2"
  pm2 status keycode
else
  echo "  Starting directly (no PM2)..."
  echo "  Install PM2 for production: npm i -g pm2"
  node server.js &
  echo "  [OK] Started with PID $!"
fi
