import getPrismaClient from '../config/database.js';
import { encryptCredentials, decryptCredentials } from '../utils/encryption.js';
import { DriveConnectorFactory } from '../integrations/base/driveConnectorFactory.js';
import ConversionService from './conversionService.js';
import config from '../config/env.js';
import logger from '../config/logger.js';

const prisma = getPrismaClient();

class SourceService {
  async getAllSources() {
    try {
      const sources = await prisma.source.findMany({
        include: {
          jobs: {
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
          syncLogs: {
            take: 10,
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      return sources.map((source) => {
        const parsedConfig = JSON.parse(source.config);
        return {
          ...source,
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

  async getSourceById(id) {
    try {
      const source = await prisma.source.findUnique({
        where: { id },
        include: {
          jobs: {
            orderBy: { createdAt: 'desc' },
          },
          syncLogs: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!source) {
        throw new Error('Source not found');
      }

      return {
        ...source,
        config: JSON.parse(source.config),
      };
    } catch (error) {
      logger.error({ err: error }, 'Error fetching source');
      throw error;
    }
  }

  /**
   * Create a new source with encrypted credentials.
   * @param {object} sourceData - { name, platform, config: { credentials, sourcePath, destination, filters } }
   * @returns {Promise<object>} Created Prisma Source record
   */
  async createSource(sourceData) {
    try {
      const { name, platform, config } = sourceData;

      if (!name || !platform || !config) {
        throw new Error('Missing required fields: name, platform, config');
      }

      const encryptedConfig = {
        ...config,
        credentials: config.credentials ? encryptCredentials(config.credentials) : null,
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
      return source;
    } catch (error) {
      logger.error({ err: error }, 'Error creating source');
      throw error;
    }
  }

  async updateSource(id, updateData) {
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
          ...updateData,
          config: updatedConfig,
          updatedAt: new Date(),
        },
      });

      logger.info(`Source updated: ${source.name}`);
      return source;
    } catch (error) {
      logger.error({ err: error }, 'Error updating source');
      throw error;
    }
  }

  async deleteSource(id) {
    try {
      await prisma.source.delete({
        where: { id },
      });

      logger.info(`Source deleted: ${id}`);
      return { success: true };
    } catch (error) {
      logger.error({ err: error }, 'Error deleting source');
      throw error;
    }
  }

  /**
   * Test raw credentials against a platform without persisting a source.
   * @param {object} testData - { platform, credentials, sourcePath, siteUrl? }
   * @returns {Promise<object>} Connection test result { success, message, details }
   */
  async testCredentials(testData) {
    try {
      const { platform, credentials, sourcePath, siteUrl } = testData;

      const testConfig = {
        credentials,
        sourcePath: sourcePath || '/',
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
        message: error.message || 'Credentials test failed',
        details: {
          platform: testData.platform,
          error: error.name || 'Unknown error',
        },
      };
    }
  }

  async testConnection(id) {
    try {
      const source = await this.getSourceById(id);

      const decryptedConfig = {
        ...source.config,
        credentials: source.config.credentials
          ? decryptCredentials(source.config.credentials)
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
          details: JSON.stringify(result.details || {}),
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
          message: error.message,
          details: JSON.stringify({ error: error.stack }),
        },
      });

      throw error;
    }
  }

  async syncSource(id) {
    try {
      // Dynamic import to avoid circular dependencies
      const monitoringService = (await import('./monitoringService.js')).default;

      await monitoringService.syncSource(id);

      return {
        success: true,
        message: 'Sync completed successfully',
      };
    } catch (error) {
      logger.error({ err: error }, 'Sync failed');
      throw error;
    }
  }

  async getSourceStats() {
    try {
      const stats = await prisma.source.aggregate({
        _count: {
          _all: true,
        },
      });

      const activeCount = await prisma.source.count({
        where: { status: 'active' },
      });

      const recentJobs = await prisma.conversionJob.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
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

  /**
   * List Google Drive folders under a given parent folder.
   * @param {string} parentId - Drive folder ID (or "root")
   * @param {object} credentials - Google OAuth credentials
   * @returns {Promise<object[]>} Array of folder metadata objects
   */
  async getGoogleDriveFolders(parentId, credentials) {
    try {
      logger.info(`Fetching Google Drive folders from parent: ${parentId}`);

      const config = {
        credentials: credentials,
        sourcePath: parentId,
        destinations: [],
        filters: { extensions: [], excludePatterns: [] },
      };

      const connector = DriveConnectorFactory.createConnector('googledrive', config);
      await connector.authenticate();

      const folders = await connector.listFolders(parentId);

      await connector.cleanup();

      logger.info(`Found ${folders.length} folders`);
      return folders;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching Google Drive folders');
      throw error;
    }
  }

  /**
   * Preview convertible files in a Google Drive folder without creating jobs.
   * @param {string} folderId - Drive folder ID
   * @param {object} credentials - Google OAuth credentials
   * @param {string[]|object} allowedExtensions - File extensions to include (e.g. [".docx", ".pdf"])
   * @returns {Promise<{totalFiles: number, convertibleFiles: number, files: object[]}>}
   */
  async previewGoogleDriveFiles(folderId, credentials, allowedExtensions) {
    try {
      logger.info(`Previewing files in Google Drive folder: ${folderId}`);

      let extensionsArray;
      if (Array.isArray(allowedExtensions)) {
        extensionsArray = allowedExtensions;
      } else if (typeof allowedExtensions === 'object' && allowedExtensions !== null) {
        extensionsArray = Object.values(allowedExtensions);
      } else {
        extensionsArray = [allowedExtensions];
      }

      const config = {
        credentials: credentials,
        sourcePath: folderId,
        destinations: [],
        filters: { extensions: extensionsArray, excludePatterns: [] },
      };

      const connector = DriveConnectorFactory.createConnector('googledrive', config);
      await connector.authenticate();

      const files = await connector.listFiles(folderId);

      const filteredFiles = files.filter((file) => {
        if (!file.name) {
          return false;
        }
        const fileName = file.name.toLowerCase();
        const mimeType = file.mimeType || '';

        // Check for Google native docs (will be exported as DOCX/PDF)
        const isGoogleDoc = mimeType === 'application/vnd.google-apps.document';
        const isGoogleSheet = mimeType === 'application/vnd.google-apps.spreadsheet';
        const isGoogleSlide = mimeType === 'application/vnd.google-apps.presentation';

        if (isGoogleDoc || isGoogleSheet || isGoogleSlide) {
          return true;
        }

        // Check if the file matches an allowed extension
        const matches = extensionsArray.some((ext) => {
          const extension = ext.toLowerCase().startsWith('.')
            ? ext.toLowerCase()
            : `.${ext.toLowerCase()}`;
          return fileName.endsWith(extension);
        });

        return matches;
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

  async processFilesForConversion(files, source, connector, syncLogId) {
    const conversionService = new ConversionService();
    let processedCount = 0;
    let errorCount = 0;

    try {
      logger.info(`Starting conversion processing for ${files.length} files`);

      for (const file of files) {
        try {
          const existingFile = await prisma.convertedFile.findFirst({
            where: {
              originalPath: file.path || file.id,
              platform: source.platform,
            },
            orderBy: { createdAt: 'desc' },
          });

          if (existingFile && file.modifiedTime) {
            const fileModified = new Date(file.modifiedTime);
            const lastProcessed = existingFile.createdAt;
            if (fileModified <= lastProcessed) {
              continue;
            }
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
              message: `Failed to process ${file.name}: ${error.message}`,
              details: JSON.stringify({
                fileName: file.name,
                error: error.stack,
              }),
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
          message: `Sync failed: ${error.message}`,
          details: JSON.stringify({
            error: error.stack,
            processedFiles: processedCount,
            totalFiles: files.length,
          }),
        },
      });
    }
  }
}

export default SourceService;
