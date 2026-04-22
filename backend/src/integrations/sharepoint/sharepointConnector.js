import DriveConnector from '../base/driveConnector.js';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

class SharePointConnector extends DriveConnector {
  constructor(config) {
    super(config);
    this.accessToken = null;
    this.tokenExpiry = null;
    this.isOneDrive = config.isOneDrive || false;
    this.baseUrl = 'https://graph.microsoft.com/v1.0';
    this.siteId = null;
  }

  async authenticate() {
    try {
      this.validateConfig();

      const { clientId, clientSecret, tenantId } = this.config.credentials;

      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

      const params = new URLSearchParams();
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('scope', 'https://graph.microsoft.com/.default');
      params.append('grant_type', 'client_credentials');

      this.log('authenticate', { tenantId, clientId: clientId.substring(0, 8) + '...' });

      const response = await axios.post(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + response.data.expires_in * 1000;
      this.isAuthenticated = true;

      if (!this.isOneDrive && this.config.siteUrl) {
        await this.getSiteId();
      }

      this.log('authenticate', { success: true, tokenExpiry: new Date(this.tokenExpiry) });
      return true;
    } catch (error) {
      this.handleApiError(error, 'authenticate');
    }
  }

  async getSiteId() {
    try {
      const siteUrl = new URL(this.config.siteUrl);
      const hostname = siteUrl.hostname;
      const sitePath = siteUrl.pathname;

      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/sites/${hostname}:${sitePath}`,
      );

      this.siteId = response.data.id;
      this.log('getSiteId', { siteId: this.siteId });
    } catch (error) {
      this.handleApiError(error, 'getSiteId');
    }
  }

  async testConnection() {
    try {
      await this.authenticate();

      const files = await this.listFiles('/', 1);

      return {
        success: true,
        message: 'Connection successful',
        details: {
          platform: this.isOneDrive ? 'OneDrive' : 'SharePoint',
          filesFound: files.length,
          authenticated: this.isAuthenticated,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        details: {
          error: error.originalError?.response?.data || error.originalError?.message,
        },
      };
    }
  }

  async listFiles(folderPath = '/', limit = null) {
    try {
      await this.ensureAuthenticated();

      let endpoint;
      if (this.isOneDrive) {
        endpoint =
          folderPath === '/'
            ? `${this.baseUrl}/me/drive/root/children`
            : `${this.baseUrl}/me/drive/root:${folderPath}:/children`;
      } else {
        endpoint =
          folderPath === '/'
            ? `${this.baseUrl}/sites/${this.siteId}/drive/root/children`
            : `${this.baseUrl}/sites/${this.siteId}/drive/root:${folderPath}:/children`;
      }

      const params = {
        $select: 'id,name,size,lastModifiedDateTime,file,webUrl,@microsoft.graph.downloadUrl',
        $filter: 'file ne null',
      };

      if (limit) {
        params['$top'] = limit;
      }

      this.log('listFiles', { folderPath, limit, endpoint });

      const response = await this.makeAuthenticatedRequest(endpoint, { params });
      const files = response.data.value || [];

      return files.map((file) =>
        this.normalizeFileInfo({
          id: file.id,
          name: file.name,
          path: `${folderPath}/${file.name}`.replace('//', '/'),
          size: file.size,
          modifiedTime: file.lastModifiedDateTime,
          downloadUrl: file['@microsoft.graph.downloadUrl'],
          webUrl: file.webUrl,
        }),
      );
    } catch (error) {
      this.handleApiError(error, 'listFiles');
    }
  }

  async downloadFile(fileId, destinationDir) {
    try {
      await this.ensureAuthenticated();

      let endpoint;
      if (this.isOneDrive) {
        endpoint = `${this.baseUrl}/me/drive/items/${fileId}`;
      } else {
        endpoint = `${this.baseUrl}/sites/${this.siteId}/drive/items/${fileId}`;
      }

      this.log('downloadFile', { fileId, destinationDir });

      const fileInfoResponse = await this.makeAuthenticatedRequest(endpoint);
      const fileInfo = fileInfoResponse.data;
      const downloadUrl = fileInfo['@microsoft.graph.downloadUrl'];

      if (!downloadUrl) {
        throw new Error('No download URL available for this file');
      }

      await fs.ensureDir(destinationDir);

      const response = await axios.get(downloadUrl, {
        responseType: 'stream',
      });

      const fileName = fileInfo.name;
      const filePath = path.join(destinationDir, fileName);
      const writer = fs.createWriteStream(filePath);

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          this.log('downloadFile', { completed: filePath, size: fileInfo.size });
          resolve(filePath);
        });
        writer.on('error', reject);
      });
    } catch (error) {
      this.handleApiError(error, 'downloadFile');
    }
  }

  async watchForChanges(folderPath, callback) {
    this.log('watchForChanges', {
      folderPath,
      note: 'Using polling approach - webhooks require additional setup',
    });

    let lastCheck = new Date();

    const pollInterval = setInterval(async () => {
      try {
        const files = await this.listFiles(folderPath);

        const changedFiles = files.filter((file) => new Date(file.modifiedTime) > lastCheck);

        if (changedFiles.length > 0) {
          this.log('watchForChanges', { changedFiles: changedFiles.length });
          callback(changedFiles);
        }

        lastCheck = new Date();
      } catch (error) {
        console.error('Error in watchForChanges polling:', error);
      }
    }, 60000);

    return () => {
      clearInterval(pollInterval);
      this.log('watchForChanges', { status: 'stopped' });
    };
  }

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

  async ensureAuthenticated() {
    if (!this.isAuthenticated || Date.now() >= this.tokenExpiry - 30000) {
      await this.authenticate();
    }
  }

  validateConfig() {
    super.validateConfig();

    const { clientId, clientSecret, tenantId } = this.config.credentials;

    if (!clientId || !clientSecret || !tenantId) {
      throw new Error('SharePoint requires clientId, clientSecret, and tenantId');
    }

    if (!this.isOneDrive && !this.config.siteUrl) {
      throw new Error('SharePoint requires siteUrl');
    }

    return true;
  }

  async cleanup() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.isAuthenticated = false;
    this.siteId = null;
    this.log('cleanup', { status: 'completed' });
  }
}

export default SharePointConnector;
