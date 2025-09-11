import monitoringService from '../services/monitoringService.js'

class MonitoringController {
  // GET /api/monitoring/status
  async getStatus(req, res) {
    try {
      const status = await monitoringService.getStatus()
      
      res.json({
        success: true,
        data: status
      })
    } catch (error) {
      console.error('Error in getStatus:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to get monitoring status',
        error: error.message
      })
    }
  }

  // POST /api/monitoring/start
  async startMonitoring(req, res) {
    try {
      if (monitoringService.isRunning) {
        return res.status(400).json({
          success: false,
          message: 'Monitoring service is already running'
        })
      }

      await monitoringService.start()
      
      res.json({
        success: true,
        message: 'Monitoring service started successfully'
      })
    } catch (error) {
      console.error('Error in startMonitoring:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to start monitoring service',
        error: error.message
      })
    }
  }

  // POST /api/monitoring/stop
  async stopMonitoring(req, res) {
    try {
      if (!monitoringService.isRunning) {
        return res.status(400).json({
          success: false,
          message: 'Monitoring service is not running'
        })
      }

      await monitoringService.stop()
      
      res.json({
        success: true,
        message: 'Monitoring service stopped successfully'
      })
    } catch (error) {
      console.error('Error in stopMonitoring:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to stop monitoring service',
        error: error.message
      })
    }
  }

  // GET /api/monitoring/logs
  async getLogs(req, res) {
    try {
      const sourceId = req.query.sourceId || null
      const limit = parseInt(req.query.limit) || 50

      const logs = await monitoringService.getLogs(sourceId, limit)
      
      res.json({
        success: true,
        data: logs
      })
    } catch (error) {
      console.error('Error in getLogs:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch monitoring logs',
        error: error.message
      })
    }
  }

  // POST /api/monitoring/sync/:sourceId
  async syncSource(req, res) {
    try {
      const { sourceId } = req.params
      
      if (!monitoringService.isRunning) {
        return res.status(400).json({
          success: false,
          message: 'Monitoring service is not running'
        })
      }

      await monitoringService.syncSource(sourceId)
      
      res.json({
        success: true,
        message: 'Source sync completed successfully'
      })
    } catch (error) {
      console.error('Error in syncSource:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to sync source',
        error: error.message
      })
    }
  }

  // GET /api/monitoring/health
  async healthCheck(req, res) {
    try {
      const status = await monitoringService.getStatus()
      const isHealthy = status.isRunning && status.activeMonitors === status.totalActiveSources
      
      res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        data: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          monitoring: status.isRunning,
          activeMonitors: status.activeMonitors,
          totalSources: status.totalActiveSources,
          lastSync: status.lastSync,
          timestamp: new Date().toISOString()
        }
      })
    } catch (error) {
      console.error('Error in healthCheck:', error)
      res.status(503).json({
        success: false,
        data: {
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        }
      })
    }
  }

  // POST /api/monitoring/restart
  async restartMonitoring(req, res) {
    try {
      console.log('🔄 Restarting monitoring service...')
      
      // Arrêter le service s'il tourne
      if (monitoringService.isRunning) {
        await monitoringService.stop()
      }
      
      // Attendre un peu avant de redémarrer
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Redémarrer
      await monitoringService.start()
      
      res.json({
        success: true,
        message: 'Monitoring service restarted successfully'
      })
    } catch (error) {
      console.error('Error in restartMonitoring:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to restart monitoring service',
        error: error.message
      })
    }
  }

  // GET /api/monitoring/sources/:sourceId/logs
  async getSourceLogs(req, res) {
    try {
      const { sourceId } = req.params
      const limit = parseInt(req.query.limit) || 50

      const logs = await monitoringService.getLogs(sourceId, limit)
      
      res.json({
        success: true,
        data: logs
      })
    } catch (error) {
      console.error('Error in getSourceLogs:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch source logs',
        error: error.message
      })
    }
  }
}

export default MonitoringController