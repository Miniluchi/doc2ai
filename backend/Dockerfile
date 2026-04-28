# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# better-sqlite3 requires native compilation on Alpine/musl
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
COPY drizzle.config.ts ./
COPY tsconfig.json ./

# Install all deps (including devDeps for tsc)
RUN npm ci

COPY src ./src/
COPY drizzle ./drizzle/

# Compile TypeScript
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine

# Keep build toolchain for better-sqlite3 native rebuild if no musl prebuilt exists
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
COPY drizzle.config.ts ./
COPY drizzle ./drizzle/

# Production deps only — no Prisma generate needed
RUN npm ci --omit=dev \
  && mkdir -p /app/storage /app/temp /app/data

COPY --from=builder /app/dist ./dist/

EXPOSE 3000

# Migrations run in-process inside initializeDatabase() on startup
CMD ["node", "dist/app.js"]
