# Drizzle Migrations

## Baseline strategy

The initial migration (`0000_initial_schema.sql`) uses `CREATE TABLE IF NOT EXISTS` and
`CREATE INDEX IF NOT EXISTS` throughout. This makes it **idempotent**:

- **Fresh database** — all tables and indexes are created normally.
- **Existing Prisma database** (volume already populated) — every statement is a no-op because
  the objects already exist. Drizzle records the migration as applied in `__drizzle_migrations`
  and the app boots without touching any existing rows.

No manual seeding of `__drizzle_migrations` is required.

## Timestamp column types

Drizzle uses `integer` columns in `timestamp_ms` mode for all `DateTime` fields. Prisma stored
these as ISO-8601 **text** in SQLite. If you are migrating a live Prisma database you must
backfill the timestamp columns. Run the following SQL once against the existing database before
switching to the Drizzle backend:

```sql
-- Convert text ISO timestamps to integer milliseconds for each table.
-- Run this BEFORE starting the Drizzle backend against an existing Prisma DB.

UPDATE sources
SET lastSync  = CAST(STRFTIME('%s', lastSync)  * 1000 AS INTEGER),
    createdAt = CAST(STRFTIME('%s', createdAt) * 1000 AS INTEGER),
    updatedAt = CAST(STRFTIME('%s', updatedAt) * 1000 AS INTEGER)
WHERE typeof(createdAt) = 'text';

UPDATE conversion_jobs
SET startedAt   = CASE WHEN startedAt   IS NOT NULL THEN CAST(STRFTIME('%s', startedAt)   * 1000 AS INTEGER) END,
    completedAt = CASE WHEN completedAt IS NOT NULL THEN CAST(STRFTIME('%s', completedAt) * 1000 AS INTEGER) END,
    createdAt   = CAST(STRFTIME('%s', createdAt) * 1000 AS INTEGER)
WHERE typeof(createdAt) = 'text';

UPDATE sync_logs
SET createdAt = CAST(STRFTIME('%s', createdAt) * 1000 AS INTEGER)
WHERE typeof(createdAt) = 'text';

UPDATE converted_files
SET createdAt = CAST(STRFTIME('%s', createdAt) * 1000 AS INTEGER),
    updatedAt = CAST(STRFTIME('%s', updatedAt) * 1000 AS INTEGER)
WHERE typeof(createdAt) = 'text';
```

For greenfield deployments (new Docker volume) no action is needed.

## Adding future migrations

```bash
# Generate a new migration after changing src/db/schema.ts
npm run db:generate   # or: bunx drizzle-kit generate

# Apply pending migrations (handled automatically on app start, but can run manually)
npm run db:migrate    # or: bunx drizzle-kit migrate
```
