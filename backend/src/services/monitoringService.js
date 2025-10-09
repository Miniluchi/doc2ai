import getPrismaClient from "../config/database.js";
import { DriveConnectorFactory } from "../integrations/base/driveConnectorFactory.js";
import ConversionService from "./conversionService.js";
import queueService from "./queueService.js";
import { decryptCredentials } from "../utils/encryption.js";
import cron from "node-cron";
import config from "../config/env.js";

const prisma = getPrismaClient();

class MonitoringService {
  constructor() {
    this.isRunning = false;
    this.activeMonitors = new Map();
    this.conversionService = new ConversionService();
    this.cronJob = null;
  }

  async start() {
    try {
      if (this.isRunning) {
        console.log("⚠️ Monitoring service is already running");
        return;
      }

      console.log("🚀 Starting monitoring service...");

      // Démarrer le monitoring pour toutes les sources actives
      const activeSources = await prisma.source.findMany({
        where: { status: "active" },
      });

      for (const source of activeSources) {
        await this.startSourceMonitoring(source);
      }

      // Démarrer le cron job pour la synchronisation périodique
      this.startCronJob();

      this.isRunning = true;
      console.log(
        `✅ Monitoring service started for ${activeSources.length} sources`,
      );
    } catch (error) {
      console.error("❌ Failed to start monitoring service:", error);
      throw error;
    }
  }

  async stop() {
    try {
      console.log("🛑 Stopping monitoring service...");

      // Arrêter tous les monitors actifs
      for (const [sourceId, monitor] of this.activeMonitors) {
        await this.stopSourceMonitoring(sourceId);
      }

      // Arrêter le cron job
      if (this.cronJob) {
        this.cronJob.destroy();
        this.cronJob = null;
      }

      this.isRunning = false;
      console.log("✅ Monitoring service stopped");
    } catch (error) {
      console.error("❌ Failed to stop monitoring service:", error);
      throw error;
    }
  }

  startCronJob() {
    // Synchronisation périodique toutes les X minutes (configuré via env)
    const cronExpression = `*/${config.syncIntervalMinutes} * * * *`;

    this.cronJob = cron.schedule(
      cronExpression,
      async () => {
        console.log("⏰ Running scheduled sync...");
        await this.syncAllActiveSources();
      },
      {
        scheduled: true,
        timezone: "Europe/Paris",
      },
    );

    console.log(
      `📅 Cron job scheduled: every ${config.syncIntervalMinutes} minutes`,
    );
  }

  async startSourceMonitoring(source) {
    try {
      console.log(`🔍 Starting monitoring for: ${source.name}`);

      // Parser le config JSON (Prisma SQLite retourne une string)
      const parsedConfig =
        typeof source.config === "string"
          ? JSON.parse(source.config)
          : source.config;

      // Déchiffrer les credentials
      const decryptedConfig = {
        ...parsedConfig,
        credentials: parsedConfig.credentials
          ? decryptCredentials(parsedConfig.credentials)
          : null,
      };

      // Créer le connecteur
      const connector = DriveConnectorFactory.createConnector(
        source.platform,
        decryptedConfig,
      );

      // Tester la connexion
      const connectionTest = await connector.testConnection();
      if (!connectionTest.success) {
        throw new Error(`Connection failed: ${connectionTest.message}`);
      }

      // Stocker le monitor actif
      this.activeMonitors.set(source.id, {
        source,
        connector,
        lastCheck: new Date(),
      });

      // Log de démarrage
      await prisma.syncLog.create({
        data: {
          sourceId: source.id,
          action: "monitor_start",
          status: "success",
          message: "Monitoring started successfully",
        },
      });
    } catch (error) {
      console.error(`❌ Failed to start monitoring for ${source.name}:`, error);

      // Log de l'erreur
      await prisma.syncLog.create({
        data: {
          sourceId: source.id,
          action: "monitor_start",
          status: "error",
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

      console.log(`🛑 Stopping monitoring for: ${monitor.source.name}`);

      // Nettoyer les ressources si nécessaire
      if (
        monitor.connector &&
        typeof monitor.connector.cleanup === "function"
      ) {
        await monitor.connector.cleanup();
      }

      this.activeMonitors.delete(sourceId);

      // Log d'arrêt
      await prisma.syncLog.create({
        data: {
          sourceId,
          action: "monitor_stop",
          status: "success",
          message: "Monitoring stopped",
        },
      });
    } catch (error) {
      console.error(
        `❌ Error stopping monitoring for source ${sourceId}:`,
        error,
      );
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

  async syncSource(sourceId) {
    try {
      const monitor = this.activeMonitors.get(sourceId);
      let source, connector;
      let shouldCleanupConnector = false;

      if (!monitor) {
        // Sync manuelle : créer un connecteur temporaire
        console.log(`🔄 Manual sync for source: ${sourceId}`);

        source = await prisma.source.findUnique({
          where: { id: sourceId },
        });

        if (!source) {
          throw new Error("Source not found");
        }

        if (source.status !== "active") {
          throw new Error("Source must be active to sync");
        }

        // Parser et déchiffrer le config
        const parsedConfig =
          typeof source.config === "string"
            ? JSON.parse(source.config)
            : source.config;

        const decryptedConfig = {
          ...parsedConfig,
          credentials: parsedConfig.credentials
            ? decryptCredentials(parsedConfig.credentials)
            : null,
        };

        // Créer et authentifier le connecteur temporaire
        connector = DriveConnectorFactory.createConnector(
          source.platform,
          decryptedConfig,
        );
        await connector.authenticate();
        shouldCleanupConnector = true;
      } else {
        // Sync automatique : utiliser le connecteur du monitor
        source = monitor.source;
        connector = monitor.connector;
      }

      console.log(`🔄 Syncing source: ${source.name}`);

      // Parser le config si nécessaire
      const config =
        typeof source.config === "string"
          ? JSON.parse(source.config)
          : source.config;

      // Obtenir la liste des fichiers du drive
      const sourcePath = config.sourcePath || "/";
      const files = await connector.listFiles(sourcePath);

      // Filtrer les fichiers selon la configuration
      const supportedExtensions = Array.isArray(config.filters?.extensions)
        ? config.filters.extensions
        : [".docx", ".pdf", ".doc"];
      const excludePatterns = Array.isArray(config.filters?.excludePatterns)
        ? config.filters.excludePatterns
        : [];

      const filteredFiles = files.filter((file) => {
        // Vérifier l'extension
        const hasValidExtension = supportedExtensions.some((ext) =>
          file.name.toLowerCase().endsWith(ext.toLowerCase()),
        );

        if (!hasValidExtension) return false;

        // Vérifier les patterns d'exclusion
        const isExcluded = excludePatterns.some((pattern) =>
          file.name.match(new RegExp(pattern)),
        );

        return !isExcluded;
      });

      console.log(`📁 Found ${filteredFiles.length} files to process`);

      // Vérifier les fichiers modifiés ou nouveaux
      for (const file of filteredFiles) {
        await this.processFileChange(sourceId, file, connector);
      }

      // Mettre à jour le timestamp de dernière sync
      await prisma.source.update({
        where: { id: sourceId },
        data: { lastSync: new Date() },
      });

      // Mettre à jour le monitor
      monitor.lastCheck = new Date();

      // Log de succès
      await prisma.syncLog.create({
        data: {
          sourceId,
          action: "sync",
          status: "success",
          message: `Processed ${filteredFiles.length} files`,
          details: JSON.stringify({ fileCount: filteredFiles.length }),
        },
      });
    } catch (error) {
      console.error(`❌ Sync failed for source ${sourceId}:`, error);

      try {
        // Log d'erreur
        await prisma.syncLog.create({
          data: {
            sourceId,
            action: "sync",
            status: "error",
            message: error.message,
            details: JSON.stringify({ error: error.stack }),
          },
        });
      } catch (dbError) {
        console.error("Failed to log sync error:", dbError);
      }

      throw error;
    }
  }

  async processFileChange(sourceId, file, connector) {
    try {
      // Vérifier si le fichier a déjà été traité
      const existingFile = await prisma.convertedFile.findFirst({
        where: {
          originalPath: file.path,
          platform: file.platform || "unknown",
        },
      });

      // Si le fichier existe et n'a pas été modifié, passer
      if (existingFile && existingFile.checksum === file.checksum) {
        return;
      }

      console.log(`📄 Processing file: ${file.name}`);

      // Télécharger le fichier temporairement
      const tempPath = await connector.downloadFile(file.id, config.tempPath);

      // Créer un job de conversion
      const job = await this.conversionService.createJob(
        sourceId,
        file.name,
        tempPath,
        file.size,
      );

      // Ajouter le job à la queue asynchrone pour traitement en arrière-plan
      await queueService.enqueueConversion(job.id, file.name);

      console.log(
        `📥 Job ajouté à la queue pour traitement asynchrone: ${file.name}`,
      );
    } catch (error) {
      console.error(`❌ Failed to process file ${file.name}:`, error);

      // Log de l'erreur
      await prisma.syncLog.create({
        data: {
          sourceId,
          action: "file_process",
          status: "error",
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
        where: { status: "active" },
      });

      const recentLogs = await prisma.syncLog.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
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
      console.error("Error getting monitoring status:", error);
      throw error;
    }
  }

  async getLogs(sourceId = null, limit = 50) {
    try {
      const where = sourceId ? { sourceId } : {};

      const logs = await prisma.syncLog.findMany({
        where,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          source: {
            select: { name: true, platform: true },
          },
        },
      });

      return logs;
    } catch (error) {
      console.error("Error fetching logs:", error);
      throw error;
    }
  }
}

// Singleton instance
const monitoringService = new MonitoringService();

export default monitoringService;
