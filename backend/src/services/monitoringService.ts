import getPrismaClient from '../config/database.js';
import { DriveConnectorFactory } from '../integrations/base/driveConnectorFactory.js';
import ConversionService from './conversionService.js';
import queueService from './queueService.js';
import { decryptCredentials } from '../utils/encryption.js';
import * as cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import config from '../config/env.js';
import logger from '../config/logger.js';
import type { Source, SourceConfig, SyncLog, FileInfo } from '../types/domain.js';
import type DriveConnector from '../integrations/base/driveConnector.js';

const prisma = getPrismaClient();

interface ActiveMonitor {
  source: Source;
  connector: DriveConnector;
  lastCheck: Date;
}

class MonitoringService {
  isRunning: boolean;
  private readonly activeMonitors: Map<string, ActiveMonitor>;
  private readonly syncInProgress: Set<string>;
  private readonly conversionService: ConversionService;
  private cronJob: ScheduledTask | null;

  constructor() {
    this.isRunning = false;
    this.activeMonitors = new Map();
    this.syncInProgress = new Set();
    this.conversionService = new ConversionService();
    this.cronJob = null;
  }

  private _parseAndDecryptConfig(source: Source): {
    parsedConfig: SourceConfig;
    decryptedConfig: SourceConfig;
  } {
    const parsedConfig: SourceConfig =
      typeof source.config === 'string'
        ? (JSON.parse(source.config) as SourceConfig)
        : (source.config as unknown as SourceConfig);

    const decryptedConfig: SourceConfig = {
      ...parsedConfig,
      credentials: parsedConfig.credentials
        ? (decryptCredentials(parsedConfig.credentials as string) as
            | string
            | Record<string, string>)
        : null,
    };

    return { parsedConfig, decryptedConfig };
  }

  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        logger.warn('Monitoring service is already running');
        return;
      }

      logger.info('Starting monitoring service...');

      const activeSources = await prisma.source.findMany({ where: { status: 'active' } });

      for (const source of activeSources) {
        await this.startSourceMonitoring(source as unknown as Source);
      }

      this.startCronJob();

      this.isRunning = true;
      logger.info(`Monitoring service started for ${activeSources.length} sources`);
    } catch (error) {
      logger.error({ err: error }, 'Failed to start monitoring service');
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      logger.info('Stopping monitoring service...');

      for (const [sourceId] of this.activeMonitors) {
        await this.stopSourceMonitoring(sourceId);
      }

      if (this.cronJob) {
        this.cronJob.stop();
        this.cronJob = null;
      }

      this.isRunning = false;
      logger.info('Monitoring service stopped');
    } catch (error) {
      logger.error({ err: error }, 'Failed to stop monitoring service');
      throw error;
    }
  }

  private startCronJob(): void {
    const cronExpression = `*/${config.syncIntervalMinutes} * * * *`;

    this.cronJob = cron.schedule(
      cronExpression,
      async () => {
        logger.info('Running scheduled sync...');
        await this.syncAllActiveSources();
      },
      { scheduled: true, timezone: 'Europe/Paris' },
    );

    logger.info(`Cron job scheduled: every ${config.syncIntervalMinutes} minutes`);
  }

  async startSourceMonitoring(source: Source): Promise<void> {
    try {
      logger.info(`Starting monitoring for: ${source.name}`);

      const { decryptedConfig } = this._parseAndDecryptConfig(source);

      const connector = DriveConnectorFactory.createConnector(source.platform, decryptedConfig);

      const connectionTest = await connector.testConnection();
      if (!connectionTest.success) {
        throw new Error(`Connection failed: ${connectionTest.message}`);
      }

      this.activeMonitors.set(source.id, { source, connector, lastCheck: new Date() });

      await prisma.syncLog.create({
        data: {
          sourceId: source.id,
          action: 'monitor_start',
          status: 'success',
          message: 'Monitoring started successfully',
        },
      });
    } catch (error) {
      logger.error({ err: error, source: source.name }, 'Failed to start monitoring for source');

      await prisma.syncLog.create({
        data: {
          sourceId: source.id,
          action: 'monitor_start',
          status: 'error',
          message: (error as Error).message,
          details: JSON.stringify({ error: (error as Error).stack }),
        },
      });
    }
  }

  async stopSourceMonitoring(sourceId: string): Promise<void> {
    try {
      const monitor = this.activeMonitors.get(sourceId);
      if (!monitor) return;

      logger.info(`Stopping monitoring for: ${monitor.source.name}`);

      if (monitor.connector && typeof monitor.connector.cleanup === 'function') {
        await monitor.connector.cleanup();
      }

      this.activeMonitors.delete(sourceId);

      await prisma.syncLog.create({
        data: {
          sourceId,
          action: 'monitor_stop',
          status: 'success',
          message: 'Monitoring stopped',
        },
      });
    } catch (error) {
      logger.error({ err: error, sourceId }, 'Error stopping monitoring for source');
    }
  }

  async syncAllActiveSources(): Promise<void> {
    const monitors = Array.from(this.activeMonitors.values());

    for (const monitor of monitors) {
      try {
        await this.syncSource(monitor.source.id);
      } catch (error) {
        logger.error({ err: error, source: monitor.source.name }, 'Sync failed for source');
      }
    }
  }

  async syncSource(sourceId: string): Promise<void> {
    if (this.syncInProgress.has(sourceId)) {
      logger.warn({ sourceId }, 'Sync already in progress for source');
      return;
    }

    this.syncInProgress.add(sourceId);

    try {
      const monitor = this.activeMonitors.get(sourceId);

      const source = await prisma.source.findUnique({ where: { id: sourceId } });

      if (!source) {
        throw new Error('Source not found');
      }

      if (source.status !== 'active') {
        throw new Error('Source must be active to sync');
      }

      let connector: DriveConnector;

      if (monitor) {
        connector = monitor.connector;
        monitor.source = source as unknown as Source;
      } else {
        logger.info(`Manual sync for source: ${sourceId}`);

        const { decryptedConfig } = this._parseAndDecryptConfig(source as unknown as Source);

        connector = DriveConnectorFactory.createConnector(source.platform, decryptedConfig);
        await connector.authenticate();
      }

      logger.info(`Syncing source: ${source.name}`);

      const { parsedConfig } = this._parseAndDecryptConfig(source as unknown as Source);

      const sourcePath = parsedConfig.sourcePath ?? '/';
      const files = await connector.listFiles(sourcePath);

      // Normalize filters (may arrive as {"0":".docx",...} objects instead of arrays)
      const rawExtensions = parsedConfig.filters?.extensions;
      const supportedExtensions: string[] = Array.isArray(rawExtensions)
        ? rawExtensions
        : rawExtensions && typeof rawExtensions === 'object'
          ? Object.values(rawExtensions as Record<string, string>)
          : ['.docx', '.pdf', '.doc'];

      const rawExclude = parsedConfig.filters?.excludePatterns;
      const excludePatterns: string[] = Array.isArray(rawExclude)
        ? rawExclude
        : rawExclude && typeof rawExclude === 'object'
          ? Object.values(rawExclude as Record<string, string>)
          : [];

      const googleMimeToExt: Record<string, string> = {
        'application/vnd.google-apps.document': '.docx',
        'application/vnd.google-apps.spreadsheet': '.xlsx',
        'application/vnd.google-apps.presentation': '.pptx',
      };

      const filteredFiles = files.filter((file) => {
        const hasValidExtension = supportedExtensions.some((ext) =>
          file.name.toLowerCase().endsWith(ext.toLowerCase()),
        );

        const googleExt = file.mimeType ? googleMimeToExt[file.mimeType] : undefined;
        const matchesGoogleType =
          googleExt !== undefined &&
          supportedExtensions.some((ext) => ext.toLowerCase() === googleExt);

        if (!hasValidExtension && !matchesGoogleType) return false;

        const isExcluded = excludePatterns.some((pattern) => file.name.match(new RegExp(pattern)));

        return !isExcluded;
      });

      logger.info(`Found ${filteredFiles.length} files to process`);

      for (const file of filteredFiles) {
        await this.processFileChange(sourceId, file, connector);
      }

      await prisma.source.update({
        where: { id: sourceId },
        data: { lastSync: new Date() },
      });

      if (monitor) {
        monitor.lastCheck = new Date();
      }

      await prisma.syncLog.create({
        data: {
          sourceId,
          action: 'sync',
          status: 'success',
          message: `Processed ${filteredFiles.length} files`,
          details: JSON.stringify({ fileCount: filteredFiles.length }),
        },
      });
    } catch (error) {
      logger.error({ err: error, sourceId }, 'Sync failed for source');

      try {
        await prisma.syncLog.create({
          data: {
            sourceId,
            action: 'sync',
            status: 'error',
            message: (error as Error).message,
            details: JSON.stringify({ error: (error as Error).stack }),
          },
        });
      } catch (dbError) {
        logger.error({ err: dbError }, 'Failed to log sync error');
      }

      throw error;
    } finally {
      this.syncInProgress.delete(sourceId);
    }
  }

  private async processFileChange(
    sourceId: string,
    file: FileInfo,
    connector: DriveConnector,
  ): Promise<void> {
    try {
      const existingFile = await prisma.convertedFile.findFirst({
        where: {
          originalPath: file.path,
          platform: file.platform ?? 'unknown',
        },
      });

      if (existingFile && existingFile.checksum === file.checksum) {
        return;
      }

      logger.info(`Processing file: ${file.name}`);

      const tempPath = await connector.downloadFile(file.id, config.tempPath);

      const job = await this.conversionService.createJob(sourceId, file.name, tempPath, file.size);

      await queueService.enqueueConversion(job.id, file.name);

      logger.info(`Job queued for async processing: ${file.name}`);
    } catch (error) {
      logger.error({ err: error, fileName: file.name }, 'Failed to process file');

      await prisma.syncLog.create({
        data: {
          sourceId,
          action: 'file_process',
          status: 'error',
          message: `Failed to process ${file.name}: ${(error as Error).message}`,
          details: JSON.stringify({ fileName: file.name, error: (error as Error).stack }),
        },
      });
    }
  }

  async getStatus(): Promise<{
    isRunning: boolean;
    activeMonitors: number;
    totalActiveSources: number;
    lastSync: Date | null;
    recentLogs: SyncLog[];
  }> {
    try {
      const activeSourceCount = this.activeMonitors.size;
      const totalSources = await prisma.source.count({ where: { status: 'active' } });

      const recentLogs = await prisma.syncLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { source: { select: { name: true } } },
      });

      const lastCheck =
        Array.from(this.activeMonitors.values())
          .map((m) => m.lastCheck)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

      return {
        isRunning: this.isRunning,
        activeMonitors: activeSourceCount,
        totalActiveSources: totalSources,
        lastSync: lastCheck,
        recentLogs: recentLogs as unknown as SyncLog[],
      };
    } catch (error) {
      logger.error({ err: error }, 'Error getting monitoring status');
      throw error;
    }
  }

  async getLogs(sourceId: string | null = null, limit = 50): Promise<SyncLog[]> {
    try {
      const where = sourceId ? { sourceId } : {};

      const logs = await prisma.syncLog.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { source: { select: { name: true, platform: true } } },
      });

      return logs as unknown as SyncLog[];
    } catch (error) {
      logger.error({ err: error }, 'Error fetching logs');
      throw error;
    }
  }
}

const monitoringService = new MonitoringService();

export default monitoringService;
