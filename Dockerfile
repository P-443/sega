# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Egyptian Sega 3x3 — production image (multi-stage)
# Next.js + Socket.IO custom server + Prisma/PostgreSQL
# No secrets in here — everything comes from env at runtime.
# ─────────────────────────────────────────────────────────────

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ── Build stage ──
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client, build Next.js, bundle the custom server
RUN npx prisma generate && npm run build

# ── Production dependencies (lean) ──
FROM node:20-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund && npx prisma generate

# ── Runtime ──
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system app && useradd --system --gid app app

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY scripts/start.cjs ./scripts/start.cjs
RUN chown -R app:app /app

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Applies `prisma migrate deploy` (with DB boot retry), then runs the server
ENTRYPOINT ["node", "scripts/start.cjs"]
