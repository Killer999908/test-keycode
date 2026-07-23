# KEYCODE Studio — Production Deployment

## Prerequisites
- Node.js 18+
- MongoDB 7+ (Atlas recommended)
- At least one AI provider API key
- (Optional) Stripe or Razorpay for payments
- (Optional) SMTP for emails

## Quick Start
1. `npm run setup` — checks dependencies, creates .env from template
2. Edit `.env` with your real credentials
3. `npm start` — starts the server

## Required Environment Variables
See `server/.env.production` for the full list with instructions.

Minimum to start:
| Variable | Where to get it |
|---|---|
| `MONGODB_URI` | MongoDB Atlas → Connect → Drivers |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `GROQ_API_KEY` (or any AI provider) | https://console.groq.com |

## Deployment Options

### Railway (Recommended)
1. Fork this repo to GitHub
2. Connect to Railway → New Project → Deploy from GitHub
3. Add all env vars in Railway dashboard
4. Railway auto-detects the Dockerfile
5. Health check: `/api/health`

### Docker
```
docker compose up -d
```
Starts app + admin + MongoDB + Redis.

### Manual
```
npm ci --omit=dev
node server/server.js
```

## Production Scripts
| Script | Purpose |
|---|---|
| `npm start` | Start the server |
| `npm run setup` | Check dependencies and config |
| `npm run monitor` | Health check monitoring (30s interval) |
| `npm run load-test` | Load test (usage: `npm run load-test -- http://localhost:5000 10 30`) |
| `npm run backup` | MongoDB backup (set BACKUP_DIR, RETENTION_DAYS) |
| `npm run restore` | Restore from backup (`npm run restore -- path/to/backup.tar.gz`) |

## Monitoring
```
# Check if server is healthy
curl http://localhost:5000/api/health

# Run continuous monitoring (optional: add Slack/Discord webhook)
ALERT_WEBHOOK=https://hooks.slack.com/services/... npm run monitor
```

## Load Testing
```
# Simulate 50 concurrent users for 60 seconds
npm run load-test -- http://localhost:5000 50 60
```

## Backups
```
# Manual backup
BACKUP_DIR=./backups RETENTION_DAYS=7 npm run backup

# With S3 upload
S3_BUCKET=my-bucket npm run backup
```

## Security Checklist
- [ ] JWT_SECRET is a strong random 64+ char string
- [ ] MONGODB_URI uses a database user with limited permissions
- [ ] STRIPE_SECRET_KEY is a live (not test) key
- [ ] ADMIN_IP_WHITELIST is set
- [ ] ADMIN_BASIC_USER / ADMIN_BASIC_PASS are changed
- [ ] HTTPS is enabled (Railway handles this automatically)
- [ ] Regular backups are configured
