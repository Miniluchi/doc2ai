import ConversionService from '../services/conversionService.js';
import logger from '../config/logger.js';
import type { Request, Response } from 'express';

const conversionService = new ConversionService();

class ConversionController {
  async getAllJobs(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt((req.query['page'] as string) ?? '1') || 1;
      const limit = parseInt((req.query['limit'] as string) ?? '20') || 20;
      const status = (req.query['status'] as string) || null;

      const result = await conversionService.getAllJobs(page, limit, status);

      res.json({ success: true, data: result.jobs, pagination: result.pagination });
    } catch (error) {
      logger.error({ err: error }, 'Error in getAllJobs');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversion jobs',
        error: (error as Error).message,
      });
    }
  }

  async getJobById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const job = await conversionService.getJobById(id!);

      res.json({ success: true, data: job });
    } catch (error) {
      logger.error({ err: error }, 'Error in getJobById');

      if ((error as Error).message === 'Conversion job not found') {
        res.status(404).json({ success: false, message: 'Conversion job not found' });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversion job',
        error: (error as Error).message,
      });
    }
  }

  async createJob(req: Request, res: Response): Promise<void> {
    try {
      const { sourceId, fileName, filePath, fileSize } = req.body as {
        sourceId?: string;
        fileName?: string;
        filePath?: string;
        fileSize?: number;
      };

      if (!sourceId || !fileName || !filePath) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: sourceId, fileName, filePath',
        });
        return;
      }

      const job = await conversionService.createJob(sourceId, fileName, filePath, fileSize ?? null);

      conversionService
        .processJob(job.id)
        .then(() => {
          logger.info({ jobId: job.id }, 'Job completed');
        })
        .catch((error: unknown) => {
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
        error: (error as Error).message,
      });
    }
  }

  async cancelJob(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const job = await conversionService.cancelJob(id!);

      res.json({ success: true, data: job, message: 'Job cancelled successfully' });
    } catch (error) {
      logger.error({ err: error }, 'Error in cancelJob');
      res.status(500).json({
        success: false,
        message: 'Failed to cancel job',
        error: (error as Error).message,
      });
    }
  }

  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await conversionService.getJobStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error({ err: error }, 'Error in getStats');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversion statistics',
        error: (error as Error).message,
      });
    }
  }

  async cleanupJobs(req: Request, res: Response): Promise<void> {
    try {
      const { olderThanDays = 30 } = req.body as { olderThanDays?: number };
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
        error: (error as Error).message,
      });
    }
  }

  async getJobProgress(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const job = await conversionService.getJobById(id!);

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
        error: (error as Error).message,
      });
    }
  }

  async retryJob(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const job = await conversionService.getJobById(id!);

      if (job.status !== 'failed') {
        res.status(400).json({ success: false, message: 'Can only retry failed jobs' });
        return;
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
        .catch((error: unknown) => {
          logger.error({ err: error, jobId: updatedJob.id }, 'Retry job failed');
        });

      res.json({ success: true, data: updatedJob, message: 'Job retry started' });
    } catch (error) {
      logger.error({ err: error }, 'Error in retryJob');
      res.status(500).json({
        success: false,
        message: 'Failed to retry job',
        error: (error as Error).message,
      });
    }
  }
}

export default ConversionController;
