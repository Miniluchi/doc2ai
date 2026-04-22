import Queue from 'bull';
import config from '../config/env.js';
import ConversionService from './conversionService.js';

class QueueService {
  constructor() {
    this.conversionService = new ConversionService();

    this.conversionQueue = new Queue('document-conversion', config.redisUrl, {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.conversionQueue.on('completed', (job, result) => {
      console.log(`Job ${job.id} completed: ${result.fileName}`);
    });

    this.conversionQueue.on('failed', (job, error) => {
      console.error(`❌ Job ${job.id} failed:`, error.message);
    });

    this.conversionQueue.on('active', (job) => {
      console.log(`Processing job ${job.id}: ${job.data.fileName}`);
    });

    this.conversionQueue.on('progress', (job, progress) => {
      console.log(`Job ${job.id} progress: ${progress}%`);
    });

    this.conversionQueue.on('error', (error) => {
      console.error('❌ Queue error:', error);
    });
  }

  /**
   * Start consuming the conversion queue.
   * @param {number} concurrency - Number of jobs to process in parallel
   */
  async startProcessing(concurrency = 3) {
    console.log(`Starting queue processor (concurrency: ${concurrency})`);

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
        console.error(`❌ Error processing job ${jobId}:`, error);
        throw error;
      }
    });
  }

  /**
   * Add a conversion job to the queue.
   * @param {string} jobId - ConversionJob DB id
   * @param {string} fileName - Human-readable file name for logging
   * @param {object} [options] - Optional Bull job options (priority, delay)
   * @returns {Promise<Bull.Job>} The created Bull job
   */
  async enqueueConversion(jobId, fileName, options = {}) {
    try {
      const { priority = 0, delay = 0 } = options;

      const job = await this.conversionQueue.add(
        { jobId, fileName },
        {
          priority,
          delay,
          jobId: `conversion-${jobId}`,
        },
      );

      console.log(`Job enqueued: ${fileName} (ID: ${job.id})`);
      return job;
    } catch (error) {
      console.error('❌ Error enqueuing job:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.conversionQueue.getWaitingCount(),
        this.conversionQueue.getActiveCount(),
        this.conversionQueue.getCompletedCount(),
        this.conversionQueue.getFailedCount(),
        this.conversionQueue.getDelayedCount(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
      };
    } catch (error) {
      console.error('❌ Error fetching stats:', error);
      throw error;
    }
  }

  async getActiveJobs() {
    try {
      const jobs = await this.conversionQueue.getActive();
      return jobs.map((job) => ({
        id: job.id,
        data: job.data,
        progress: job.progress(),
        timestamp: job.timestamp,
      }));
    } catch (error) {
      console.error('❌ Error fetching active jobs:', error);
      throw error;
    }
  }

  async getWaitingJobs() {
    try {
      const jobs = await this.conversionQueue.getWaiting();
      return jobs.map((job) => ({
        id: job.id,
        data: job.data,
        timestamp: job.timestamp,
      }));
    } catch (error) {
      console.error('❌ Error fetching waiting jobs:', error);
      throw error;
    }
  }

  async getFailedJobs(limit = 20) {
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
      console.error('❌ Error fetching failed jobs:', error);
      throw error;
    }
  }

  async cleanOldJobs(grace = 24 * 60 * 60 * 1000) {
    try {
      await this.conversionQueue.clean(grace, 'completed');
      await this.conversionQueue.clean(grace, 'failed');
      console.log(`Cleaned jobs older than ${grace / 1000 / 60 / 60}h`);
    } catch (error) {
      console.error('❌ Error cleaning jobs:', error);
      throw error;
    }
  }

  async emptyQueue() {
    try {
      await this.conversionQueue.empty();
      console.log('Queue emptied');
    } catch (error) {
      console.error('❌ Error emptying queue:', error);
      throw error;
    }
  }

  async pause() {
    try {
      await this.conversionQueue.pause();
      console.log('Queue paused');
    } catch (error) {
      console.error('❌ Error pausing queue:', error);
      throw error;
    }
  }

  async resume() {
    try {
      await this.conversionQueue.resume();
      console.log('Queue resumed');
    } catch (error) {
      console.error('❌ Error resuming queue:', error);
      throw error;
    }
  }

  async close() {
    try {
      await this.conversionQueue.close();
      console.log('Queue closed');
    } catch (error) {
      console.error('❌ Error closing queue:', error);
      throw error;
    }
  }
}

const queueService = new QueueService();

export default queueService;
