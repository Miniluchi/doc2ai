import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { initializeDatabase, closeDatabase } from "./config/database.js";
import config from "./config/env.js";
import apiRoutes from "./routes/index.js";
import {
  errorHandler,
  notFoundHandler,
  logError,
} from "./middleware/errorHandler.js";
import { extractUserInfo } from "./middleware/auth.js";
import { sanitizeInput } from "./middleware/validation.js";
import monitoringService from "./services/monitoringService.js";
import queueService from "./services/queueService.js";
import fs from "fs-extra";

const app = express();

/**
 * Configuration de l'application Express
 */
async function setupApp() {
  console.log("🚀 Starting Doc2AI Backend...");

  // Créer les répertoires nécessaires
  await fs.ensureDir(config.storagePath);
  await fs.ensureDir(config.tempPath);
  console.log("📁 Storage directories created");

  // Middlewares de sécurité
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }),
  );

  // CORS
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    }),
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: {
      success: false,
      message: "Too many requests",
      error: "Rate limit exceeded. Please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/", limiter);

  // Parsing des requêtes
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Middlewares custom
  app.use(sanitizeInput);
  app.use(extractUserInfo);

  // Logging des requêtes
  app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.originalUrl} - ${req.ip}`);
    next();
  });

  // Routes API
  app.use("/api", apiRoutes);

  // Route racine
  app.get("/", (req, res) => {
    res.json({
      name: "Doc2AI Backend",
      version: "1.0.0",
      status: "running",
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      endpoints: {
        api: "/api",
        health: "/api/health",
        docs: "/api",
      },
    });
  });

  // Middleware d'erreur
  app.use(logError);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Démarrage du serveur
 */
async function startServer() {
  try {
    // Initialiser la base de données
    await initializeDatabase();

    // Configurer l'app
    await setupApp();

    // Démarrer le serveur
    const server = app.listen(config.port, () => {
      console.log(`✅ Doc2AI Backend running on port ${config.port}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`📊 API available at: http://localhost:${config.port}/api`);
    });

    // Démarrer le processeur de queue asynchrone
    console.log("🚀 Starting queue processor...");
    try {
      await queueService.startProcessing(3); // 3 conversions en parallèle
      console.log("✅ Queue processor started successfully");
    } catch (error) {
      console.error("❌ Queue processor failed to start:", error.message);
    }

    // Démarrer le service de monitoring
    console.log("🔄 Starting monitoring service...");
    try {
      await monitoringService.start();
      console.log("✅ Monitoring service started successfully");
    } catch (error) {
      console.warn("⚠️ Monitoring service failed to start:", error.message);
    }

    // Gestion propre de l'arrêt
    const gracefulShutdown = async (signal) => {
      console.log(`\n📤 Received ${signal}. Graceful shutdown...`);

      // Arrêter le monitoring
      if (monitoringService.isRunning) {
        await monitoringService.stop();
      }

      // Fermer la queue (attend que les jobs en cours se terminent)
      console.log("Closing queue...");
      await queueService.close();

      // Fermer les connexions DB
      await closeDatabase();

      // Fermer le serveur
      server.close(() => {
        console.log("✅ Doc2AI Backend stopped gracefully");
        process.exit(0);
      });

      // Force exit après 10 secondes
      setTimeout(() => {
        console.error(
          "❌ Could not close connections in time, forcefully shutting down",
        );
        process.exit(1);
      }, 10000);
    };

    // Écouter les signaux de fermeture
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // Gestion des erreurs non capturées
    process.on("unhandledRejection", (reason, promise) => {
      console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    });

    process.on("uncaughtException", (error) => {
      console.error("❌ Uncaught Exception:", error);
      process.exit(1);
    });

    return server;
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Démarrer le serveur si ce fichier est exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  await startServer();
}

export default app;
export { startServer };
