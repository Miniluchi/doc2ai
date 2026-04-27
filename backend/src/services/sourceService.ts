import getPrismaClient from '../config/database.js';
import { encryptCredentials, decryptCredentials } from '../utils/encryption.js';
import { DriveConnectorFactory } from '../integrations/base/driveConnectorFactory.js';
import ConversionService from './conversionService.js';
import config from '../config/env.js';
import logger from '../config/logger.js';
import type { Source, ParsedSource, SourceConfig, FileInfo } from '../types/domain.js';
import type DriveConnector from '../integrations/base/driveConnector.js';

const prisma = getPrismaClient();

interface CreateSourceData {
  name: string;
  platform: string;
  config: SourceConfig;
}

interface SourceStats {
  totalSources: number;
  activeSources: number;
  recentJobs: number;
}

interface PreviewResult {
  totalFiles: number;
  convertibleFiles: number;
  files: Array<{
    id: string;
    name: string;
    size: number;
    modifiedTime: Date;
    mimeType: string | null;
  }>;
}

class SourceService {
  async getAllSources(): Promise<ParsedSource[]> {
    try {
      const sources = await prisma.source.findMany({
        include: {
          jobs: { take: 5, orderBy: { createdAt: 'desc' } },
          syncLogs: { take: 10, orderBy: { createdAt: 'desc' } },
        },
      });

      return sources.map((source) => {
        const parsedConfig = JSON.parse(source.config) as SourceConfig;
        return {
          ...(source as unknown as Source),
          config: {
            ...parsedConfig,
            credentials: parsedConfig.credentials ? '***encrypted***' : null,
          },
        };
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching sources');
      throw new Error('Failed to fetch sources');
    }
  }

  async getSourceById(id: string): Promise<ParsedSource> {
    try {
      const source = await prisma.source.findUnique({
        where: { id },
        include: {
          jobs: { orderBy: { createdAt: 'desc' } },
          syncLogs: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!source) {
        throw new Error('Source not found');
      }

      return {
        ...(source as unknown as Source),
        config: JSON.parse(source.config) as SourceConfig,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error fetching source');
      throw error;
    }
  }

  async createSource(sourceData: CreateSourceData): Promise<Source> {
    try {
      const { name, platform, config: sourceConfig } = sourceData;

      if (!name || !platform || !sourceConfig) {
        throw new Error('Missing required fields: name, platform, config');
      }

      const encryptedConfig: SourceConfig = {
        ...sourceConfig,
        credentials: sourceConfig.credentials ? encryptCredentials(sourceConfig.credentials) : null,
      };

      const source = await prisma.source.create({
        data: {
          name,
          platform,
          config: JSON.stringify(encryptedConfig),
          status: 'active',
        },
      });

      logger.info(`Source created: ${name} (${platform})`);
      return source as unknown as Source;
    } catch (error) {
      logger.error({ err: error }, 'Error creating source');
      throw error;
    }
  }

  async updateSource(id: string, updateData: Partial<CreateSourceData>): Promise<Source> {
    try {
      const existingSource = await this.getSourceById(id);

      const updatedConfig = updateData.config
        ? {
            ...existingSource.config,
            ...updateData.config,
            credentials: updateData.config.credentials
              ? encryptCredentials(updateData.config.credentials)
              : existingSource.config.credentials,
          }
        : existingSource.config;

      const source = await prisma.source.update({
        where: { id },
        data: {
          ...(updateData as Record<string, unknown>),
          config: JSON.stringify(updatedConfig),
          updatedAt: new Date(),
        },
      });

      logger.info(`Source updated: ${source.name}`);
      return source as unknown as Source;
    } catch (error) {
      logger.error({ err: error }, 'Error updating source');
      throw error;
    }
  }

  async deleteSource(id: string): Promise<{ success: boolean }> {
    try {
      await prisma.source.delete({ where: { id } });

      logger.info(`Source deleted: ${id}`);
      return { success: true };
    } catch (error) {
      logger.error({ err: error }, 'Error deleting source');
      throw error;
    }
  }

  async testCredentials(testData: {
    platform: string;
    credentials: Record<string, string>;
    sourcePath?: string;
    siteUrl?: string;
  }): Promise<{ success: boolean; message: string; details?: Record<string, unknown> }> {
    try {
      const { platform, credentials, sourcePath, siteUrl } = testData;

      const testConfig: SourceConfig = {
        credentials,
        sourcePath: sourcePath ?? '/',
        ...(siteUrl && { siteUrl }),
      };

      const connector = DriveConnectorFactory.createConnector(platform, testConfig);

      const result = await connector.testConnection();

      logger.info(`Credentials test for ${platform}: ${result.success ? 'success' : 'failed'}`);

      return result;
    } catch (error) {
      logger.error({ err: error }, 'Credentials test failed');

      return {
        success: false,
        message: (error as Error).message ?? 'Credentials test failed',
        details: {
          platform: testData.platform,
          error: (error as Error).name ?? 'Unknown error',
        },
      };
    }
  }

  async testConnection(
    id: string,
  ): Promise<{ success: boolean; message: string; details?: Record<string, unknown> }> {
    try {
      const source = await this.getSourceById(id);

      const decryptedConfig: SourceConfig = {
        ...source.config,
        credentials: source.config.credentials
          ? (decryptCredentials(source.config.credentials as string) as Record<string, string>)
          : null,
      };

      const connector = DriveConnectorFactory.createConnector(source.platform, decryptedConfig);

      const result = await connector.testConnection();

      await prisma.syncLog.create({
        data: {
          sourceId: id,
          action: 'test_connection',
          status: result.success ? 'success' : 'error',
          message: result.message,
          details: JSON.stringify(result.details ?? {}),
        },
      });

      return result;
    } catch (error) {
      logger.error({ err: error }, 'Connection test failed');

      await prisma.syncLog.create({
        data: {
          sourceId: id,
          action: 'test_connection',
          status: 'error',
          message: (error as Error).message,
          details: JSON.stringify({ error: (error as Error).stack }),
        },
      });

      throw error;
    }
  }

  async syncSource(id: string): Promise<{ success: boolean; message: string }> {
    try {
      // Dynamic import to avoid circular dependency with monitoringService
      const monitoringService = (await import('./monitoringService.js')).default;

      await monitoringService.syncSource(id);

      return { success: true, message: 'Sync completed successfully' };
    } catch (error) {
      logger.error({ err: error }, 'Sync failed');
      throw error;
    }
  }

  async getSourceStats(): Promise<SourceStats> {
    try {
      const stats = await prisma.source.aggregate({ _count: { _all: true } });
      const activeCount = await prisma.source.count({ where: { status: 'active' } });
      const recentJobs = await prisma.conversionJob.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });

      return {
        totalSources: stats._count._all,
        activeSources: activeCount,
        recentJobs,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error fetching stats');
      throw error;
    }
  }

  async getGoogleDriveFolders(
    parentId: string,
    credentials: Record<string, string>,
  ): Promise<FileInfo[]> {
    try {
      logger.info(`Fetching Google Drive folders from parent: ${parentId}`);

      const connectorConfig: SourceConfig = {
        credentials,
        sourcePath: parentId,
        destinations: [],
        filters: { extensions: [], excludePatterns: [] },
      };

      const connector = DriveConnectorFactory.createConnector('googledrive', connectorConfig);
      await connector.authenticate();

      // GoogleDriveConnector exposes listFolders — access via cast
      const googleConnector = connector as DriveConnector & {
        listFolders?: (id: string) => Promise<FileInfo[]>;
      };
      const folders = googleConnector.listFolders
        ? await googleConnector.listFolders(parentId)
        : [];

      await connector.cleanup();

      logger.info(`Found ${folders.length} folders`);
      return folders;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching Google Drive folders');
      throw error;
    }
  }

  async previewGoogleDriveFiles(
    folderId: string,
    credentials: Record<string, string>,
    allowedExtensions: string[] | Record<string, string> | string,
  ): Promise<PreviewResult> {
    try {
      logger.info(`Previewing files in Google Drive folder: ${folderId}`);

      let extensionsArray: string[];
      if (Array.isArray(allowedExtensions)) {
        extensionsArray = allowedExtensions;
      } else if (typeof allowedExtensions === 'object' && allowedExtensions !== null) {
        extensionsArray = Object.values(allowedExtensions);
      } else {
        extensionsArray = [allowedExtensions];
      }

      const connectorConfig: SourceConfig = {
        credentials,
        sourcePath: folderId,
        destinations: [],
        filters: { extensions: extensionsArray, excludePatterns: [] },
      };

      const connector = DriveConnectorFactory.createConnector('googledrive', connectorConfig);
      await connector.authenticate();

      const files = await connector.listFiles(folderId);

      const filteredFiles = files.filter((file) => {
        if (!file.name) return false;

        const fileName = file.name.toLowerCase();
        const mimeType = file.mimeType ?? '';

        const isGoogleDoc = mimeType === 'application/vnd.google-apps.document';
        const isGoogleSheet = mimeType === 'application/vnd.google-apps.spreadsheet';
        const isGoogleSlide = mimeType === 'application/vnd.google-apps.presentation';

        if (isGoogleDoc || isGoogleSheet || isGoogleSlide) return true;

        return extensionsArray.some((ext) => {
          const extension = ext.toLowerCase().startsWith('.')
            ? ext.toLowerCase()
            : `.${ext.toLowerCase()}`;
          return fileName.endsWith(extension);
        });
      });

      await connector.cleanup();

      logger.info(`Found ${filteredFiles.length} convertible files out of ${files.length} total`);

      return {
        totalFiles: files.length,
        convertibleFiles: filteredFiles.length,
        files: filteredFiles.map((file) => ({
          id: file.id,
          name: file.name,
          size: file.size,
          modifiedTime: file.modifiedTime,
          mimeType: file.mimeType,
        })),
      };
    } catch (error) {
      logger.error({ err: error }, 'Error previewing Google Drive files');
      throw error;
    }
  }

  async processFilesForConversion(
    files: FileInfo[],
    source: ParsedSource,
    connector: DriveConnector,
    syncLogId: string,
  ): Promise<void> {
    const conversionService = new ConversionService();
    let processedCount = 0;
    let errorCount = 0;

    try {
      logger.info(`Starting conversion processing for ${files.length} files`);

      for (const file of files) {
        try {
          const existingFile = await prisma.convertedFile.findFirst({
            where: {
              originalPath: file.path ?? file.id,
              platform: source.platform,
            },
            orderBy: { createdAt: 'desc' },
          });

          if (existingFile && file.modifiedTime) {
            const fileModified = new Date(file.modifiedTime);
            const lastProcessed = existingFile.createdAt;
            if (fileModified <= lastProcessed) continue;
          }

          logger.info(`Processing file: ${file.name}`);

          const tempPath = await connector.downloadFile(file.id, config.tempPath);

          const job = await conversionService.createJob(source.id, file.name, tempPath, file.size);

          logger.info(`Created conversion job for: ${file.name}`);

          await conversionService.processJob(job.id);

          processedCount++;
          logger.info(`Successfully converted: ${file.name}`);
        } catch (error) {
          errorCount++;
          logger.error({ err: error, fileName: file.name }, 'Failed to process file');

          await prisma.syncLog.create({
            data: {
              sourceId: source.id,
              action: 'file_process',
              status: 'error',
              message: `Failed to process ${file.name}: ${(error as Error).message}`,
              details: JSON.stringify({ fileName: file.name, error: (error as Error).stack }),
            },
          });
        }
      }

      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          status: errorCount === 0 ? 'success' : 'partial_success',
          message: `Sync completed - processed ${processedCount}/${files.length} files (${errorCount} errors)`,
          details: JSON.stringify({
            processedFiles: processedCount,
            errorFiles: errorCount,
            totalFiles: files.length,
            platform: source.platform,
            completed: true,
          }),
        },
      });

      logger.info(
        `Processing completed for source: ${source.name} (${processedCount}/${files.length} files converted)`,
      );
    } catch (error) {
      logger.error({ err: error, source: source.name }, 'Critical error during file processing');

      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          status: 'error',
          message: `Sync failed: ${(error as Error).message}`,
          details: JSON.stringify({
            error: (error as Error).stack,
            processedFiles: processedCount,
            totalFiles: files.length,
          }),
        },
      });
    }
  }
}

export default SourceService;
