import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

let prisma

// Singleton pattern pour la connexion Prisma
function getPrismaClient() {
  if (!prisma) {
    const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
    prisma = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    })
  }
  return prisma
}

// Initialisation de la base de données
export async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database...')
    
    const client = getPrismaClient()
    
    // Test de connexion
    await client.$connect()
    console.log('✅ Database connected successfully')
    
    return client
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    throw error
  }
}

// Fermeture propre de la connexion
export async function closeDatabase() {
  if (prisma) {
    await prisma.$disconnect()
    console.log('🔌 Database disconnected')
  }
}

// Export du client
export { getPrismaClient }
export default getPrismaClient