#!/bin/bash
# KEYCODE Production Cron Setup
# Run once to install monitoring and backup cron jobs

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONITOR_LOG="/var/log/keycode-monitor.log"
BACKUP_LOG="/var/log/keycode-backup.log"

# Check if running as root (for system-wide cron)
if [ "$EUID" -ne 0 ]; then
  echo "  [INFO] Not running as root — using user crontab"
  CRON_CMD="crontab"
else
  CRON_CMD="crontab -u $(who am i | awk '{print $1}')"
fi

echo "=== KEYCODE Cron Setup ==="
echo ""

# Install monitoring cron job (every 5 minutes)
MONITOR_JOB="*/5 * * * * cd $SCRIPT_DIR && node monitor.js http://localhost:5000 300000 >> $MONITOR_LOG 2>&1"

# Install backup cron job (daily at 3am)
BACKUP_JOB="0 3 * * * cd $SCRIPT_DIR && bash backup.sh >> $BACKUP_LOG 2>&1"

# Check if jobs already exist
EXISTING_CRON="$($CRON_CMD -l 2>/dev/null || true)"

if echo "$EXISTING_CRON" | grep -q "keycode-monitor"; then
  echo "  [OK] Monitoring cron already installed"
else
  (echo "$EXISTING_CRON"; echo "$MONITOR_JOB") | $CRON_CMD -
  echo "  [OK] Monitoring cron installed (every 5 min)"
fi

if echo "$EXISTING_CRON" | grep -q "keycode-backup"; then
  echo "  [OK] Backup cron already installed"
else
  (echo "$EXISTING_CRON"; echo "$BACKUP_JOB") | $CRON_CMD -
  echo "  [OK] Backup cron installed (daily 3am)"
fi

echo ""
echo "  Logs:"
echo "    Monitor: $MONITOR_LOG"
echo "    Backup: $BACKUP_LOG"
echo ""
echo "  To verify: crontab -l"
