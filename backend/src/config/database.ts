import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import * as schema from '../db/schema.js';
import logger from './logger.js';

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

let db: DbInstance | undefined;
let sqlite: InstanceType<typeof Database> | undefined;

function resolveDbPath(url: string): string {
  return url.replace(/^file:/, '');
}

export function getDb(): DbInstance {
  if (!db) {
    const dbUrl = process.env['DATABASE_URL'] ?? 'file:./dev.db';
    const dbPath = resolveDbPath(dbUrl);

    sqlite = new Database(dbPath);
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('journal_mode = WAL');

    db = drizzle(sqlite, { schema });
    logger.info({ path: dbPath }, 'Database connection established');
  }
  return db;
}

export async function initializeDatabase(): Promise<DbInstance> {
  try {
    logger.info('Initializing database...');
    const database = getDb();

    const migrationsFolder = path.resolve('./drizzle');
    migrate(database, { migrationsFolder });

    logger.info('Database initialized successfully');
    return database;
  } catch (error) {
    logger.error({ err: error }, 'Database initialization failed');
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  if (sqlite) {
    sqlite.close();
    sqlite = undefined;
    db = undefined;
    logger.info('Database disconnected');
  }
}

export default getDb;
