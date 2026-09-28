# ==========================================
# KEYCODE - Multi-stage Production Dockerfile
# ==========================================

# --- Stage 1: Server dependencies ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# --- Stage 2: Frontend build ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx vite build

# --- Stage 3: Production runner ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

# Security: non-root app user & runtime directories
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /app/exports /app/generated /app/server/data /app/uploads /app/preview /app/projects && \
    chown -R appuser:appgroup /app

# Copy production artifacts
COPY --from=builder --chown=appuser:appgroup /app/server/node_modules ./server/node_modules
COPY --from=frontend-builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=frontend-builder --chown=appuser:appgroup /app/public ./public
COPY --from=frontend-builder --chown=appuser:appgroup /app/admin-supabase ./admin-supabase
COPY --from=frontend-builder --chown=appuser:appgroup /app/webfonts ./webfonts
COPY --from=frontend-builder --chown=appuser:appgroup /app/*.html ./
COPY --from=frontend-builder --chown=appuser:appgroup /app/*.js ./
COPY --from=frontend-builder --chown=appuser:appgroup /app/*.css ./
COPY --from=frontend-builder --chown=appuser:appgroup /app/*.mp4 ./
COPY --from=frontend-builder --chown=appuser:appgroup /app/_headers ./
COPY --from=frontend-builder --chown=appuser:appgroup /app/_redirects ./
COPY --chown=appuser:appgroup server/ ./server/

EXPOSE 5000

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/server.js"]
