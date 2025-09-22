import getPrismaClient from "../config/database.js";
import { encryptCredentials, decryptCredentials } from "../utils/encryption.js";
import { DriveConnectorFactory } from "../integrations/base/driveConnectorFactory.js";

const prisma = getPrismaClient();

class SourceService {
  async getAllSources() {
    try {
      const sources = await prisma.source.findMany({
        include: {
          jobs: {
            take: 5,
            orderBy: { createdAt: "desc" },
          },
          syncLogs: {
            take: 10,
            orderBy: { createdAt: "desc" },
          },
        },
      });

      // Déchiffrer les credentials pour l'affichage (sans les exposer complètement)
      return sources.map((source) => {
        const parsedConfig = JSON.parse(source.config);
        return {
          ...source,
          config: {
            ...parsedConfig,
            credentials: parsedConfig.credentials ? "***encrypted***" : null,
          },
        };
      });
    } catch (error) {
      console.error("Error fetching sources:", error);
      throw new Error("Failed to fetch sources");
    }
  }

  async getSourceById(id) {
    try {
      const source = await prisma.source.findUnique({
        where: { id },
        include: {
          jobs: {
            orderBy: { createdAt: "desc" },
          },
          syncLogs: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!source) {
        throw new Error("Source not found");
      }

      // Parse la config JSON
      return {
        ...source,
        config: JSON.parse(source.config),
      };
    } catch (error) {
      console.error("Error fetching source:", error);
      throw error;
    }
  }

  async createSource(sourceData) {
    try {
      const { name, platform, config } = sourceData;

      // Validation des données
      if (!name || !platform || !config) {
        throw new Error("Missing required fields: name, platform, config");
      }

      // Chiffrement des credentials
      const encryptedConfig = {
        ...config,
        credentials: config.credentials
          ? encryptCredentials(config.credentials)
          : null,
      };

      const source = await prisma.source.create({
        data: {
          name,
          platform,
          config: JSON.stringify(encryptedConfig),
          status: "active",
        },
      });

      console.log(`✅ Source created: ${name} (${platform})`);
      return source;
    } catch (error) {
      console.error("Error creating source:", error);
      throw error;
    }
  }

  async updateSource(id, updateData) {
    try {
      const existingSource = await this.getSourceById(id);

      // Chiffrement des nouvelles credentials si fournies
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

      console.log(`✅ Source updated: ${source.name}`);
      return source;
    } catch (error) {
      console.error("Error updating source:", error);
      throw error;
    }
  }

  async deleteSource(id) {
    try {
      await prisma.source.delete({
        where: { id },
      });

      console.log(`✅ Source deleted: ${id}`);
      return { success: true };
    } catch (error) {
      console.error("Error deleting source:", error);
      throw error;
    }
  }

  async testCredentials(testData) {
    try {
      const { platform, credentials, sourcePath, siteUrl } = testData;

      console.log(`🧪 Testing credentials for ${platform}:`, {
        platform,
        hasCredentials: !!credentials,
        credentialsKeys: credentials ? Object.keys(credentials) : [],
        sourcePath: sourcePath || "/",
        siteUrl,
      });

      // Préparer la config pour le test avec la bonne structure
      const testConfig = {
        credentials, // Les credentials doivent être dans config.credentials
        sourcePath: sourcePath || "/",
        ...(siteUrl && { siteUrl }),
      };

      // Créer le connecteur approprié
      const connector = DriveConnectorFactory.createConnector(
        platform,
        testConfig,
      );

      // Test de connexion
      const result = await connector.testConnection();

      console.log(
        `🧪 Credentials test for ${platform}:`,
        result.success ? "✅ Success" : "❌ Failed",
        result,
      );

      return result;
    } catch (error) {
      console.error("Credentials test failed:", error);

      return {
        success: false,
        message: error.message || "Test des identifiants échoué",
        details: {
          platform,
          error: error.name || "Unknown error",
        },
      };
    }
  }

  async testConnection(id) {
    try {
      const source = await this.getSourceById(id);

      // Déchiffrer les credentials pour le test
      const decryptedConfig = {
        ...source.config,
        credentials: source.config.credentials
          ? decryptCredentials(source.config.credentials)
          : null,
      };

      // Créer le connecteur approprié
      const connector = DriveConnectorFactory.createConnector(
        source.platform,
        decryptedConfig,
      );

      // Test de connexion
      const result = await connector.testConnection();

      // Log du résultat
      await prisma.syncLog.create({
        data: {
          sourceId: id,
          action: "test_connection",
          status: result.success ? "success" : "error",
          message: result.message,
          details: JSON.stringify(result.details || {}),
        },
      });

      return result;
    } catch (error) {
      console.error("Connection test failed:", error);

      // Log de l'erreur
      await prisma.syncLog.create({
        data: {
          sourceId: id,
          action: "test_connection",
          status: "error",
          message: error.message,
          details: JSON.stringify({ error: error.stack }),
        },
      });

      throw error;
    }
  }

  async syncSource(id) {
    try {
      const source = await this.getSourceById(id);

      if (source.status !== "active") {
        throw new Error("Source must be active to sync");
      }

      console.log(`🔄 Starting sync for source: ${source.name}`);

      // Déchiffrer les credentials pour la synchronisation
      const decryptedConfig = {
        ...source.config,
        credentials: source.config.credentials
          ? decryptCredentials(source.config.credentials)
          : null,
      };

      // Créer le connecteur approprié
      const connector = DriveConnectorFactory.createConnector(
        source.platform,
        decryptedConfig,
      );

      // Lister les fichiers de la source
      console.log(`📁 Listing files from ${source.platform}...`);

      // Pour Google Drive, utiliser "root" au lieu de "/"
      let sourcePath = decryptedConfig.sourcePath || "/";
      if (source.platform === "googledrive") {
        sourcePath =
          sourcePath === "/" || sourcePath === "" ? "root" : sourcePath;
      }

      const files = await connector.listFiles(sourcePath, 50);

      console.log(`📄 Found ${files.length} files to process`);

      // Filtrer selon les extensions autorisées
      // Filtrer selon les extensions autorisées
      const allowedExtensions = Array.isArray(
        decryptedConfig.filters?.extensions,
      )
        ? decryptedConfig.filters.extensions
        : [".docx", ".pdf", ".doc"];

      console.log(`🔍 Filtering with extensions:`, allowedExtensions);

      const filteredFiles = files.filter((file) => {
        const fileExt = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
        const isAllowed = fileExt && allowedExtensions.includes(fileExt);
        console.log(
          `📄 File: ${file.name} (${fileExt}) -> ${isAllowed ? "INCLUDED" : "EXCLUDED"}`,
        );
        return isAllowed;
      });

      console.log(`✅ ${filteredFiles.length} files match the filters`);

      // Créer un log de synchronisation
      const syncLog = await prisma.syncLog.create({
        data: {
          sourceId: id,
          action: "manual_sync",
          status: "in_progress",
          message: `Starting sync - ${filteredFiles.length} files to process`,
          details: JSON.stringify({
            totalFiles: files.length,
            filteredFiles: filteredFiles.length,
            platform: source.platform,
          }),
        },
      });

      // Mettre à jour le timestamp de dernière sync
      await prisma.source.update({
        where: { id },
        data: { lastSync: new Date() },
      });

      // Traiter les fichiers en arrière-plan (simulation pour l'instant)
      setTimeout(async () => {
        try {
          // Ici on pourrait implémenter le téléchargement et la conversion réels
          // Pour l'instant, on simule le traitement

          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: {
              status: "success",
              message: `Sync completed - processed ${filteredFiles.length} files`,
              details: JSON.stringify({
                processedFiles: filteredFiles.length,
                platform: source.platform,
                completed: true,
              }),
            },
          });

          console.log(`✅ Sync completed for source: ${source.name}`);
        } catch (error) {
          await prisma.syncLog.update({
            where: { id: syncLog.id },
            data: {
              status: "error",
              message: `Sync failed: ${error.message}`,
              details: JSON.stringify({ error: error.stack }),
            },
          });
          console.error(`❌ Sync failed for source: ${source.name}`, error);
        }
      }, 1000);

      return {
        success: true,
        message: `Sync started for ${filteredFiles.length} files`,
        details: {
          totalFiles: files.length,
          filesToProcess: filteredFiles.length,
          syncLogId: syncLog.id,
        },
      };
    } catch (error) {
      console.error("Sync failed:", error);
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
        where: { status: "active" },
      });

      const recentJobs = await prisma.conversionJob.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24h
          },
        },
      });

      return {
        totalSources: stats._count._all,
        activeSources: activeCount,
        recentJobs,
      };
    } catch (error) {
      console.error("Error fetching stats:", error);
      throw error;
    }
  }
}

export default SourceService;
