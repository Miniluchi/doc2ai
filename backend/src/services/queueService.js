import Queue from "bull";
import config from "../config/env.js";
import ConversionService from "./conversionService.js";

/**
 * Service de gestion de la queue asynchrone pour les conversions de documents
 * Utilise Bull pour gérer les jobs de conversion de manière asynchrone
 */
class QueueService {
  constructor() {
    this.conversionService = new ConversionService();

    // Créer la queue de conversion avec Redis
    this.conversionQueue = new Queue("document-conversion", config.redisUrl, {
      defaultJobOptions: {
        attempts: 3, // 3 tentatives en cas d'échec
        backoff: {
          type: "exponential",
          delay: 2000, // Délai initial de 2s, puis 4s, puis 8s
        },
        removeOnComplete: 100, // Garder les 100 derniers jobs complétés
        removeOnFail: 200, // Garder les 200 derniers jobs échoués
      },
    });

    // Configuration des event handlers
    this.setupEventHandlers();
  }

  /**
   * Configure les gestionnaires d'événements pour la queue
   */
  setupEventHandlers() {
    // Job complété avec succès
    this.conversionQueue.on("completed", (job, result) => {
      console.log(`✅ Job ${job.id} complété: ${result.fileName}`);
    });

    // Job échoué
    this.conversionQueue.on("failed", (job, error) => {
      console.error(`❌ Job ${job.id} échoué:`, error.message);
    });

    // Job en cours
    this.conversionQueue.on("active", (job) => {
      console.log(`⚙️ Traitement du job ${job.id}: ${job.data.fileName}`);
    });

    // Progression d'un job
    this.conversionQueue.on("progress", (job, progress) => {
      console.log(`📊 Job ${job.id} progression: ${progress}%`);
    });

    // Queue en erreur
    this.conversionQueue.on("error", (error) => {
      console.error("❌ Erreur de queue:", error);
    });
  }

  /**
   * Configure le processeur de jobs
   * @param {number} concurrency - Nombre de jobs à traiter en parallèle (défaut: 3)
   */
  async startProcessing(concurrency = 3) {
    console.log(
      `🚀 Démarrage du processeur de queue (concurrence: ${concurrency})`,
    );

    this.conversionQueue.process(concurrency, async (job) => {
      const { jobId, fileName } = job.data;

      try {
        // Mettre à jour la progression: démarrage
        await job.progress(10);

        // Traiter le job de conversion
        const result = await this.conversionService.processJob(jobId);

        // Mettre à jour la progression: terminé
        await job.progress(100);

        return {
          success: true,
          jobId,
          fileName,
          outputPath: result.outputPath,
        };
      } catch (error) {
        console.error(`❌ Erreur lors du traitement du job ${jobId}:`, error);

        // Relancer l'erreur pour que Bull gère les retries
        throw error;
      }
    });
  }

  /**
   * Ajoute un job de conversion à la queue
   * @param {string} jobId - ID du job de conversion dans la base de données
   * @param {string} fileName - Nom du fichier à convertir
   * @param {object} options - Options du job (priority, delay, etc.)
   * @returns {Promise<object>} Job Bull créé
   */
  async enqueueConversion(jobId, fileName, options = {}) {
    try {
      const { priority = 0, delay = 0 } = options;

      const job = await this.conversionQueue.add(
        { jobId, fileName },
        {
          priority,
          delay,
          jobId: `conversion-${jobId}`, // ID unique pour éviter les duplications
        },
      );

      console.log(`📥 Job ajouté à la queue: ${fileName} (ID: ${job.id})`);
      return job;
    } catch (error) {
      console.error("❌ Erreur lors de l'ajout à la queue:", error);
      throw error;
    }
  }

  /**
   * Récupère les statistiques de la queue
   * @returns {Promise<object>} Statistiques (waiting, active, completed, failed, delayed)
   */
  async getStats() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.conversionQueue.getWaitingCount(),
        this.conversionQueue.getActiveCount(),
        this.conversionQueue.getCompletedCount(),
        this.conversionQueue.getFailedCount(),
        this.conversionQueue.getDelayedCount(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
      };
    } catch (error) {
      console.error("❌ Erreur lors de la récupération des stats:", error);
      throw error;
    }
  }

  /**
   * Récupère les jobs actifs
   * @returns {Promise<Array>} Liste des jobs en cours
   */
  async getActiveJobs() {
    try {
      const jobs = await this.conversionQueue.getActive();
      return jobs.map((job) => ({
        id: job.id,
        data: job.data,
        progress: job.progress(),
        timestamp: job.timestamp,
      }));
    } catch (error) {
      console.error(
        "❌ Erreur lors de la récupération des jobs actifs:",
        error,
      );
      throw error;
    }
  }

  /**
   * Récupère les jobs en attente
   * @returns {Promise<Array>} Liste des jobs en attente
   */
  async getWaitingJobs() {
    try {
      const jobs = await this.conversionQueue.getWaiting();
      return jobs.map((job) => ({
        id: job.id,
        data: job.data,
        timestamp: job.timestamp,
      }));
    } catch (error) {
      console.error(
        "❌ Erreur lors de la récupération des jobs en attente:",
        error,
      );
      throw error;
    }
  }

  /**
   * Récupère les jobs échoués
   * @param {number} limit - Nombre maximum de jobs à retourner
   * @returns {Promise<Array>} Liste des jobs échoués
   */
  async getFailedJobs(limit = 20) {
    try {
      const jobs = await this.conversionQueue.getFailed(0, limit - 1);
      return jobs.map((job) => ({
        id: job.id,
        data: job.data,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        timestamp: job.timestamp,
        attemptsMade: job.attemptsMade,
      }));
    } catch (error) {
      console.error(
        "❌ Erreur lors de la récupération des jobs échoués:",
        error,
      );
      throw error;
    }
  }

  /**
   * Nettoie les anciens jobs (complétés et échoués)
   * @param {number} grace - Période de grâce en millisecondes (défaut: 24h)
   * @returns {Promise<void>}
   */
  async cleanOldJobs(grace = 24 * 60 * 60 * 1000) {
    try {
      await this.conversionQueue.clean(grace, "completed");
      await this.conversionQueue.clean(grace, "failed");
      console.log(
        `🧹 Nettoyage des jobs terminés depuis plus de ${grace / 1000 / 60 / 60}h`,
      );
    } catch (error) {
      console.error("❌ Erreur lors du nettoyage des jobs:", error);
      throw error;
    }
  }

  /**
   * Vide complètement la queue (tous les jobs)
   * ⚠️ Utiliser avec précaution!
   * @returns {Promise<void>}
   */
  async emptyQueue() {
    try {
      await this.conversionQueue.empty();
      console.log("🗑️ Queue vidée complètement");
    } catch (error) {
      console.error("❌ Erreur lors du vidage de la queue:", error);
      throw error;
    }
  }

  /**
   * Pause la queue (arrête le traitement des nouveaux jobs)
   * @returns {Promise<void>}
   */
  async pause() {
    try {
      await this.conversionQueue.pause();
      console.log("⏸️ Queue mise en pause");
    } catch (error) {
      console.error("❌ Erreur lors de la pause de la queue:", error);
      throw error;
    }
  }

  /**
   * Reprend le traitement de la queue
   * @returns {Promise<void>}
   */
  async resume() {
    try {
      await this.conversionQueue.resume();
      console.log("▶️ Queue reprise");
    } catch (error) {
      console.error("❌ Erreur lors de la reprise de la queue:", error);
      throw error;
    }
  }

  /**
   * Ferme proprement la queue
   * @returns {Promise<void>}
   */
  async close() {
    try {
      await this.conversionQueue.close();
      console.log("🛑 Queue fermée");
    } catch (error) {
      console.error("❌ Erreur lors de la fermeture de la queue:", error);
      throw error;
    }
  }
}

// Singleton instance
const queueService = new QueueService();

export default queueService;
