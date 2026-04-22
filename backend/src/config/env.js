import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
const requiredVars = ['JWT_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL'];

for (const varName of requiredVars) {
  if (!process.env[varName]) {
    console.error(`❌ Missing required environment variable: ${varName}`);
    process.exit(1);
  }
}

const config = {
  port: parseInt(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  databaseUrl: process.env.DATABASE_URL,

  jwtSecret: process.env.JWT_SECRET,
  encryptionKey: process.env.ENCRYPTION_KEY,

  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    tenantId: process.env.MICROSOFT_TENANT_ID,
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  },

  redisUrl: process.env.REDIS_URL,

  storagePath: path.resolve(process.env.STORAGE_PATH || './storage'),
  tempPath: path.resolve(process.env.TEMP_PATH || './temp'),
  exportPath: path.resolve(process.env.EXPORT_PATH || './exports'),

  logLevel: process.env.LOG_LEVEL || 'info',
  syncIntervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES) || 15,

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // requests per windowMs
  },
};

if (config.encryptionKey.length !== 32) {
  console.error('❌ ENCRYPTION_KEY must be exactly 32 characters long');
  process.exit(1);
}

export default config;
