# KEYCODE Deployment Guide

## 🚀 Free Static Deployment (Frontend Only)

The website works as a static site! Deploy for free to:

### Option 1: Cloudflare Pages (Recommended)
```bash
# 1. Install wrangler
npm install -g wrangler

# 2. Set API token
export CLOUDFLARE_API_TOKEN="your-token"

# 3. Deploy
npx wrangler pages deploy . --project-name=keycode
```

### Option 2: Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

### Option 3: Netlify
- Drag & drop project folder to https://app.netlify.com
- Or: `npm install -g netlify-cli && netlify deploy`

---

## Quick Start (Development)

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- npm or yarn

### Setup

```bash
# 1. Navigate to project
cd /home/killer/keycode-alien-interface

# 2. Install server dependencies
cd server && npm install

# 3. Start MongoDB
mongod --dbpath /path/to/data --fork --logpath /var/log/mongodb.log

# 4. Configure environment
cp .env.example .env
# Edit .env with your values

# 5. Start server
node server.js

# 6. Open frontend
# Simply open index.html in a browser
# Or serve with: npx serve .
```

### Server runs on:
- API: http://localhost:5000
- Frontend: http://localhost:3000 (or open index.html directly)

---

## Production Deployment

### Option 1: VPS (DigitalOcean, AWS, etc.)

#### 1. Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### 2. Deploy Application
```bash
# Clone/transfer project
cd /var/www
git clone <your-repo> keycode

# Install dependencies
cd keycode/server
npm install --production

# Create environment file
cp .env.example .env
nano .env  # Edit with production values
```

#### 3. Configure .env for Production
```env
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://yourdomain.com
MONGODB_URI=mongodb://localhost:27017/keycode
JWT_SECRET=<generate-with-openssl-rand-hex-64>
GROQ_API_KEY=<your-groq-api-key>
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=<strong-password>
```

#### 4. Run with PM2
```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start server.js --name keycode-api

# Auto-start on reboot
pm2 startup
pm2 save
```

#### 5. Configure Nginx
```nginx
# /etc/nginx/sites-available/keycode
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    root /var/www/keycode;
    index index.html;

    # API Proxy
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/keycode /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Option 2: MongoDB Atlas (Cloud Database)

1. Create free cluster at mongodb.com/atlas
2. Get connection string
3. Update MONGODB_URI in .env:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/keycode?retryWrites=true&w=majority
```

### Option 3: Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --only=production
COPY server/ .
EXPOSE 5000
CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/keycode
    depends_on:
      - mongo
  mongo:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
volumes:
  mongo_data:
```

---

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | `production` or `development` | Yes |
| `PORT` | Server port (default: 5000) | No |
| `FRONTEND_URL` | Your frontend domain | Yes |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT signing secret (64+ chars) | Yes |
| `JWT_EXPIRES` | Token expiry (default: 7d) | No |
| `GROQ_API_KEY` | Groq AI API key | Yes |
| `ADMIN_EMAIL` | Initial admin email | Yes |
| `ADMIN_PASSWORD` | Initial admin password | Yes |

---

## API Endpoints

### Authentication
```
POST /api/auth/register - Register new user
POST /api/auth/login    - Login user
GET  /api/auth/me       - Get current user
PUT  /api/auth/profile  - Update profile
POST /api/auth/change-password - Change password
```

### Services
```
GET  /api/services         - List all services
GET  /api/services/featured - List featured services
GET  /api/services/:slug   - Get service by slug
```

### Orders
```
POST /api/orders      - Create order
GET  /api/orders      - Get user orders (auth required)
GET  /api/orders/:id  - Get order by ID (auth required)
```

### Other
```
POST /api/chat       - AI chat
POST /api/reviews    - Submit review
GET  /api/reviews    - Get approved reviews
POST /api/inquiries  - Submit inquiry
GET  /api/health     - Health check
```

---

## Security Checklist

- [ ] Change default admin credentials
- [ ] Use strong JWT_SECRET (64+ random characters)
- [ ] Enable HTTPS (SSL certificate)
- [ ] Configure firewall (ufw allow 22,80,443)
- [ ] Set NODE_ENV=production
- [ ] Use MongoDB authentication
- [ ] Enable rate limiting
- [ ] Regular backups of MongoDB
- [ ] Monitor server logs
- [ ] Keep Node.js and dependencies updated

---

## Troubleshooting

### MongoDB Connection Issues
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check logs
sudo tail -f /var/log/mongodb/mongod.log
```

### Server Won't Start
```bash
# Check port availability
lsof -i :5000

# View server logs
pm2 logs keycode-api
```

### CORS Errors
- Ensure FRONTEND_URL matches your frontend domain exactly
- Include protocol (https://)
- No trailing slash

---

## Default Admin Login

After first deployment, create admin:

1. Register at `/register.html`
2. Manually update in MongoDB:
```javascript
db.users.updateOne({email: "admin@yourdomain.com"}, {$set: {role: "admin"}})
```

Or access admin at: `/admin.html`
Default: admin / admin123 (CHANGE THIS!)

---

## Support

For issues, check:
1. Server logs: `pm2 logs`
2. MongoDB logs: `/var/log/mongodb/mongod.log`
3. Nginx logs: `/var/log/nginx/error.log`
