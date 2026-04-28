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

# Migrations run in-process inside initializeDatabase() on startup
CMD ["bun", "dist/app.js"]
