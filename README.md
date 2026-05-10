# KEYCODE Studio - Complete Documentation

## 🚀 Quick Start

```bash
cd /home/killer/keycode-alien-interface/server
node server.js
```

Server runs on: http://localhost:5000

---

## 📁 Project Structure

```
keycode-alien-interface/
├── index.html              # Main website
├── control-panel.html      # Unified dashboard (admin + user)
├── admin.html              # Legacy admin dashboard
├── dashboard.html          # Legacy user dashboard
├── login.html              # Login page
├── register.html           # Registration page
├── privacy.html           # Privacy policy
├── terms.html             # Terms of service
├── cookies.html           # Cookie policy
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── sitemap.xml             # SEO sitemap
├── robots.txt              # SEO robots
├── admin.css               # Shared admin styles
├── server/
│   ├── server.js           # Backend API
│   ├── .env                # Environment variables
│   └── package.json
```

---

## 🔐 Access Credentials

### Admin Account
- **Email:** admin@keycode.studio
- **Password:** admin123
- **URL:** http://localhost:5000/control-panel.html

### User Account (any registered user)
- Register at: http://localhost:5000/register.html
- Login at: http://localhost:5000/login.html

---

## 🌐 Main Website Features

### Public Pages
- **/** - Main website with all sections
- **/control-panel.html** - Unified dashboard
- **/login.html** - User login
- **/register.html** - User registration
- **/privacy.html** - Privacy policy
- **/terms.html** - Terms of service
- **/cookies.html** - Cookie policy

### Website Sections
1. **Hero** - Animated intro with stats
2. **Services** - 6 service cards with pricing
3. **AI Studio** - AI chatbot for project estimation
4. **Portfolio** - Filterable project gallery
5. **Team** - Team member profiles
6. **Process** - How it works timeline
7. **Pricing** - Service pricing tables
8. **FAQ** - Accordion FAQ section
9. **Testimonials** - Customer reviews
10. **Contact** - Contact form with inquiry submission
11. **Footer** - Links and social media

---

## 📊 Control Panel Features

### User Dashboard
- **Overview** - Stats and recent orders
- **Services** - Browse and order services
- **Orders** - View personal orders
- **Payments** - Payment history and make payments
- **Profile** - Update profile settings

### Admin Dashboard (additional tabs)
- **All Orders** - View and manage all orders
- **Users** - User management
- **Inquiries** - View contact form submissions
- **Reviews** - Manage testimonials
- **Settings** - System info and configuration

---

## 🔌 API Endpoints

### Authentication
```
POST /api/auth/register    - Register new user
POST /api/auth/login       - User login
GET  /api/auth/me          - Get current user
```

### Services
```
GET  /api/services         - List all services
GET  /api/services/featured - List featured services
GET  /api/services/:slug   - Get service by slug
```

### Orders
```
POST /api/orders           - Create new order
GET  /api/orders           - Get user's orders
GET  /api/orders/:id      - Get order by ID
```

### Payments (Stripe)
```
POST /api/payment/create-intent  - Create payment intent
POST /api/payment/confirm        - Confirm payment
GET  /api/payment/methods       - Get saved payment methods
```

### Admin Routes (require admin token)
```
GET  /api/admin/orders    - Get all orders
PUT  /api/admin/orders/:id - Update order
GET  /api/admin/users     - Get all users
PUT  /api/admin/users/:id - Update user
POST /api/admin/seed      - Seed database with services
POST /api/admin/init      - Create admin user
```

### Other
```
POST /api/inquiries       - Submit contact form
GET  /api/reviews         - Get approved reviews
POST /api/reviews         - Submit review
POST /api/chat            - AI chat (Groq)
POST /api/generate-code   - Generate project code
GET  /api/health          - Health check
```

---

## ⚙️ Environment Variables

Create `server/.env` with:

```env
# Server
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://yourdomain.com

# MongoDB
MONGODB_URI=mongodb://localhost:27017/keycode

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRES=7d

# Groq AI
GROQ_API_KEY=your-groq-api-key

# Stripe (optional)
STRIPE_SECRET_KEY=sk_test_your_key

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Admin
ADMIN_EMAIL=admin@yourdomain.com
```

---

## 🎨 Customization

### Colors
Edit CSS variables in the HTML files:
```css
:root {
  --primary: #6366f1;    /* Main purple */
  --secondary: #8b5cf6;  /* Lighter purple */
  --accent: #ec4899;     /* Pink accent */
  --success: #10b981;    /* Green */
  --warning: #f59e0b;     /* Orange */
  --danger: #ef4444;     /* Red */
  --dark: #0a0a0f;       /* Background */
}
```

### Services
Edit services in the database or via admin panel. Default services:
1. Professional Website - $499
2. Web Application - $1,299
3. Mobile App - $2,499
4. AI Integration - $1,999
5. E-Commerce Store - $1,499
6. UI/UX Design - $299

---

## 📱 PWA Setup

The app supports PWA installation:
1. Service worker registered (`sw.js`)
2. Manifest configured (`manifest.json`)
3. Offline-capable with caching

Install on mobile: Visit site → Add to Home Screen

---

## 🚀 Deployment

### Option 1: VPS (Recommended)
```bash
# Clone repository
git clone <repo-url>
cd keycode-alien-interface/server

# Install dependencies
npm install

# Set environment
cp .env.example .env
# Edit .env with production values

# Run with PM2
npm install -g pm2
pm2 start server.js --name keycode
pm2 save
pm2 startup
```

### Option 2: Railway/Render
1. Connect GitHub repo
2. Set build command: `cd server && npm install`
3. Set start command: `cd server && node server.js`
4. Add environment variables

### Option 3: Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --only=production
COPY server/ ./
EXPOSE 5000
CMD ["node", "server.js"]
```

---

## 🔒 Security Features

- JWT authentication
- Rate limiting (100 req/15min, 10 auth attempts/15min)
- Helmet security headers
- CORS protection
- Password hashing (bcrypt)
- Input validation
- XSS protection via sanitization

---

## 📧 Email Templates

1. **Welcome** - Sent on user registration
2. **Order Confirmation** - Sent when order placed
3. **Order Update** - Sent on status change
4. **Project Delivery** - Sent when project completed
5. **Payment Reminder** - Sent for balance due
6. **Contact Confirmation** - Sent on inquiry submission

---

## 💳 Payment Flow

1. User selects order or enters custom amount
2. System creates payment intent (Stripe)
3. User completes payment
4. Webhook confirms payment
5. Order status updated
6. Confirmation email sent

---

## 🤖 AI Features

### AI Studio (on main page)
- Conversational project estimator
- Detects service type from conversation
- Calculates pricing based on features
- Generates code preview

### Code Generation
- Generates HTML/CSS/JS based on project specs
- Includes responsive design
- Uses Groq AI (free tier available)

---

## 📈 Analytics

Add your analytics tracking ID in index.html:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
```

---

## 🐛 Troubleshooting

### Server won't start
```bash
# Check MongoDB connection
mongosh

# Check port availability
lsof -i :5000

# View server logs
cat /tmp/server.log
```

### Payment not working
1. Check Stripe keys in .env
2. Enable Stripe in test mode
3. Check webhook configuration

### Email not sending
1. Verify SMTP credentials
2. For Gmail: Use App Password (not regular password)
3. Check: https://myaccount.google.com/apppasswords

---

## 📞 Support

For issues or questions, check:
1. Server logs
2. Browser console
3. Network tab for API errors

---

**Version:** 1.0.0  
**Last Updated:** March 2026
