import SourceService from "../services/sourceService.js";

const sourceService = new SourceService();

class SourceController {
  // GET /api/sources
  async getAllSources(req, res) {
    try {
      const sources = await sourceService.getAllSources();
      res.json({
        success: true,
        data: sources,
      });
    } catch (error) {
      console.error("Error in getAllSources:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch sources",
        error: error.message,
      });
    }
  }

  // GET /api/sources/:id
  async getSourceById(req, res) {
    try {
      const { id } = req.params;
      const source = await sourceService.getSourceById(id);

      res.json({
        success: true,
        data: source,
      });
    } catch (error) {
      console.error("Error in getSourceById:", error);

      if (error.message === "Source not found") {
        return res.status(404).json({
          success: false,
          message: "Source not found",
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to fetch source",
        error: error.message,
      });
    }
  }

  // POST /api/sources
  async createSource(req, res) {
    try {
      const { name, platform, config } = req.body;

      // Validation basique
      if (!name || !platform || !config) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: name, platform, config",
        });
      }

      // Validation du platform
      const supportedPlatforms = ["sharepoint", "googledrive", "onedrive"];
      if (!supportedPlatforms.includes(platform)) {
        return res.status(400).json({
          success: false,
          message: `Unsupported platform. Supported: ${supportedPlatforms.join(", ")}`,
        });
      }

      const source = await sourceService.createSource(req.body);

      res.status(201).json({
        success: true,
        data: source,
        message: "Source created successfully",
      });
    } catch (error) {
      console.error("Error in createSource:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create source",
        error: error.message,
      });
    }
  }

  // PUT /api/sources/:id
  async updateSource(req, res) {
    try {
      const { id } = req.params;
      const source = await sourceService.updateSource(id, req.body);

      res.json({
        success: true,
        data: source,
        message: "Source updated successfully",
      });
    } catch (error) {
      console.error("Error in updateSource:", error);

      if (error.message === "Source not found") {
        return res.status(404).json({
          success: false,
          message: "Source not found",
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to update source",
        error: error.message,
      });
    }
  }

  // DELETE /api/sources/:id
  async deleteSource(req, res) {
    try {
      const { id } = req.params;
      await sourceService.deleteSource(id);

      res.json({
        success: true,
        message: "Source deleted successfully",
      });
    } catch (error) {
      console.error("Error in deleteSource:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete source",
        error: error.message,
      });
    }
  }

  // POST /api/sources/test-credentials
  async testCredentials(req, res) {
    try {
      const { platform, credentials, sourcePath, siteUrl } = req.body;

      // Validation basique
      if (!platform || !credentials) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: platform, credentials",
        });
      }

      // Validation du platform
      const supportedPlatforms = ["sharepoint", "googledrive", "onedrive"];
      if (!supportedPlatforms.includes(platform)) {
        return res.status(400).json({
          success: false,
          message: `Unsupported platform. Supported: ${supportedPlatforms.join(", ")}`,
        });
      }

      const result = await sourceService.testCredentials({
        platform,
        credentials,
        sourcePath: sourcePath || "/",
        ...(siteUrl && { siteUrl }),
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error in testCredentials:", error);
      res.status(500).json({
        success: false,
        message: "Credentials test failed",
        error: error.message,
      });
    }
  }

  // POST /api/sources/:id/test
  async testConnection(req, res) {
    try {
      const { id } = req.params;
      const result = await sourceService.testConnection(id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error in testConnection:", error);
      res.status(500).json({
        success: false,
        message: "Connection test failed",
        error: error.message,
      });
    }
  }

  // POST /api/sources/:id/sync
  async syncSource(req, res) {
    try {
      const { id } = req.params;
      const result = await sourceService.syncSource(id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Error in syncSource:", error);
      res.status(500).json({
        success: false,
        message: "Sync failed",
        error: error.message,
      });
    }
  }

  // GET /api/sources/stats
  async getStats(req, res) {
    try {
      const stats = await sourceService.getSourceStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Error in getStats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch statistics",
        error: error.message,
      });
    }
  }
}

export default SourceController;
