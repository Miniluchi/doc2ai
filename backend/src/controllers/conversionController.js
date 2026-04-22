import ConversionService from '../services/conversionService.js';
import logger from '../config/logger.js';

const conversionService = new ConversionService();

class ConversionController {
  // GET /api/conversions
  async getAllJobs(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const status = req.query.status || null;

      const result = await conversionService.getAllJobs(page, limit, status);

      res.json({
        success: true,
        data: result.jobs,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in getAllJobs');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversion jobs',
        error: error.message,
      });
    }
  }

  // GET /api/conversions/:id
  async getJobById(req, res) {
    try {
      const { id } = req.params;
      const job = await conversionService.getJobById(id);

      res.json({
        success: true,
        data: job,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in getJobById');

      if (error.message === 'Conversion job not found') {
        return res.status(404).json({
          success: false,
          message: 'Conversion job not found',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversion job',
        error: error.message,
      });
    }
  }

  // POST /api/conversions
  async createJob(req, res) {
    try {
      const { sourceId, fileName, filePath, fileSize } = req.body;

      // Validation
      if (!sourceId || !fileName || !filePath) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: sourceId, fileName, filePath',
        });
      }

      const job = await conversionService.createJob(sourceId, fileName, filePath, fileSize);

      conversionService
        .processJob(job.id)
        .then(() => {
          logger.info({ jobId: job.id }, 'Job completed');
        })
        .catch((error) => {
          logger.error({ err: error, jobId: job.id }, 'Job failed');
        });

      res.status(201).json({
        success: true,
        data: job,
        message: 'Conversion job created and started',
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in createJob');
      res.status(500).json({
        success: false,
        message: 'Failed to create conversion job',
        error: error.message,
      });
    }
  }

  // DELETE /api/conversions/:id
  async cancelJob(req, res) {
    try {
      const { id } = req.params;
      const job = await conversionService.cancelJob(id);

      res.json({
        success: true,
        data: job,
        message: 'Job cancelled successfully',
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in cancelJob');
      res.status(500).json({
        success: false,
        message: 'Failed to cancel job',
        error: error.message,
      });
    }
  }

  // GET /api/conversions/stats
  async getStats(req, res) {
    try {
      const stats = await conversionService.getJobStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in getStats');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversion statistics',
        error: error.message,
      });
    }
  }

  // POST /api/conversions/cleanup
  async cleanupJobs(req, res) {
    try {
      const { olderThanDays = 30 } = req.body;
      const deletedCount = await conversionService.cleanupCompletedJobs(olderThanDays);

      res.json({
        success: true,
        data: { deletedCount },
        message: `Cleaned up ${deletedCount} old conversion jobs`,
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in cleanupJobs');
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup jobs',
        error: error.message,
      });
    }
  }

  // GET /api/conversions/:id/progress
  async getJobProgress(req, res) {
    try {
      const { id } = req.params;
      const job = await conversionService.getJobById(id);

      res.json({
        success: true,
        data: {
          id: job.id,
          status: job.status,
          progress: job.progress,
          error: job.error,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in getJobProgress');
      res.status(500).json({
        success: false,
        message: 'Failed to get job progress',
        error: error.message,
      });
    }
  }

  // POST /api/conversions/:id/retry
  async retryJob(req, res) {
    try {
      const { id } = req.params;
      const job = await conversionService.getJobById(id);

      if (job.status !== 'failed') {
        return res.status(400).json({
          success: false,
          message: 'Can only retry failed jobs',
        });
      }

      const updatedJob = await conversionService.createJob(
        job.sourceId,
        job.fileName,
        job.filePath,
        job.fileSize,
      );

      conversionService
        .processJob(updatedJob.id)
        .then(() => {
          logger.info({ jobId: updatedJob.id }, 'Retry job completed');
        })
        .catch((error) => {
          logger.error({ err: error, jobId: updatedJob.id }, 'Retry job failed');
        });

      res.json({
        success: true,
        data: updatedJob,
        message: 'Job retry started',
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in retryJob');
      res.status(500).json({
        success: false,
        message: 'Failed to retry job',
        error: error.message,
      });
    }
  }
}

export default ConversionController;
