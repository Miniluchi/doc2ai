import Bull from 'bull';
import config from '../config/env.js';
import logger from '../config/logger.js';
import ConversionService from './conversionService.js';

interface ConversionJobData {
  jobId: string;
  fileName: string;
}

interface EnqueueOptions {
  priority?: number;
  delay?: number;
}

class QueueService {
  private readonly conversionService: ConversionService;
  private readonly conversionQueue: Bull.Queue<ConversionJobData>;

  constructor() {
    this.conversionService = new ConversionService();

    this.conversionQueue = new Bull<ConversionJobData>('document-conversion', config.redisUrl ?? '', {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.conversionQueue.on('completed', (job, result: { fileName: string }) => {
      logger.info(`Job ${job.id} completed: ${result.fileName}`);
    });

    this.conversionQueue.on('failed', (job, error) => {
      logger.error({ err: error, jobId: job.id }, 'Job failed');
    });

    this.conversionQueue.on('active', (job) => {
      logger.info(`Processing job ${job.id}: ${job.data.fileName}`);
    });

    this.conversionQueue.on('progress', (job, progress) => {
      logger.info(`Job ${job.id} progress: ${String(progress)}%`);
    });

    this.conversionQueue.on('error', (error) => {
      logger.error({ err: error }, 'Queue error');
    });
  }

  async startProcessing(concurrency = 3): Promise<void> {
    logger.info(`Starting queue processor (concurrency: ${concurrency})`);

    this.conversionQueue.process(concurrency, async (job) => {
      const { jobId, fileName } = job.data;

      try {
        await job.progress(10);
        const result = await this.conversionService.processJob(jobId);
        await job.progress(100);

        return {
          success: true,
          jobId,
          fileName,
          outputPath: result.outputPath,
        };
      } catch (error) {
        logger.error({ err: error, jobId }, 'Error processing job');
        throw error;
      }
    });
  }

  async enqueueConversion(
    jobId: string,
    fileName: string,
    options: EnqueueOptions = {},
  ): Promise<Bull.Job<ConversionJobData>> {
    try {
      const { priority = 0, delay = 0 } = options;

      const job = await this.conversionQueue.add(
        { jobId, fileName },
        { priority, delay, jobId: `conversion-${jobId}` },
      );

      logger.info(`Job enqueued: ${fileName} (ID: ${job.id})`);
      return job;
    } catch (error) {
      logger.error({ err: error }, 'Error enqueuing job');
      throw error;
    }
  }

  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    total: number;
  }> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.conversionQueue.getWaitingCount(),
        this.conversionQueue.getActiveCount(),
        this.conversionQueue.getCompletedCount(),
        this.conversionQueue.getFailedCount(),
        this.conversionQueue.getDelayedCount(),
      ]);

      return { waiting, active, completed, failed, delayed, total: waiting + active + completed + failed + delayed };
    } catch (error) {
      logger.error({ err: error }, 'Error fetching stats');
      throw error;
    }
  }

  async getActiveJobs(): Promise<
    Array<{ id: Bull.JobId; data: ConversionJobData; progress: number; timestamp: number }>
  > {
    try {
      const jobs = await this.conversionQueue.getActive();
      return jobs.map((job) => ({
        id: job.id,
        data: job.data,
        progress: job.progress() as number,
        timestamp: job.timestamp,
      }));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching active jobs');
      throw error;
    }
  }

  async getWaitingJobs(): Promise<
    Array<{ id: Bull.JobId; data: ConversionJobData; timestamp: number }>
  > {
    try {
      const jobs = await this.conversionQueue.getWaiting();
      return jobs.map((job) => ({ id: job.id, data: job.data, timestamp: job.timestamp }));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching waiting jobs');
      throw error;
    }
  }

  async getFailedJobs(limit = 20): Promise<
    Array<{
      id: Bull.JobId;
      data: ConversionJobData;
      failedReason: string;
      stacktrace: string[];
      timestamp: number;
      attemptsMade: number;
    }>
  > {
    try {
      const jobs = await this.conversionQueue.getFailed(0, limit - 1);
      return jobs.map((job) => ({
        id: job.id,
        data: job.data,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        timestamp: job.timestamp,
        attemptsMade: job.attemptsMade,
      }));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching failed jobs');
      throw error;
    }
  }

  async cleanOldJobs(grace = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      await this.conversionQueue.clean(grace, 'completed');
      await this.conversionQueue.clean(grace, 'failed');
      logger.info(`Cleaned jobs older than ${grace / 1000 / 60 / 60}h`);
    } catch (error) {
      logger.error({ err: error }, 'Error cleaning jobs');
      throw error;
    }
  }

  async emptyQueue(): Promise<void> {
    try {
      await this.conversionQueue.empty();
      logger.info('Queue emptied');
    } catch (error) {
      logger.error({ err: error }, 'Error emptying queue');
      throw error;
    }
  }

  async pause(): Promise<void> {
    try {
      await this.conversionQueue.pause();
      logger.info('Queue paused');
    } catch (error) {
      logger.error({ err: error }, 'Error pausing queue');
      throw error;
    }
  }

  async resume(): Promise<void> {
    try {
      await this.conversionQueue.resume();
      logger.info('Queue resumed');
    } catch (error) {
      logger.error({ err: error }, 'Error resuming queue');
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      await this.conversionQueue.close();
      logger.info('Queue closed');
    } catch (error) {
      logger.error({ err: error }, 'Error closing queue');
      throw error;
    }
  }
}

const queueService = new QueueService();

export default queueService;
