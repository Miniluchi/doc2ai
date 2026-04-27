import { TokenExpiredError } from '../integrations/base/driveConnector.js';
import SourceService from '../services/sourceService.js';
import logger from '../config/logger.js';
import type { Request, Response } from 'express';

const sourceService = new SourceService();

class SourceController {
  async getAllSources(req: Request, res: Response): Promise<void> {
    try {
      const sources = await sourceService.getAllSources();
      res.json({ success: true, data: sources });
    } catch (error) {
      logger.error({ err: error }, 'Error in getAllSources');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sources',
        error: (error as Error).message,
      });
    }
  }

  async getSourceById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const source = await sourceService.getSourceById(id!);

      res.json({ success: true, data: source });
    } catch (error) {
      logger.error({ err: error }, 'Error in getSourceById');

      if ((error as Error).message === 'Source not found') {
        res.status(404).json({ success: false, message: 'Source not found' });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch source',
        error: (error as Error).message,
      });
    }
  }

  async createSource(req: Request, res: Response): Promise<void> {
    try {
      const { name, platform, config } = req.body as {
        name?: string;
        platform?: string;
        config?: Record<string, unknown>;
      };

      if (!name || !platform || !config) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: name, platform, config',
        });
        return;
      }

      const supportedPlatforms = ['sharepoint', 'googledrive', 'onedrive'];
      if (!supportedPlatforms.includes(platform)) {
        res.status(400).json({
          success: false,
          message: `Unsupported platform. Supported: ${supportedPlatforms.join(', ')}`,
        });
        return;
      }

      const source = await sourceService.createSource(
        req.body as Parameters<typeof sourceService.createSource>[0],
      );

      res.status(201).json({ success: true, data: source, message: 'Source created successfully' });
    } catch (error) {
      logger.error({ err: error }, 'Error in createSource');
      res.status(500).json({
        success: false,
        message: 'Failed to create source',
        error: (error as Error).message,
      });
    }
  }

  async updateSource(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const source = await sourceService.updateSource(
        id!,
        req.body as Parameters<typeof sourceService.updateSource>[1],
      );

      res.json({ success: true, data: source, message: 'Source updated successfully' });
    } catch (error) {
      logger.error({ err: error }, 'Error in updateSource');

      if ((error as Error).message === 'Source not found') {
        res.status(404).json({ success: false, message: 'Source not found' });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update source',
        error: (error as Error).message,
      });
    }
  }

  async deleteSource(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await sourceService.deleteSource(id!);

      res.json({ success: true, message: 'Source deleted successfully' });
    } catch (error) {
      logger.error({ err: error }, 'Error in deleteSource');
      res.status(500).json({
        success: false,
        message: 'Failed to delete source',
        error: (error as Error).message,
      });
    }
  }

  async testCredentials(req: Request, res: Response): Promise<void> {
    try {
      const { platform, credentials, sourcePath, siteUrl } = req.body as {
        platform?: string;
        credentials?: Record<string, string>;
        sourcePath?: string;
        siteUrl?: string;
      };

      if (!platform || !credentials) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: platform, credentials',
        });
        return;
      }

      const supportedPlatforms = ['sharepoint', 'googledrive', 'onedrive'];
      if (!supportedPlatforms.includes(platform)) {
        res.status(400).json({
          success: false,
          message: `Unsupported platform. Supported: ${supportedPlatforms.join(', ')}`,
        });
        return;
      }

      const result = await sourceService.testCredentials({
        platform,
        credentials,
        sourcePath: sourcePath ?? '/',
        ...(siteUrl && { siteUrl }),
      });

      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ err: error }, 'Error in testCredentials');
      if (error instanceof TokenExpiredError) {
        res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Your Google session has expired, please reconnect',
        });
        return;
      }
      res.status(500).json({
        success: false,
        message: 'Credentials test failed',
        error: (error as Error).message,
      });
    }
  }

  async testConnection(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await sourceService.testConnection(id!);

      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ err: error }, 'Error in testConnection');
      if (error instanceof TokenExpiredError) {
        res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Your Google session has expired, please reconnect',
        });
        return;
      }
      res.status(500).json({
        success: false,
        message: 'Connection test failed',
        error: (error as Error).message,
      });
    }
  }

  async syncSource(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await sourceService.syncSource(id!);

      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ err: error }, 'Error in syncSource');
      res.status(500).json({
        success: false,
        message: 'Sync failed',
        error: (error as Error).message,
      });
    }
  }

  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await sourceService.getSourceStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error({ err: error }, 'Error in getStats');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: (error as Error).message,
      });
    }
  }

  async getGoogleDriveFolders(req: Request, res: Response): Promise<void> {
    try {
      const { parent_id = 'root' } = req.query as { parent_id?: string };
      const { credentials } = req.body as { credentials?: Record<string, string> };

      if (!credentials) {
        res.status(400).json({ success: false, message: 'Missing Google Drive credentials' });
        return;
      }

      const folders = await sourceService.getGoogleDriveFolders(parent_id, credentials);

      res.json({ success: true, data: folders });
    } catch (error) {
      logger.error({ err: error }, 'Error in getGoogleDriveFolders');
      if (error instanceof TokenExpiredError) {
        res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Your Google session has expired, please reconnect',
        });
        return;
      }
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Google Drive folders',
        error: (error as Error).message,
      });
    }
  }

  async previewGoogleDriveFiles(req: Request, res: Response): Promise<void> {
    try {
      const {
        folder_id = 'root',
        credentials,
        extensions = ['.docx', '.pdf', '.doc', '.txt'],
      } = req.body as {
        folder_id?: string;
        credentials?: Record<string, string>;
        extensions?: string[];
      };

      if (!credentials) {
        res.status(400).json({ success: false, message: 'Missing Google Drive credentials' });
        return;
      }

      const files = await sourceService.previewGoogleDriveFiles(folder_id, credentials, extensions);

      res.json({ success: true, data: files });
    } catch (error) {
      logger.error({ err: error }, 'Error in previewGoogleDriveFiles');
      if (error instanceof TokenExpiredError) {
        res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Your Google session has expired, please reconnect',
        });
        return;
      }
      res.status(500).json({
        success: false,
        message: 'Failed to preview Google Drive files',
        error: (error as Error).message,
      });
    }
  }
}

export default SourceController;
