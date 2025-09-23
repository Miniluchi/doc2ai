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

  // GET /api/sources/google-drive/folders?parent_id=xxx&credentials=xxx
  async getGoogleDriveFolders(req, res) {
    try {
      const { parent_id = "root" } = req.query;
      const { credentials } = req.body;

      if (!credentials) {
        return res.status(400).json({
          success: false,
          message: "Missing Google Drive credentials",
        });
      }

      const folders = await sourceService.getGoogleDriveFolders(
        parent_id,
        credentials,
      );

      res.json({
        success: true,
        data: folders,
      });
    } catch (error) {
      console.error("Error in getGoogleDriveFolders:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch Google Drive folders",
        error: error.message,
      });
    }
  }

  // POST /api/sources/google-drive/preview-files
  async previewGoogleDriveFiles(req, res) {
    try {
      const {
        folder_id = "root",
        credentials,
        extensions = [".docx", ".pdf", ".doc", ".txt"],
      } = req.body;

      if (!credentials) {
        return res.status(400).json({
          success: false,
          message: "Missing Google Drive credentials",
        });
      }

      const files = await sourceService.previewGoogleDriveFiles(
        folder_id,
        credentials,
        extensions,
      );

      res.json({
        success: true,
        data: files,
      });
    } catch (error) {
      console.error("Error in previewGoogleDriveFiles:", error);
      res.status(500).json({
        success: false,
        message: "Failed to preview Google Drive files",
        error: error.message,
      });
    }
  }
}

export default SourceController;
