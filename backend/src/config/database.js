import { PrismaClient } from '@prisma/client'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { execSync } = require('child_process')

let prisma

// Singleton pattern pour la connexion Prisma
function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    })
  }
  return prisma
}

// Initialisation de la base de données
export async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database...')
    
    // Génère le client Prisma
    console.log('📦 Generating Prisma client...')
    execSync('npx prisma generate', { cwd: process.cwd() })
    
    // Applique les migrations en mode développement
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Running database migrations...')
      execSync('npx prisma migrate deploy', { cwd: process.cwd() })
    }
    
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