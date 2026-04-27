# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.js ./
COPY tsconfig.json ./

# Install all deps (including devDeps for tsc)
RUN npm ci

COPY src ./src/

# Compile TypeScript
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.js ./

# Production deps + Prisma client generation
RUN npm ci --omit=dev \
  && npx prisma generate \
  && mkdir -p /app/storage /app/temp /app/prisma

COPY --from=builder /app/dist ./dist/

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && node dist/app.js"]
