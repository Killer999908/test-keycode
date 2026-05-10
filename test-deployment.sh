#!/bin/bash

# KEYCODE - Post-Deployment Testing Script
# This script verifies all critical components are working

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
FRONTEND_URL="${1:-http://localhost:3000}"
API_URL="${2:-http://localhost:5000/api}"

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}KEYCODE - Deployment Test${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo -e "Frontend URL: ${BLUE}$FRONTEND_URL${NC}"
echo -e "API URL: ${BLUE}$API_URL${NC}"
echo ""

# Test 1: Frontend Accessibility
echo -e "${YELLOW}[1/6] Testing Frontend Access...${NC}"
if curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ Frontend is accessible${NC}"
else
    echo -e "${RED}❌ Frontend not responding${NC}"
fi
echo ""

# Test 2: API Server
echo -e "${YELLOW}[2/6] Testing API Server...${NC}"
if curl -s "$API_URL/health" 2>/dev/null | grep -q "ok\|healthy\|running" || \
   curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" | grep -q "200"; then
    echo -e "${GREEN}✅ API Server is responding${NC}"
else
    echo -e "${RED}⚠️ API Health check - check if endpoint exists${NC}"
fi
echo ""

# Test 3: Service Worker
echo -e "${YELLOW}[3/6] Testing Service Worker...${NC}"
if curl -s "$FRONTEND_URL/sw.js" -o /dev/null -w "%{http_code}" | grep -q "200"; then
    echo -e "${GREEN}✅ Service Worker loaded${NC}"
else
    echo -e "${RED}⚠️ Service Worker not accessible${NC}"
fi
echo ""

# Test 4: Static Assets
echo -e "${YELLOW}[4/6] Testing Static Assets...${NC}"
if curl -s "$FRONTEND_URL/manifest.json" -o /dev/null -w "%{http_code}" | grep -q "200"; then
    echo -e "${GREEN}✅ Static assets accessible${NC}"
else
    echo -e "${RED}⚠️ Static assets check - may need CORS headers${NC}"
fi
echo ""

# Test 5: CORS Headers
echo -e "${YELLOW}[5/6] Testing CORS Headers...${NC}"
CORS_HEADER=$(curl -s -I "$API_URL" | grep -i "access-control-allow-origin" || echo "NOT_SET")
if [ "$CORS_HEADER" != "NOT_SET" ]; then
    echo -e "${GREEN}✅ CORS headers configured${NC}"
    echo "   $CORS_HEADER"
else
    echo -e "${YELLOW}⚠️ CORS may need configuration for frontend access${NC}"
fi
echo ""

# Test 6: Database Connection (optional)
echo -e "${YELLOW}[6/6] Testing Database Connection...${NC}"
API_TEST=$(curl -s -X POST "$API_URL/test-db" 2>/dev/null || echo "{}")
if echo "$API_TEST" | grep -q "connected\|success\|ok"; then
    echo -e "${GREEN}✅ Database connected${NC}"
else
    echo -e "${YELLOW}⚠️ Database connection endpoint not available${NC}"
    echo "   (This is normal if endpoint doesn't exist)"
fi
echo ""

# Summary
echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}✅ Deployment test completed!${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Visit ${BLUE}$FRONTEND_URL${NC} to see the website"
echo "2. Open browser console (F12) to check for errors"
echo "3. Test interactive features (login, uploads, etc.)"
echo "4. Check Network tab for failed API calls"
echo ""
echo -e "${YELLOW}Troubleshooting:${NC}"
echo "- Check browser console for CORS errors"
echo "- Verify environment variables in deployment platform"
echo "- Check API logs in hosting dashboard"
