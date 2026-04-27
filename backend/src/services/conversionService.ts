import getPrismaClient from '../config/database.js';
import { ConverterFactory } from '../converters/converterFactory.js';
import path from 'node:path';
import fs from 'fs-extra';
import config from '../config/env.js';
import logger from '../config/logger.js';
import { enrichSourceWithConfig, getValidatedDestination } from '../utils/configParser.js';
import type { ConversionJob, ParsedSource } from '../types/domain.js';

const prisma = getPrismaClient();

// Extended ConversionJob shape returned by service methods that include source
interface JobWithSource extends ConversionJob {
  source: ParsedSource;
}

class ConversionService {
  async getAllJobs(
    page = 1,
    limit = 20,
    status: string | null = null,
  ): Promise<{
    jobs: ConversionJob[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    try {
      const skip = (page - 1) * limit;
      const where = status ? { status } : {};

      const jobs = await prisma.conversionJob.findMany({
        where,
        include: {
          source: { select: { id: true, name: true, platform: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      });

      const total = await prisma.conversionJob.count({ where });

      return {
        jobs: jobs as unknown as ConversionJob[],
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error({ err: error }, 'Error fetching conversion jobs');
      throw error;
    }
  }

  async getJobById(id: string): Promise<JobWithSource> {
    try {
      const job = await prisma.conversionJob.findUnique({
        where: { id },
        include: { source: true },
      });

      if (!job) {
        throw new Error('Conversion job not found');
      }

      const enrichedSource = enrichSourceWithConfig(job.source as unknown as Parameters<typeof enrichSourceWithConfig>[0]);

      return { ...(job as unknown as ConversionJob), source: enrichedSource };
    } catch (error) {
      logger.error({ err: error }, 'Error fetching job');
      throw error;
    }
  }

  async createJob(
    sourceId: string,
    fileName: string,
    filePath: string,
    fileSize: number | null = null,
  ): Promise<JobWithSource> {
    try {
      const job = await prisma.conversionJob.create({
        data: {
          sourceId,
          fileName,
          filePath,
          fileSize,
          status: 'pending',
        },
        include: { source: true },
      });

      const enrichedSource = enrichSourceWithConfig(job.source as unknown as Parameters<typeof enrichSourceWithConfig>[0]);

      logger.info(`Conversion job created: ${fileName}`);
      return { ...(job as unknown as ConversionJob), source: enrichedSource };
    } catch (error) {
      logger.error({ err: error }, 'Error creating job');
      throw error;
    }
  }

  async processJob(jobId: string): Promise<ConversionJob> {
    let job: JobWithSource | undefined;
    try {
      job = await this.getJobById(jobId);

      // Save parsed config before the update re-fetches raw source from DB
      const parsedSourceConfig = job.source.config;
      const sourceName = job.source.name;

      await prisma.conversionJob.update({
        where: { id: jobId },
        data: { status: 'processing', startedAt: new Date(), progress: 10 },
      });

      logger.info(`Processing job: ${job.fileName}`);

      const fileExtension = path.extname(job.filePath).toLowerCase();
      const converter = ConverterFactory.getConverter(fileExtension);

      if (!converter) {
        throw new Error(`Unsupported file format: ${fileExtension}`);
      }

      await this.updateJobProgress(jobId, 30, 'Initializing converter');

      await fs.ensureDir(config.storagePath);
      await fs.ensureDir(config.tempPath);

      const outputFileName = path.basename(job.fileName, fileExtension) + '.md';
      const destinationFolder = getValidatedDestination(parsedSourceConfig, sourceName);
      const outputPath = path.join(config.storagePath, destinationFolder, outputFileName);

      await fs.ensureDir(path.dirname(outputPath));

      await this.updateJobProgress(jobId, 50, 'Converting file');
      const result = await converter.convert(job.filePath, outputPath);

      if (!result.success) {
        throw new Error(result.error ?? 'Conversion failed');
      }

      await this.updateJobProgress(jobId, 80, 'Exporting to configured destination');

      try {
        await fs.ensureDir(config.exportPath);

        const destination = getValidatedDestination(parsedSourceConfig, sourceName);
        const exportFilePath = path.join(config.exportPath, destination, outputFileName);

        await fs.ensureDir(path.dirname(exportFilePath));
        await fs.copy(outputPath, exportFilePath);
        logger.info(`File exported to: ${exportFilePath}`);
      } catch (error) {
        logger.warn({ err: error }, 'Failed to export to configured destination');
      }

      const completedJob = await prisma.conversionJob.update({
        where: { id: jobId },
        data: { status: 'completed', progress: 100, outputPath, completedAt: new Date() },
      });

      await prisma.convertedFile.create({
        data: {
          originalPath: job.filePath,
          convertedPath: outputPath,
          fileName: outputFileName,
          fileType: fileExtension,
          platform: job.source.platform,
          checksum: result.checksum ?? 'unknown',
        },
      });

      logger.info(`Job completed: ${job.fileName}`);
      return completedJob as unknown as ConversionJob;
    } catch (error) {
      logger.error(
        { err: error, fileName: job?.fileName, jobId },
        'Job failed',
      );

      await prisma.conversionJob
        .update({
          where: { id: jobId },
          data: { status: 'failed', error: (error as Error).message, completedAt: new Date() },
        })
        .catch(() => null);

      throw error;
    }
  }

  async updateJobProgress(jobId: string, progress: number, message?: string): Promise<void> {
    try {
      await prisma.conversionJob.update({
        where: { id: jobId },
        data: { progress: Math.min(100, Math.max(0, progress)) },
      });

      if (message) {
        logger.info(`Job ${jobId}: ${progress}% - ${message}`);
      }
    } catch (error) {
      logger.error({ err: error }, 'Error updating job progress');
    }
  }

  async cancelJob(jobId: string): Promise<ConversionJob> {
    try {
      const job = await prisma.conversionJob.update({
        where: {
          id: jobId,
          status: { in: ['pending', 'processing'] },
        },
        data: { status: 'failed', error: 'Cancelled by user', completedAt: new Date() },
      });

      logger.info(`Job cancelled: ${job.fileName}`);
      return job as unknown as ConversionJob;
    } catch (error) {
      logger.error({ err: error }, 'Error cancelling job');
      throw error;
    }
  }

  async getJobStats(): Promise<{
    byStatus: Record<string, number>;
    recent: number;
  }> {
    try {
      const stats = await prisma.conversionJob.groupBy({
        by: ['status'],
        _count: { _all: true },
      });

      const recent = await prisma.conversionJob.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });

      return {
        byStatus: stats.reduce<Record<string, number>>((acc, stat) => {
          acc[stat.status] = stat._count._all;
          return acc;
        }, {}),
        recent,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error fetching job stats');
      throw error;
    }
  }

  async cleanupCompletedJobs(olderThanDays = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await prisma.conversionJob.deleteMany({
        where: {
          status: 'completed',
          completedAt: { lt: cutoffDate },
        },
      });

      logger.info(`Cleaned up ${result.count} old conversion jobs`);
      return result.count;
    } catch (error) {
      logger.error({ err: error }, 'Error cleaning up jobs');
      throw error;
    }
  }
}

export default ConversionService;
