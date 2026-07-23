FROM node:20-alpine AS builder
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx vite build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /app/exports /app/generated /app/server/data && \
    chown -R appuser:appgroup /app
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=frontend-builder /app/dist ./dist
COPY --from=frontend-builder /app/public ./public
COPY tools.html ./
COPY server/ ./server/
EXPOSE 8080
USER appuser
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/server.js"]
