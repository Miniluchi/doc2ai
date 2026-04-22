import getPrismaClient from '../config/database.js';
import { ConverterFactory } from '../converters/converterFactory.js';
import path from 'path';
import fs from 'fs-extra';
import config from '../config/env.js';
import { enrichSourceWithConfig, getValidatedDestination } from '../utils/configParser.js';

const prisma = getPrismaClient();

class ConversionService {
  async getAllJobs(page = 1, limit = 20, status = null) {
    try {
      const skip = (page - 1) * limit;
      const where = status ? { status } : {};

      const jobs = await prisma.conversionJob.findMany({
        where,
        include: {
          source: {
            select: { id: true, name: true, platform: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      });

      const total = await prisma.conversionJob.count({ where });

      return {
        jobs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Error fetching conversion jobs:', error);
      throw error;
    }
  }

  async getJobById(id) {
    try {
      const job = await prisma.conversionJob.findUnique({
        where: { id },
        include: {
          source: true,
        },
      });

      if (!job) {
        throw new Error('Conversion job not found');
      }

      if (job.source) {
        job.source = enrichSourceWithConfig(job.source);
      }

      return job;
    } catch (error) {
      console.error('Error fetching job:', error);
      throw error;
    }
  }

  /**
   * Create a new pending ConversionJob record in the database.
   * @param {string} sourceId - ID of the parent Source
   * @param {string} fileName - Original file name
   * @param {string} filePath - Local path to the downloaded file
   * @param {number|null} [fileSize] - File size in bytes
   * @returns {Promise<object>} Created job with source relation
   */
  async createJob(sourceId, fileName, filePath, fileSize = null) {
    try {
      const job = await prisma.conversionJob.create({
        data: {
          sourceId,
          fileName,
          filePath,
          fileSize,
          status: 'pending',
        },
        include: {
          source: true,
        },
      });

      if (job.source) {
        job.source = enrichSourceWithConfig(job.source);
      }

      console.log(`Conversion job created: ${fileName}`);
      return job;
    } catch (error) {
      console.error('Error creating job:', error);
      throw error;
    }
  }

  /**
   * Execute a conversion job: download → convert → export → mark complete.
   * Updates job status and progress in the database throughout.
   * @param {string} jobId - ConversionJob DB id
   * @returns {Promise<object>} Completed job record
   * @throws {Error} On conversion failure (job is also marked as failed in DB)
   */
  async processJob(jobId) {
    let job;
    try {
      job = await this.getJobById(jobId);

      const parsedConfig = job.source.config;

      job = await prisma.conversionJob.update({
        where: { id: jobId },
        data: {
          status: 'processing',
          startedAt: new Date(),
          progress: 10,
        },
        include: { source: true },
      });

      job.source.config = parsedConfig;

      console.log(`Processing job: ${job.fileName}`);

      const fileExtension = path.extname(job.filePath).toLowerCase();
      const converter = ConverterFactory.getConverter(fileExtension);

      if (!converter) {
        throw new Error(`Unsupported file format: ${fileExtension}`);
      }

      await this.updateJobProgress(jobId, 30, 'Initializing converter');

      await fs.ensureDir(config.storagePath);
      await fs.ensureDir(config.tempPath);

      const outputFileName = path.basename(job.fileName, fileExtension) + '.md';
      const destinationFolder = getValidatedDestination(job.source.config, job.source.name);
      const outputPath = path.join(config.storagePath, destinationFolder, outputFileName);

      await fs.ensureDir(path.dirname(outputPath));

      await this.updateJobProgress(jobId, 50, 'Converting file');
      const result = await converter.convert(job.filePath, outputPath);

      if (!result.success) {
        throw new Error(result.error || 'Conversion failed');
      }

      await this.updateJobProgress(jobId, 80, 'Exporting to configured destination');

      try {
        await fs.ensureDir(config.exportPath);

        const destination = getValidatedDestination(job.source.config, job.source.name);

        const exportFilePath = path.join(config.exportPath, destination, outputFileName);

        await fs.ensureDir(path.dirname(exportFilePath));
        await fs.copy(outputPath, exportFilePath);
        console.log(`File exported to: ${exportFilePath}`);
      } catch (error) {
        console.warn(`Warning: Failed to export to configured destination:`, error.message);
      }

      const completedJob = await prisma.conversionJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          progress: 100,
          outputPath,
          completedAt: new Date(),
        },
      });

      await prisma.convertedFile.create({
        data: {
          originalPath: job.filePath,
          convertedPath: outputPath,
          fileName: outputFileName,
          fileType: fileExtension,
          platform: job.source.platform,
          checksum: result.checksum || 'unknown',
        },
      });

      console.log(`Job completed: ${job.fileName}`);
      return completedJob;
    } catch (error) {
      console.error(`❌ Job failed: ${job?.fileName || jobId}`, error);

      await prisma.conversionJob
        .update({
          where: { id: jobId },
          data: {
            status: 'failed',
            error: error.message,
            completedAt: new Date(),
          },
        })
        .catch(() => null);

      throw error;
    }
  }

  async updateJobProgress(jobId, progress, message = null) {
    try {
      await prisma.conversionJob.update({
        where: { id: jobId },
        data: {
          progress: Math.min(100, Math.max(0, progress)),
        },
      });

      if (message) {
        console.log(`Job ${jobId}: ${progress}% - ${message}`);
      }
    } catch (error) {
      console.error('Error updating job progress:', error);
    }
  }

  async cancelJob(jobId) {
    try {
      const job = await prisma.conversionJob.update({
        where: {
          id: jobId,
          status: { in: ['pending', 'processing'] },
        },
        data: {
          status: 'failed',
          error: 'Cancelled by user',
          completedAt: new Date(),
        },
      });

      console.log(`Job cancelled: ${job.fileName}`);
      return job;
    } catch (error) {
      console.error('Error cancelling job:', error);
      throw error;
    }
  }

  async getJobStats() {
    try {
      const stats = await prisma.conversionJob.groupBy({
        by: ['status'],
        _count: {
          _all: true,
        },
      });

      const recent = await prisma.conversionJob.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24h
          },
        },
      });

      return {
        byStatus: stats.reduce((acc, stat) => {
          acc[stat.status] = stat._count._all;
          return acc;
        }, {}),
        recent,
      };
    } catch (error) {
      console.error('Error fetching job stats:', error);
      throw error;
    }
  }

  async cleanupCompletedJobs(olderThanDays = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await prisma.conversionJob.deleteMany({
        where: {
          status: 'completed',
          completedAt: {
            lt: cutoffDate,
          },
        },
      });

      console.log(`Cleaned up ${result.count} old conversion jobs`);
      return result.count;
    } catch (error) {
      console.error('Error cleaning up jobs:', error);
      throw error;
    }
  }
}

export default ConversionService;
