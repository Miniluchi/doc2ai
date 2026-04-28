import getDb from '../config/database.js';
import { conversionJobs, convertedFiles, sources } from '../db/schema.js';
import { eq, and, count, gte, lt, inArray, desc } from 'drizzle-orm';
import { ConverterFactory } from '../converters/converterFactory.js';
import path from 'node:path';
import fs from 'fs-extra';
import config from '../config/env.js';
import logger from '../config/logger.js';
import { enrichSourceWithConfig, getValidatedDestination } from '../utils/configParser.js';
import type { ConversionJob, ParsedSource } from '../types/domain.js';

const db = getDb();

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
      const whereClause = status !== null ? eq(conversionJobs.status, status) : undefined;

      const jobs = await db.query.conversionJobs.findMany({
        where: whereClause,
        with: { source: { columns: { id: true, name: true, platform: true } } },
        orderBy: [desc(conversionJobs.createdAt)],
        offset: skip,
        limit,
      });

      const countRows = await db
        .select({ total: count() })
        .from(conversionJobs)
        .where(whereClause);
      const total = countRows[0]?.total ?? 0;

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
      const job = await db.query.conversionJobs.findFirst({
        where: eq(conversionJobs.id, id),
        with: { source: true },
      });

      if (!job) {
        throw new Error('Conversion job not found');
      }

      const enrichedSource = enrichSourceWithConfig(
        job.source as unknown as Parameters<typeof enrichSourceWithConfig>[0],
      );

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
      const [newJob] = await db
        .insert(conversionJobs)
        .values({ sourceId, fileName, filePath, fileSize, status: 'pending' })
        .returning();

      const job = await db.query.conversionJobs.findFirst({
        where: eq(conversionJobs.id, newJob!.id),
        with: { source: true },
      });

      if (!job) {
        throw new Error('Failed to retrieve created job');
      }

      const enrichedSource = enrichSourceWithConfig(
        job.source as unknown as Parameters<typeof enrichSourceWithConfig>[0],
      );

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

      const parsedSourceConfig = job.source.config;
      const sourceName = job.source.name;

      await db
        .update(conversionJobs)
        .set({ status: 'processing', startedAt: new Date(), progress: 10 })
        .where(eq(conversionJobs.id, jobId));

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

      const [completedJob] = await db
        .update(conversionJobs)
        .set({ status: 'completed', progress: 100, outputPath, completedAt: new Date() })
        .where(eq(conversionJobs.id, jobId))
        .returning();

      await db.insert(convertedFiles).values({
        originalPath: job.filePath,
        convertedPath: outputPath,
        fileName: outputFileName,
        fileType: fileExtension,
        platform: job.source.platform,
        checksum: result.checksum ?? 'unknown',
      });

      logger.info(`Job completed: ${job.fileName}`);
      return completedJob as unknown as ConversionJob;
    } catch (error) {
      logger.error({ err: error, fileName: job?.fileName, jobId }, 'Job failed');

      await db
        .update(conversionJobs)
        .set({ status: 'failed', error: (error as Error).message, completedAt: new Date() })
        .where(eq(conversionJobs.id, jobId))
        .catch(() => null);

      throw error;
    }
  }

  async updateJobProgress(jobId: string, progress: number, message?: string): Promise<void> {
    try {
      await db
        .update(conversionJobs)
        .set({ progress: Math.min(100, Math.max(0, progress)) })
        .where(eq(conversionJobs.id, jobId));

      if (message) {
        logger.info(`Job ${jobId}: ${progress}% - ${message}`);
      }
    } catch (error) {
      logger.error({ err: error }, 'Error updating job progress');
    }
  }

  async cancelJob(jobId: string): Promise<ConversionJob> {
    try {
      const [job] = await db
        .update(conversionJobs)
        .set({ status: 'failed', error: 'Cancelled by user', completedAt: new Date() })
        .where(
          and(
            eq(conversionJobs.id, jobId),
            inArray(conversionJobs.status, ['pending', 'processing']),
          ),
        )
        .returning();

      if (!job) {
        throw new Error('Job not found or cannot be cancelled');
      }

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
      const statusCounts = await db
        .select({ status: conversionJobs.status, cnt: count() })
        .from(conversionJobs)
        .groupBy(conversionJobs.status);

      const recentRows = await db
        .select({ recent: count() })
        .from(conversionJobs)
        .where(gte(conversionJobs.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
      const recent = recentRows[0]?.recent ?? 0;

      return {
        byStatus: statusCounts.reduce<Record<string, number>>((acc, row) => {
          acc[row.status] = row.cnt;
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

      const deleted = await db
        .delete(conversionJobs)
        .where(
          and(
            eq(conversionJobs.status, 'completed'),
            lt(conversionJobs.completedAt, cutoffDate),
          ),
        )
        .returning({ id: conversionJobs.id });

      logger.info(`Cleaned up ${deleted.length} old conversion jobs`);
      return deleted.length;
    } catch (error) {
      logger.error({ err: error }, 'Error cleaning up jobs');
      throw error;
    }
  }
}

export default ConversionService;
