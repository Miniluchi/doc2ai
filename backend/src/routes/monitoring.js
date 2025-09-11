import express from 'express'
import MonitoringController from '../controllers/monitoringController.js'

const router = express.Router()
const monitoringController = new MonitoringController()

// Routes pour le monitoring
router.get('/status', monitoringController.getStatus.bind(monitoringController))
router.get('/health', monitoringController.healthCheck.bind(monitoringController))
router.get('/logs', monitoringController.getLogs.bind(monitoringController))
router.get('/sources/:sourceId/logs', monitoringController.getSourceLogs.bind(monitoringController))
router.post('/start', monitoringController.startMonitoring.bind(monitoringController))
router.post('/stop', monitoringController.stopMonitoring.bind(monitoringController))
router.post('/restart', monitoringController.restartMonitoring.bind(monitoringController))
router.post('/sync/:sourceId', monitoringController.syncSource.bind(monitoringController))

export default router