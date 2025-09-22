import express from "express";
import SourceController from "../controllers/sourceController.js";

const router = express.Router();
const sourceController = new SourceController();

// Routes pour les sources
router.get("/stats", sourceController.getStats.bind(sourceController));
router.get("/", sourceController.getAllSources.bind(sourceController));
router.get("/:id", sourceController.getSourceById.bind(sourceController));
router.post("/", sourceController.createSource.bind(sourceController));
router.put("/:id", sourceController.updateSource.bind(sourceController));
router.delete("/:id", sourceController.deleteSource.bind(sourceController));
router.post(
  "/test-credentials",
  sourceController.testCredentials.bind(sourceController),
);
router.post(
  "/:id/test",
  sourceController.testConnection.bind(sourceController),
);
router.post("/:id/sync", sourceController.syncSource.bind(sourceController));

export default router;
