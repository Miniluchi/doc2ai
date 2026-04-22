import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import logger from './logger.js';

let prisma;

function getPrismaClient() {
  if (!prisma) {
    const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
    prisma = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    });
  }
  return prisma;
}

export async function initializeDatabase() {
  try {
    logger.info('Initializing database...');

    const client = getPrismaClient();

    await client.$connect();
    logger.info('Database connected successfully');

    return client;
  } catch (error) {
    logger.error({ err: error }, 'Database initialization failed');
    throw error;
  }
}

export async function closeDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  }
}

export { getPrismaClient };
export default getPrismaClient;
