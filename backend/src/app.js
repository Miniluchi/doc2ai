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

app.set("trust proxy", 1);

async function setupApp() {
  console.log("Starting Doc2AI Backend...");

  await fs.ensureDir(config.storagePath);
  await fs.ensureDir(config.tempPath);
  console.log("Storage directories created");

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

  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    }),
  );

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

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  app.use(sanitizeInput);
  app.use(extractUserInfo);

  app.use((req, res, next) => {
    console.log(`${req.method} ${req.originalUrl} - ${req.ip}`);
    next();
  });

  app.use("/api", apiRoutes);

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

  app.use(logError);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function startServer() {
  try {
    await initializeDatabase();
    await setupApp();

    const externalPort = process.env.EXTERNAL_PORT || config.port;
    const server = app.listen(config.port, () => {
      console.log(`Doc2AI Backend running on port ${externalPort}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`API available at: http://localhost:${externalPort}/api`);
    });

    console.log("Starting queue processor...");
    try {
      await queueService.startProcessing(3);
      console.log("Queue processor started successfully");
    } catch (error) {
      console.error("❌ Queue processor failed to start:", error.message);
    }

    console.log("Starting monitoring service...");
    try {
      await monitoringService.start();
      console.log("Monitoring service started successfully");
    } catch (error) {
      console.warn("⚠️ Monitoring service failed to start:", error.message);
    }

    const gracefulShutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Graceful shutdown...`);

      if (monitoringService.isRunning) {
        await monitoringService.stop();
      }

      console.log("Closing queue...");
      await queueService.close();

      await closeDatabase();

      server.close(() => {
        console.log("Doc2AI Backend stopped gracefully");
        process.exit(0);
      });

      setTimeout(() => {
        console.error(
          "❌ Could not close connections in time, forcefully shutting down",
        );
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

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

if (import.meta.url === `file://${process.argv[1]}`) {
  await startServer();
}

export default app;
export { startServer };
