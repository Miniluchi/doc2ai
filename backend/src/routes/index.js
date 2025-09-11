import express from 'express'
import sourcesRouter from './sources.js'
import conversionsRouter from './conversions.js'
import monitoringRouter from './monitoring.js'

const router = express.Router()

// API routes
router.use('/sources', sourcesRouter)
router.use('/conversions', conversionsRouter)
router.use('/monitoring', monitoringRouter)

// Health check route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Doc2AI API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

// API info route
router.get('/', (req, res) => {
  res.json({
    name: 'Doc2AI Backend API',
    version: '1.0.0',
    description: 'API for converting documents to Markdown using AI',
    endpoints: {
      sources: '/api/sources',
      conversions: '/api/conversions',
      monitoring: '/api/monitoring'
    },
    documentation: 'https://github.com/yourusername/doc2ai'
  })
})

export default router