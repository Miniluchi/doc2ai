import express from 'express'
import ConversionController from '../controllers/conversionController.js'

const router = express.Router()
const conversionController = new ConversionController()

// Routes pour les conversions
router.get('/stats', conversionController.getStats.bind(conversionController))
router.post('/cleanup', conversionController.cleanupJobs.bind(conversionController))
router.get('/', conversionController.getAllJobs.bind(conversionController))
router.get('/:id', conversionController.getJobById.bind(conversionController))
router.get('/:id/progress', conversionController.getJobProgress.bind(conversionController))
router.post('/', conversionController.createJob.bind(conversionController))
router.post('/:id/retry', conversionController.retryJob.bind(conversionController))
router.delete('/:id', conversionController.cancelJob.bind(conversionController))

export default router