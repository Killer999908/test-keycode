#!/usr/bin/env bash
# KEYCODE keep-alive watchdog — keeps the site always on with zero manual work.
# Checks every 15s; if the server isn't responding, (re)starts it.
# Logs: .logs/watchdog.log and .logs/server.log

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$DIR/.logs"
mkdir -p "$LOG"

while true; do
  if ! curl -s -m 5 -o /dev/null "http://127.0.0.1:5000/api/health"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] health check failed — starting/restarting server" >> "$LOG/watchdog.log"
    # Kill any stale instance, then start fresh
    pkill -f "node server/server.js" 2>/dev/null
    sleep 2
    cd "$DIR" || exit 1
    # --max-old-space-size caps V8 heap (~512MB) so total RAM stays well under 1GB
    nohup node --max-old-space-size=512 server/server.js >> "$LOG/server.log" 2>&1 &
    disown
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] server restarted (pid $!)" >> "$LOG/watchdog.log"
  fi
  sleep 15
done
