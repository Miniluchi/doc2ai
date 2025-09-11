import ConversionService from '../services/conversionService.js'

const conversionService = new ConversionService()

class ConversionController {
  // GET /api/conversions
  async getAllJobs(req, res) {
    try {
      const page = parseInt(req.query.page) || 1
      const limit = parseInt(req.query.limit) || 20
      const status = req.query.status || null

      const result = await conversionService.getAllJobs(page, limit, status)
      
      res.json({
        success: true,
        data: result.jobs,
        pagination: result.pagination
      })
    } catch (error) {
      console.error('Error in getAllJobs:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversion jobs',
        error: error.message
      })
    }
  }

  // GET /api/conversions/:id
  async getJobById(req, res) {
    try {
      const { id } = req.params
      const job = await conversionService.getJobById(id)
      
      res.json({
        success: true,
        data: job
      })
    } catch (error) {
      console.error('Error in getJobById:', error)
      
      if (error.message === 'Conversion job not found') {
        return res.status(404).json({
          success: false,
          message: 'Conversion job not found'
        })
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversion job',
        error: error.message
      })
    }
  }

  // POST /api/conversions
  async createJob(req, res) {
    try {
      const { sourceId, fileName, filePath, fileSize } = req.body

      // Validation
      if (!sourceId || !fileName || !filePath) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: sourceId, fileName, filePath'
        })
      }

      const job = await conversionService.createJob(sourceId, fileName, filePath, fileSize)
      
      // Traiter le job immédiatement (en arrière-plan)
      conversionService.processJob(job.id)
        .then(() => {
          console.log(`✅ Job ${job.id} completed`)
        })
        .catch((error) => {
          console.error(`❌ Job ${job.id} failed:`, error)
        })

      res.status(201).json({
        success: true,
        data: job,
        message: 'Conversion job created and started'
      })
    } catch (error) {
      console.error('Error in createJob:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to create conversion job',
        error: error.message
      })
    }
  }

  // DELETE /api/conversions/:id
  async cancelJob(req, res) {
    try {
      const { id } = req.params
      const job = await conversionService.cancelJob(id)
      
      res.json({
        success: true,
        data: job,
        message: 'Job cancelled successfully'
      })
    } catch (error) {
      console.error('Error in cancelJob:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to cancel job',
        error: error.message
      })
    }
  }

  // GET /api/conversions/stats
  async getStats(req, res) {
    try {
      const stats = await conversionService.getJobStats()
      
      res.json({
        success: true,
        data: stats
      })
    } catch (error) {
      console.error('Error in getStats:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversion statistics',
        error: error.message
      })
    }
  }

  // POST /api/conversions/cleanup
  async cleanupJobs(req, res) {
    try {
      const { olderThanDays = 30 } = req.body
      const deletedCount = await conversionService.cleanupCompletedJobs(olderThanDays)
      
      res.json({
        success: true,
        data: { deletedCount },
        message: `Cleaned up ${deletedCount} old conversion jobs`
      })
    } catch (error) {
      console.error('Error in cleanupJobs:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup jobs',
        error: error.message
      })
    }
  }

  // GET /api/conversions/:id/progress
  async getJobProgress(req, res) {
    try {
      const { id } = req.params
      const job = await conversionService.getJobById(id)
      
      res.json({
        success: true,
        data: {
          id: job.id,
          status: job.status,
          progress: job.progress,
          error: job.error,
          startedAt: job.startedAt,
          completedAt: job.completedAt
        }
      })
    } catch (error) {
      console.error('Error in getJobProgress:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to get job progress',
        error: error.message
      })
    }
  }

  // POST /api/conversions/:id/retry
  async retryJob(req, res) {
    try {
      const { id } = req.params
      const job = await conversionService.getJobById(id)
      
      if (job.status !== 'failed') {
        return res.status(400).json({
          success: false,
          message: 'Can only retry failed jobs'
        })
      }

      // Réinitialiser le job
      const updatedJob = await conversionService.createJob(
        job.sourceId,
        job.fileName,
        job.filePath,
        job.fileSize
      )

      // Traiter le nouveau job
      conversionService.processJob(updatedJob.id)
        .then(() => {
          console.log(`✅ Retry job ${updatedJob.id} completed`)
        })
        .catch((error) => {
          console.error(`❌ Retry job ${updatedJob.id} failed:`, error)
        })

      res.json({
        success: true,
        data: updatedJob,
        message: 'Job retry started'
      })
    } catch (error) {
      console.error('Error in retryJob:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to retry job',
        error: error.message
      })
    }
  }
}

export default ConversionController