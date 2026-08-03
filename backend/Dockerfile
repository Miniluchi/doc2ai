# ── Build stage ──────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock* ./
COPY drizzle.config.ts ./
COPY tsconfig.json ./

# Install all deps (including devDeps for tsc)
RUN bun install --frozen-lockfile

COPY src ./src/
COPY drizzle ./drizzle/

# Compile TypeScript
RUN bun run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock* ./
COPY drizzle.config.ts ./
COPY drizzle ./drizzle/

# Production deps only
RUN bun install --frozen-lockfile --production \
  && mkdir -p /app/storage /app/temp /app/data

COPY --from=builder /app/dist ./dist/

EXPOSE 3000

# Liveness probe: the API answers on /api/health.
# start-period covers migrations, which run at startup before the server listens.
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD wget --quiet --spider --tries=1 http://127.0.0.1:3000/api/health || exit 1

# Migrations run in-process inside initializeDatabase() on startup
CMD ["bun", "dist/app.js"]
