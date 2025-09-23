import DriveConnector from "../base/driveConnector.js";
import axios from "axios";
import fs from "fs-extra";
import path from "path";

/**
 * Connecteur pour Google Drive
 * Utilise Google Drive API v3
 */
class GoogleDriveConnector extends DriveConnector {
  constructor(config) {
    super(config);
    this.accessToken = null;
    this.tokenExpiry = null;
    this.baseUrl = "https://www.googleapis.com/drive/v3";
  }

  /**
   * Authentifie avec Google Drive API
   */
  async authenticate() {
    try {
      this.validateConfig();

      const { clientId, clientSecret, refreshToken } = this.config.credentials;

      // Obtenir un access token via refresh token
      const tokenUrl = "https://oauth2.googleapis.com/token";

      const params = {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      };

      this.log("authenticate", { clientId: clientId.substring(0, 12) + "..." });

      const response = await axios.post(tokenUrl, params, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + response.data.expires_in * 1000;
      this.isAuthenticated = true;

      this.log("authenticate", {
        success: true,
        tokenExpiry: new Date(this.tokenExpiry),
      });
      return true;
    } catch (error) {
      this.handleApiError(error, "authenticate");
    }
  }

  /**
   * Test de connexion
   */
  async testConnection() {
    try {
      await this.authenticate();

      // Tester l'accès à l'API en récupérant les infos utilisateur
      const response = await this.makeAuthenticatedRequest(
        "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota",
      );

      const userInfo = response.data;

      return {
        success: true,
        message: "Connection successful",
        details: {
          platform: "Google Drive",
          user: userInfo.user?.emailAddress,
          storageUsed: userInfo.storageQuota?.usage,
          authenticated: this.isAuthenticated,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        details: {
          error:
            error.originalError?.response?.data || error.originalError?.message,
        },
      };
    }
  }

  /**
   * Liste les dossiers dans un répertoire
   */
  async listFolders(folderId = "root") {
    try {
      await this.ensureAuthenticated();

      const params = {
        q: `'${folderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
        fields: "files(id,name,modifiedTime,parents)",
        orderBy: "name",
      };

      this.log("listFolders", { folderId });

      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/files`,
        { params },
      );

      const folders = response.data.files || [];

      return folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        path: `/${folder.name}`,
        modifiedTime: folder.modifiedTime,
        parents: folder.parents,
        type: "folder",
      }));
    } catch (error) {
      this.handleApiError(error, "listFolders");
    }
  }

  /**
   * Liste les fichiers dans un dossier
   */
  async listFiles(folderId = "root", limit = null) {
    try {
      await this.ensureAuthenticated();

      // Construire la requête
      const params = {
        q: `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
        fields:
          "files(id,name,size,modifiedTime,mimeType,webViewLink,md5Checksum,parents)",
        orderBy: "modifiedTime desc",
      };

      if (limit) {
        params.pageSize = limit;
      }

      this.log("listFiles", { folderId, limit });

      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/files`,
        { params },
      );

      const files = response.data.files || [];

      return files.map((file) =>
        this.normalizeFileInfo({
          id: file.id,
          name: file.name,
          path: `/${file.name}`, // Google Drive n'a pas de structure de path traditionnelle
          size: parseInt(file.size) || 0,
          modifiedTime: file.modifiedTime,
          checksum: file.md5Checksum,
          mimeType: file.mimeType,
          webViewLink: file.webViewLink,
          parents: file.parents,
        }),
      );
    } catch (error) {
      this.handleApiError(error, "listFiles");
    }
  }

  /**
   * Recherche des fichiers par nom ou type
   */
  async searchFiles(query, limit = 50) {
    try {
      await this.ensureAuthenticated();

      const params = {
        q: `name contains '${query}' and trashed=false`,
        fields:
          "files(id,name,size,modifiedTime,mimeType,webViewLink,md5Checksum)",
        pageSize: limit,
      };

      this.log("searchFiles", { query, limit });

      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/files`,
        { params },
      );

      const files = response.data.files || [];
      return files.map((file) => this.normalizeFileInfo(file));
    } catch (error) {
      this.handleApiError(error, "searchFiles");
    }
  }

  /**
   * Télécharge un fichier
   */
  async downloadFile(fileId, destinationDir) {
    try {
      await this.ensureAuthenticated();

      this.log("downloadFile", { fileId, destinationDir });

      // Obtenir les métadonnées du fichier
      const fileInfoResponse = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/files/${fileId}?fields=name,size,mimeType`,
      );

      const fileInfo = fileInfoResponse.data;

      // Créer le répertoire de destination
      await fs.ensureDir(destinationDir);

      let downloadUrl = `${this.baseUrl}/files/${fileId}?alt=media`;
      let fileName = fileInfo.name;

      // Gérer les formats Google Docs (conversion nécessaire)
      if (fileInfo.mimeType.startsWith("application/vnd.google-apps.")) {
        const conversionMap = {
          "application/vnd.google-apps.document": {
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            extension: ".docx",
          },
          "application/vnd.google-apps.spreadsheet": {
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            extension: ".xlsx",
          },
          "application/vnd.google-apps.presentation": {
            mimeType:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            extension: ".pptx",
          },
        };

        const conversion = conversionMap[fileInfo.mimeType];
        if (conversion) {
          downloadUrl = `${this.baseUrl}/files/${fileId}/export?mimeType=${encodeURIComponent(conversion.mimeType)}`;
          fileName = fileName.replace(/\.[^/.]+$/, "") + conversion.extension;
        } else {
          throw new Error(
            `Unsupported Google Apps format: ${fileInfo.mimeType}`,
          );
        }
      }

      // Télécharger le fichier
      const response = await this.makeAuthenticatedRequest(downloadUrl, {
        responseType: "stream",
      });

      const filePath = path.join(destinationDir, fileName);
      const writer = fs.createWriteStream(filePath);

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on("finish", () => {
          this.log("downloadFile", {
            completed: filePath,
            originalSize: fileInfo.size,
          });
          resolve(filePath);
        });
        writer.on("error", reject);
      });
    } catch (error) {
      this.handleApiError(error, "downloadFile");
    }
  }

  /**
   * Surveillance des changements via Google Drive API changes
   */
  async watchForChanges(folderId, callback) {
    this.log("watchForChanges", {
      folderId,
      note: "Using polling approach - push notifications require webhook setup",
    });

    // Pour une implémentation simple, on utilise le polling des changements
    // En production, il faudrait utiliser les push notifications
    let pageToken = null;

    const pollChanges = async () => {
      try {
        const params = {
          fields:
            "nextPageToken,newStartPageToken,changes(fileId,file(id,name,parents,modifiedTime,trashed))",
          includeRemoved: false,
        };

        if (pageToken) {
          params.pageToken = pageToken;
        }

        const response = await this.makeAuthenticatedRequest(
          `${this.baseUrl}/changes`,
          { params },
        );

        const changes = response.data.changes || [];

        // Filtrer les changements pour le dossier surveillé
        const relevantChanges = changes.filter((change) => {
          const file = change.file;
          return (
            file &&
            file.parents &&
            file.parents.includes(folderId) &&
            !file.trashed
          );
        });

        if (relevantChanges.length > 0) {
          this.log("watchForChanges", { changes: relevantChanges.length });
          const changedFiles = relevantChanges.map((change) =>
            this.normalizeFileInfo(change.file),
          );
          callback(changedFiles);
        }

        pageToken =
          response.data.nextPageToken || response.data.newStartPageToken;
      } catch (error) {
        console.error("Error in watchForChanges polling:", error);
      }
    };

    // Polling initial
    await pollChanges();

    // Polling périodique
    const pollInterval = setInterval(pollChanges, 60000); // Poll toutes les minutes

    // Retourner une fonction de cleanup
    return () => {
      clearInterval(pollInterval);
      this.log("watchForChanges", { status: "stopped" });
    };
  }

  /**
   * Effectue une requête authentifiée
   */
  async makeAuthenticatedRequest(url, config = {}) {
    await this.ensureAuthenticated();

    return axios({
      url,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...config.headers,
      },
      ...config,
    });
  }

  /**
   * S'assure que l'authentication est valide
   */
  async ensureAuthenticated() {
    if (!this.isAuthenticated || Date.now() >= this.tokenExpiry - 30000) {
      // Re-authentifier si pas authentifié ou token expire dans 30s
      await this.authenticate();
    }
  }

  /**
   * Validation spécifique à Google Drive
   */
  validateConfig() {
    super.validateConfig();

    const { clientId, clientSecret, refreshToken } = this.config.credentials;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        "Google Drive requires clientId, clientSecret, and refreshToken",
      );
    }

    return true;
  }

  /**
   * Nettoyage des ressources
   */
  async cleanup() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.isAuthenticated = false;
    this.log("cleanup", { status: "completed" });
  }
}

export default GoogleDriveConnector;
