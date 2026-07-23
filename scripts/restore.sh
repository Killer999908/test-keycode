#!/bin/bash
# Restore MongoDB backup for KEYCODE Studio
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <backup-file.tar.gz>"
  echo "Example: $0 backups/keycode_backup_20260715_120000.tar.gz"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [ -z "$MONGODB_URI" ]; then
  if [ -f ../.env ]; then
    set -a; source ../.env; set +a
  fi
fi

if [ -z "$MONGODB_URI" ]; then
  echo "ERROR: MONGODB_URI not set"
  exit 1
fi

echo "=== KEYCODE Database Restore ==="
echo "  File: $BACKUP_FILE"
echo "  Target: $MONGODB_URI"
echo ""
echo "  WARNING: This will OVERWRITE existing data!"
read -p "  Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "  Cancelled."
  exit 0
fi

TEMP_DIR=$(mktemp -d)
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

echo "  Running mongorestore..."
if command -v mongorestore &> /dev/null; then
  mongorestore --uri="$MONGODB_URI" "$TEMP_DIR" --drop --quiet
  echo "  [OK] Database restored"
else
  echo "  [SKIP] mongorestore not installed"
fi

rm -rf "$TEMP_DIR"
echo "  Restore complete."
