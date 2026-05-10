# KEYCODE - Free Deployment Guide

## ✅ Deployment Options (FREE TIER)

### **RECOMMENDED: Vercel (Full-Stack)**
Best for your setup - supports Node.js + Frontend together

1. **Go to**: https://vercel.com/signup
2. **Connect GitHub**: Select your repository
3. **Set Environment Variables** in Vercel Dashboard:
   - `MONGODB_URI` - MongoDB connection string
   - `OPENAI_API_KEY` - Your OpenAI key
   - `GROQ_API_KEY` - Your Groq key  
   - `STRIPE_SECRET_KEY` - Your Stripe test key
   - `JWT_SECRET` - Any random secret (min 32 chars)
   - `NODE_ENV=production`

4. **Deploy**: Click "Deploy" - Vercel handles the rest!

### **Alternative: Netlify + Railway**
- Netlify (Frontend): https://netlify.com
- Railway (Backend): https://railway.app

---

## 🚀 Deployment Checklist

### Before Deploying:
- [ ] Database: Create free MongoDB Atlas account
  - https://www.mongodb.com/cloud/atlas
  - Create cluster and get connection string
  
- [ ] API Keys:
  - [ ] OpenAI API Key (from openai.com)
  - [ ] Groq API Key (from console.groq.com)
  - [ ] Stripe Test Keys (from stripe.com/test/dashboard)
  
- [ ] Environment Variables added to deployment platform

### Testing After Deployment:
```bash
# Frontend loads: ✅
# Navigate to your deployed URL

# API works: ✅
# Check browser console for API calls (F12 → Network)

# Database connects: ✅
# Try to login or create account

# File uploads work: ✅
# Test any upload features
```

---

## 📊 Performance Tips

1. **Images**: Use WebP format for 30% faster load
2. **Database**: Add indexes for frequently searched fields
3. **Caching**: Enable service worker (sw.js already present)
4. **Monitoring**: Check Vercel analytics for bottlenecks

---

## 🔍 Monitoring & Debugging

### Vercel Dashboard:
- Monitor API response times
- Check serverless function logs
- View build history

### MongoDB Atlas:
- Network access (whitelist IP: 0.0.0.0/0 for dev)
- Connection string in dashboard
- Activity timeline

---

## 💰 Cost Estimate (Free Tier)

| Service | Free Tier | Limit |
|---------|-----------|-------|
| Vercel | ✅ Yes | 5 deployments/day |
| MongoDB | ✅ Yes | 512 MB storage |
| Stripe | ✅ Sandbox | Test mode only |
| OpenAI | ❌ Paid | Start with $5 credit |

**Estimated monthly cost**: $0-5 (depending on API usage)

---

## 🆘 Common Issues

### "Cannot find module"
- Ensure `npm install` runs in build step
- Check `package.json` exists in server/

### "Connection refused"
- MongoDB cluster may need IP whitelist
- Check MONGODB_URI in environment variables

### "API 404 errors"
- Frontend calling wrong API URL
- Check FRONTEND_URL and API endpoints

### "Timeout errors"
- Database query too slow
- Vercel functions limited to 60s

---

## 📞 Support

- Vercel Docs: https://vercel.com/docs
- MongoDB Docs: https://docs.mongodb.com
- Stripe Testing: https://stripe.com/docs/testing
