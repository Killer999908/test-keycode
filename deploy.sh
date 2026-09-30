#!/bin/bash

# ============================================
# KEYCODE Deployment Script
# ============================================

set -e

echo "🚀 Starting KEYCODE deployment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

# Check MongoDB
if ! command -v mongod &> /dev/null; then
    echo -e "${YELLOW}⚠️ MongoDB not found. Make sure it's running.${NC}"
fi

echo -e "${GREEN}✅ Node.js found: $(node --version)${NC}"

# Install dependencies
echo "📦 Installing dependencies..."
cd server
npm install

# Copy environment file
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env 2>/dev/null || cp .env.production .env
    echo -e "${YELLOW}⚠️ Please edit .env with your API keys!${NC}"
fi

# Seed database
echo "🗄️ Seeding database..."
node -e "
const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/keycode')
  .then(async () => {
    const User = require('./models/User');
    const Service = require('./models/Service');
    const admin = await User.findOne({ email: 'admin@keycode.studio' });
    if (!admin) {
      const bcrypt = require('bcryptjs');
      const password = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
      await User.create({
        name: 'Admin',
        email: process.env.ADMIN_EMAIL || 'admin@keycode.studio',
        password: password,
        role: 'admin'
      });
      console.log('✅ Admin user created');
    } else {
      console.log('✅ Admin user exists');
    }
    const count = await Service.countDocuments();
    if (count === 0) {
      const res = await fetch('http://localhost:' + (process.env.PORT || 5000) + '/api/admin/seed', { method: 'POST' });
      console.log('✅ Services seeded');
    } else {
      console.log('✅ Services already exist (' + count + ')');
    }
    mongoose.disconnect();
  })
  .catch(console.error);
" || echo -e "${YELLOW}⚠️ Database seeding skipped${NC}"

# Seed demo marketplace listings (idempotent — safe on every run)
if [ "${SEED_MARKETPLACE:-1}" = "1" ]; then
  echo "🛍️ Seeding demo marketplace listings..."
  (cd server && node seed-marketplace.mjs) || echo -e "${YELLOW}⚠️ Marketplace seeding skipped — run 'npm run seed:marketplace' from server/ later${NC}"
else
  echo "🛍️ SEED_MARKETPLACE=0 — skipping demo marketplace listings"
fi

echo ""
echo -e "${GREEN}🎉 Deployment preparation complete!${NC}"
echo ""
echo "To start the server:"
echo "  cd server && npm start"
echo ""
echo "To run in development:"
echo "  cd server && npm run dev"
echo ""
echo "📋 Don't forget to:"
echo "   1. Edit .env with your API keys"
echo "   2. Set up MongoDB"
echo "   3. Configure Stripe for payments"
echo "   4. Set up email SMTP for notifications"
