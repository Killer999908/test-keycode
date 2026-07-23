# KEYCODE Studio — Complete Setup Guide

## Step 1: Deploy to Railway

1. Push this repo to GitHub:
   ```bash
   git add .
   git commit -m "Production-ready deployment"
   git push origin main
   ```

2. Go to https://railway.app → New Project → Deploy from GitHub
3. Select this repo
4. Railway auto-detects the Dockerfile

### Required Environment Variables (set in Railway Dashboard)
| Variable | Value |
|---|---|
| `MONGODB_URI` | `mongodb+srv://keycodetechio_db_user:jule%404848@cluster1.kqyyqyy.mongodb.net/keycode?retryWrites=true&w=majority` |
| `JWT_SECRET` | Already in your .env |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://keycode.studio` (or your Railway domain) |
| `GROQ_API_KEY` | Free tier from https://console.groq.com |
| `TURNSTILE_SITE_KEY` | Free from https://dash.cloudflare.com/turnstile |

### Post-Deploy Checklist
- [ ] Health check: `https://your-app.railway.app/api/health` returns `{"status":"ok"}`
- [ ] Homepage loads: `https://your-app.railway.app/`
- [ ] Can browse: `/pricing.html`, `/playground.html`, `/gallery.html`

## Step 2: MongoDB Atlas — IP Whitelist

1. Go to https://cloud.mongodb.com → Network Access
2. Click "Add IP Address"
3. Add `0.0.0.0/0` (allow from anywhere — required since Railway IPs change)
4. Click Confirm

## Step 3: Cloudflare Turnstile (Free CAPTCHA)

1. Go to https://dash.cloudflare.com/turnstile
2. Click "Add a site"
3. Set domain to your Railway URL (e.g. `*.railway.app`)
4. Copy Site Key → set `TURNSTILE_SITE_KEY`
5. Copy Secret Key → set `TURNSTILE_SECRET_KEY`

## Step 4: Domain (Optional)

1. Buy a domain (e.g. keycode.studio from Namecheap/Cloudflare)
2. In Railway: Settings → Domains → Add Custom Domain
3. Point your domain's DNS to Railway
4. Update `FRONTEND_URL` and OAuth callback URLs

## Step 5: Verify Everything

```bash
# Health check
curl https://your-app.railway.app/api/health

# Test CSRF protection
curl -X POST https://your-app.railway.app/api/security/csrf-token

# Test a page
curl https://your-app.railway.app/playground.html

# Run load test (from your machine)
npm run load-test -- https://your-app.railway.app 50 30
```

## Step 6: Set Up Monitoring

```bash
# Production monitoring (Slack/Discord webhook optional)
ALERT_WEBHOOK=https://hooks.slack.com/services/... npm run monitor

# Set up automated backups
bash server/scripts/setup-cron.sh
```

## Troubleshooting

### MongoDB Connection Failed
- Check IP whitelist in MongoDB Atlas Network Access
- Verify username/password in MONGODB_URI
- URL-encode special characters in password (@ → %40, # → %23)

### Pages Not Loading
- Check Railway logs: `railway logs`
- Verify `dist/` was built: `npx vite build`

### AI Generation Not Working
- Check AI provider keys are set
- Test with: `curl -X POST https://your-app.railway.app/api/ai/providers`
