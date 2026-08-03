import monitoringService from '../services/monitoringService.js';
import { runHealthProbes } from '../services/healthService.js';
import logger from '../config/logger.js';
import type { Request, Response } from 'express';

class MonitoringController {
  async getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const status = await monitoringService.getStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      logger.error({ err: error }, 'Error in getStatus');
      res.status(500).json({
        success: false,
        message: 'Failed to get monitoring status',
        error: (error as Error).message,
      });
    }
  }

  async startMonitoring(_req: Request, res: Response): Promise<void> {
    try {
      if (monitoringService.isRunning) {
        res.status(400).json({ success: false, message: 'Monitoring service is already running' });
        return;
      }

      await monitoringService.start();
      res.json({ success: true, message: 'Monitoring service started successfully' });
    } catch (error) {
      logger.error({ err: error }, 'Error in startMonitoring');
      res.status(500).json({
        success: false,
        message: 'Failed to start monitoring service',
        error: (error as Error).message,
      });
    }
  }

  async stopMonitoring(_req: Request, res: Response): Promise<void> {
    try {
      if (!monitoringService.isRunning) {
        res.status(400).json({ success: false, message: 'Monitoring service is not running' });
        return;
      }

      await monitoringService.stop();
      res.json({ success: true, message: 'Monitoring service stopped successfully' });
    } catch (error) {
      logger.error({ err: error }, 'Error in stopMonitoring');
      res.status(500).json({
        success: false,
        message: 'Failed to stop monitoring service',
        error: (error as Error).message,
      });
    }
  }

  async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const sourceId = (req.query['sourceId'] as string) || null;
      const limit = parseInt((req.query['limit'] as string) ?? '50') || 50;

      const logs = await monitoringService.getLogs(sourceId, limit);
      res.json({ success: true, data: logs });
    } catch (error) {
      logger.error({ err: error }, 'Error in getLogs');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch monitoring logs',
        error: (error as Error).message,
      });
    }
  }

  async syncSource(req: Request, res: Response): Promise<void> {
    try {
      const { sourceId } = req.params;

      if (!monitoringService.isRunning) {
        res.status(400).json({ success: false, message: 'Monitoring service is not running' });
        return;
      }

      await monitoringService.syncSource(sourceId!);
      res.json({ success: true, message: 'Source sync completed successfully' });
    } catch (error) {
      logger.error({ err: error }, 'Error in syncSource');
      res.status(500).json({
        success: false,
        message: 'Failed to sync source',
        error: (error as Error).message,
      });
    }
  }

  async healthCheck(_req: Request, res: Response): Promise<void> {
    try {
      const status = await monitoringService.getStatus();
      const report = await runHealthProbes(status);

      // Only `down` is worth a 503: a degraded service still answers and still
      // serves already converted files, it just stopped picking up new changes.
      const isDown = report.status === 'down';

      res.status(isDown ? 503 : 200).json({
        success: !isDown,
        data: {
          status: report.status,
          probes: report.probes,
          monitoring: status.isRunning,
          activeMonitors: status.activeMonitors,
          totalSources: status.totalActiveSources,
          lastSync: status.lastSync,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error({ err: error }, 'Error in healthCheck');
      res.status(503).json({
        success: false,
        data: {
          status: 'down',
          probes: [],
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  async restartMonitoring(_req: Request, res: Response): Promise<void> {
    try {
      logger.info('Restarting monitoring service...');

      if (monitoringService.isRunning) {
        await monitoringService.stop();
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      await monitoringService.start();

      res.json({ success: true, message: 'Monitoring service restarted successfully' });
    } catch (error) {
      logger.error({ err: error }, 'Error in restartMonitoring');
      res.status(500).json({
        success: false,
        message: 'Failed to restart monitoring service',
        error: (error as Error).message,
      });
    }
  }

  async getSourceLogs(req: Request, res: Response): Promise<void> {
    try {
      const { sourceId } = req.params;
      const limit = parseInt((req.query['limit'] as string) ?? '50') || 50;

      const logs = await monitoringService.getLogs(sourceId ?? null, limit);
      res.json({ success: true, data: logs });
    } catch (error) {
      logger.error({ err: error }, 'Error in getSourceLogs');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch source logs',
        error: (error as Error).message,
      });
    }
  }
}

export default MonitoringController;
