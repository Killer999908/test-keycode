#!/bin/bash
set -e

echo "====================================="
echo " KEYCODE - Starting all services"
echo "====================================="

# 1. Start MongoDB if not running
if ! pgrep -x mongod > /dev/null; then
  echo "[1/3] Starting MongoDB..."
  mongod --dbpath /home/killer/mongodb_data --fork --logpath /home/killer/mongodb_data/mongod.log
  echo "      OK (PID: $(pgrep -x mongod))"
else
  echo "[1/3] MongoDB already running (PID: $(pgrep -x mongod))"
fi

# 2. Start Admin Server (background)
echo "[2/3] Starting Admin Server (port 5001)..."
node /home/killer/keycode-alien-interface/server/admin-server.js &
ADMIN_PID=$!
echo "      OK (PID: $ADMIN_PID)"

# 3. Start Main Server
echo "[3/3] Starting Main Server (port 5000)..."
node /home/killer/keycode-alien-interface/server/server.js &
MAIN_PID=$!
echo "      OK (PID: $MAIN_PID)"

echo ""
echo "====================================="
echo " All services started!"
echo " Main API:   http://localhost:5000"
echo " Admin:      http://localhost:5001"
echo " MongoDB:    localhost:27017"
echo "====================================="
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $ADMIN_PID $MAIN_PID 2>/dev/null; echo 'Services stopped'" EXIT

wait
