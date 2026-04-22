import getPrismaClient from '../config/database.js';
import { DriveConnectorFactory } from '../integrations/base/driveConnectorFactory.js';
import ConversionService from './conversionService.js';
import queueService from './queueService.js';
import { decryptCredentials } from '../utils/encryption.js';
import cron from 'node-cron';
import config from '../config/env.js';

const prisma = getPrismaClient();

class MonitoringService {
  constructor() {
    this.isRunning = false;
    this.activeMonitors = new Map();
    this.syncInProgress = new Set();
    this.conversionService = new ConversionService();
    this.cronJob = null;
  }

  _parseAndDecryptConfig(source) {
    const parsedConfig =
      typeof source.config === 'string' ? JSON.parse(source.config) : source.config;

    const decryptedConfig = {
      ...parsedConfig,
      credentials: parsedConfig.credentials ? decryptCredentials(parsedConfig.credentials) : null,
    };

    return { parsedConfig, decryptedConfig };
  }

  /**
   * Start the monitoring service: connects all active sources and schedules periodic syncs.
   */
  async start() {
    try {
      if (this.isRunning) {
        console.warn('⚠️ Monitoring service is already running');
        return;
      }

      console.log('Starting monitoring service...');

      const activeSources = await prisma.source.findMany({
        where: { status: 'active' },
      });

      for (const source of activeSources) {
        await this.startSourceMonitoring(source);
      }

      this.startCronJob();

      this.isRunning = true;
      console.log(`Monitoring service started for ${activeSources.length} sources`);
    } catch (error) {
      console.error('❌ Failed to start monitoring service:', error);
      throw error;
    }
  }

  async stop() {
    try {
      console.log('Stopping monitoring service...');

      for (const [sourceId] of this.activeMonitors) {
        await this.stopSourceMonitoring(sourceId);
      }

      if (this.cronJob) {
        this.cronJob.destroy();
        this.cronJob = null;
      }

      this.isRunning = false;
      console.log('Monitoring service stopped');
    } catch (error) {
      console.error('❌ Failed to stop monitoring service:', error);
      throw error;
    }
  }

  startCronJob() {
    const cronExpression = `*/${config.syncIntervalMinutes} * * * *`;

    this.cronJob = cron.schedule(
      cronExpression,
      async () => {
        console.log('Running scheduled sync...');
        await this.syncAllActiveSources();
      },
      {
        scheduled: true,
        timezone: 'Europe/Paris',
      },
    );

    console.log(`Cron job scheduled: every ${config.syncIntervalMinutes} minutes`);
  }

  /**
   * Initialize monitoring for a single source: authenticate, test connection, and register the active monitor.
   * @param {object} source - Prisma Source record
   */
  async startSourceMonitoring(source) {
    try {
      console.log(`Starting monitoring for: ${source.name}`);

      const { decryptedConfig } = this._parseAndDecryptConfig(source);

      const connector = DriveConnectorFactory.createConnector(source.platform, decryptedConfig);

      const connectionTest = await connector.testConnection();
      if (!connectionTest.success) {
        throw new Error(`Connection failed: ${connectionTest.message}`);
      }

      this.activeMonitors.set(source.id, {
        source,
        connector,
        lastCheck: new Date(),
      });

      await prisma.syncLog.create({
        data: {
          sourceId: source.id,
          action: 'monitor_start',
          status: 'success',
          message: 'Monitoring started successfully',
        },
      });
    } catch (error) {
      console.error(`❌ Failed to start monitoring for ${source.name}:`, error);

      await prisma.syncLog.create({
        data: {
          sourceId: source.id,
          action: 'monitor_start',
          status: 'error',
          message: error.message,
          details: JSON.stringify({ error: error.stack }),
        },
      });
    }
  }

  async stopSourceMonitoring(sourceId) {
    try {
      const monitor = this.activeMonitors.get(sourceId);
      if (!monitor) {
        return;
      }

      console.log(`Stopping monitoring for: ${monitor.source.name}`);

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
      console.error(`❌ Error stopping monitoring for source ${sourceId}:`, error);
    }
  }

  async syncAllActiveSources() {
    const monitors = Array.from(this.activeMonitors.values());

    for (const monitor of monitors) {
      try {
        await this.syncSource(monitor.source.id);
      } catch (error) {
        console.error(`❌ Sync failed for ${monitor.source.name}:`, error);
      }
    }
  }

  /**
   * Sync a source: list remote files, filter by config, and enqueue conversion jobs for new/changed files.
   * Skips if a sync is already in progress for this source.
   * @param {string} sourceId - Source DB id
   */
  async syncSource(sourceId) {
    if (this.syncInProgress.has(sourceId)) {
      console.warn(`⚠️ Sync already in progress for source: ${sourceId}`);
      return;
    }

    this.syncInProgress.add(sourceId);

    try {
      const monitor = this.activeMonitors.get(sourceId);

      // Always fetch fresh source data from DB
      const source = await prisma.source.findUnique({
        where: { id: sourceId },
      });

      if (!source) {
        throw new Error('Source not found');
      }

      if (source.status !== 'active') {
        throw new Error('Source must be active to sync');
      }

      let connector;

      if (monitor) {
        connector = monitor.connector;
        monitor.source = source;
      } else {
        console.log(`Manual sync for source: ${sourceId}`);

        const { decryptedConfig } = this._parseAndDecryptConfig(source);

        connector = DriveConnectorFactory.createConnector(source.platform, decryptedConfig);
        await connector.authenticate();
      }

      console.log(`Syncing source: ${source.name}`);

      const { parsedConfig } = this._parseAndDecryptConfig(source);

      const sourcePath = parsedConfig.sourcePath || '/';
      const files = await connector.listFiles(sourcePath);

      // Normalize filters (may be objects {"0":".docx",...} instead of arrays)
      const rawExtensions = parsedConfig.filters?.extensions;
      const supportedExtensions = Array.isArray(rawExtensions)
        ? rawExtensions
        : rawExtensions && typeof rawExtensions === 'object'
          ? Object.values(rawExtensions)
          : ['.docx', '.pdf', '.doc'];

      const rawExclude = parsedConfig.filters?.excludePatterns;
      const excludePatterns = Array.isArray(rawExclude)
        ? rawExclude
        : rawExclude && typeof rawExclude === 'object'
          ? Object.values(rawExclude)
          : [];

      // Map Google Apps mimeTypes to their equivalent extensions
      const googleMimeToExt = {
        'application/vnd.google-apps.document': '.docx',
        'application/vnd.google-apps.spreadsheet': '.xlsx',
        'application/vnd.google-apps.presentation': '.pptx',
      };

      const filteredFiles = files.filter((file) => {
        // Check by file name extension
        const hasValidExtension = supportedExtensions.some((ext) =>
          file.name.toLowerCase().endsWith(ext.toLowerCase()),
        );

        // Or by Google Apps mimeType (these files have no extension in their name)
        const googleExt = googleMimeToExt[file.mimeType];
        const matchesGoogleType =
          googleExt && supportedExtensions.some((ext) => ext.toLowerCase() === googleExt);

        if (!hasValidExtension && !matchesGoogleType) return false;

        // Check exclusion patterns
        const isExcluded = excludePatterns.some((pattern) => file.name.match(new RegExp(pattern)));

        return !isExcluded;
      });

      console.log(`Found ${filteredFiles.length} files to process`);

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
      console.error(`❌ Sync failed for source ${sourceId}:`, error);

      try {
        await prisma.syncLog.create({
          data: {
            sourceId,
            action: 'sync',
            status: 'error',
            message: error.message,
            details: JSON.stringify({ error: error.stack }),
          },
        });
      } catch (dbError) {
        console.error('Failed to log sync error:', dbError);
      }

      throw error;
    } finally {
      this.syncInProgress.delete(sourceId);
    }
  }

  async processFileChange(sourceId, file, connector) {
    try {
      const existingFile = await prisma.convertedFile.findFirst({
        where: {
          originalPath: file.path,
          platform: file.platform || 'unknown',
        },
      });

      if (existingFile && existingFile.checksum === file.checksum) {
        return;
      }

      console.log(`Processing file: ${file.name}`);

      const tempPath = await connector.downloadFile(file.id, config.tempPath);

      const job = await this.conversionService.createJob(sourceId, file.name, tempPath, file.size);

      await queueService.enqueueConversion(job.id, file.name);

      console.log(`Job queued for async processing: ${file.name}`);
    } catch (error) {
      console.error(`❌ Failed to process file ${file.name}:`, error);

      await prisma.syncLog.create({
        data: {
          sourceId,
          action: 'file_process',
          status: 'error',
          message: `Failed to process ${file.name}: ${error.message}`,
          details: JSON.stringify({
            fileName: file.name,
            error: error.stack,
          }),
        },
      });
    }
  }

  async getStatus() {
    try {
      const activeSourceCount = this.activeMonitors.size;
      const totalSources = await prisma.source.count({
        where: { status: 'active' },
      });

      const recentLogs = await prisma.syncLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          source: {
            select: { name: true },
          },
        },
      });

      return {
        isRunning: this.isRunning,
        activeMonitors: activeSourceCount,
        totalActiveSources: totalSources,
        lastSync:
          Array.from(this.activeMonitors.values())
            .map((m) => m.lastCheck)
            .sort((a, b) => b - a)[0] || null,
        recentLogs,
      };
    } catch (error) {
      console.error('Error getting monitoring status:', error);
      throw error;
    }
  }

  async getLogs(sourceId = null, limit = 50) {
    try {
      const where = sourceId ? { sourceId } : {};

      const logs = await prisma.syncLog.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          source: {
            select: { name: true, platform: true },
          },
        },
      });

      return logs;
    } catch (error) {
      console.error('Error fetching logs:', error);
      throw error;
    }
  }
}

// Singleton instance
const monitoringService = new MonitoringService();

export default monitoringService;
