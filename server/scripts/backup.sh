#!/bin/bash
# MongoDB backup script for KEYCODE Studio
set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="keycode_backup_${TIMESTAMP}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
S3_BUCKET="${S3_BUCKET:-}"

# Load .env if exists
if [ -f ../.env ]; then
  set -a; source ../.env; set +a
fi

if [ -z "$MONGODB_URI" ]; then
  echo "ERROR: MONGODB_URI not set"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "=== KEYCODE Database Backup ==="
echo "  Timestamp: $TIMESTAMP"
echo "  Output: $BACKUP_DIR/$BACKUP_NAME"
echo ""

# Run mongodump
echo "  Running mongodump..."
if command -v mongodump &> /dev/null; then
  mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$BACKUP_NAME" --quiet
  echo "  [OK] Database dumped"
else
  echo "  [SKIP] mongodump not installed — install mongodb-database-tools"
fi

# Compress
echo "  Compressing..."
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME" 2>/dev/null
rm -rf "$BACKUP_NAME"
echo "  [OK] Compressed to ${BACKUP_NAME}.tar.gz"

# Upload to S3 if configured
if [ -n "$S3_BUCKET" ]; then
  echo "  Uploading to S3..."
  if command -v aws &> /dev/null; then
    aws s3 cp "${BACKUP_NAME}.tar.gz" "s3://${S3_BUCKET}/backups/${BACKUP_NAME}.tar.gz"
    echo "  [OK] Uploaded to s3://${S3_BUCKET}/backups/"
  else
    echo "  [SKIP] aws CLI not installed"
  fi
fi

# Rotate old backups
echo "  Cleaning backups older than ${RETENTION_DAYS} days..."
find . -name "keycode_backup_*.tar.gz" -mtime "+$RETENTION_DAYS" -delete 2>/dev/null
echo "  [OK] Old backups removed"

echo ""
echo "=== Backup complete ==="
echo "  File: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
ls -lh "$BACKUP_DIR/${BACKUP_NAME}.tar.gz"
