import DriveConnector from '../base/driveConnector.js';
import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
import fs from 'fs-extra';
import path from 'node:path';
import logger from '../../config/logger.js';
import type { FileInfo, ConnectionTestResult, SourceConfig } from '../../types/domain.js';

interface SharePointCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

interface SharePointConfig extends SourceConfig {
  isOneDrive?: boolean;
}

class SharePointConnector extends DriveConnector {
  private accessToken: string | null;
  private tokenExpiry: number | null;
  private readonly isOneDrive: boolean;
  private readonly baseUrl = 'https://graph.microsoft.com/v1.0';
  private siteId: string | null;

  constructor(config: SharePointConfig) {
    super(config);
    this.accessToken = null;
    this.tokenExpiry = null;
    this.isOneDrive = config.isOneDrive ?? false;
    this.siteId = null;
  }

  override async authenticate(): Promise<boolean> {
    try {
      this.validateConfig();

      const { clientId, clientSecret, tenantId } = this.config
        .credentials as SharePointCredentials;

      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

      const params = new URLSearchParams();
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('scope', 'https://graph.microsoft.com/.default');
      params.append('grant_type', 'client_credentials');

      this.log('authenticate', { tenantId, clientId: clientId.substring(0, 8) + '...' });

      const response = await axios.post(tokenUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const data = response.data as { access_token: string; expires_in: number };
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + data.expires_in * 1000;
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

  private async getSiteId(): Promise<void> {
    try {
      const siteUrl = new URL(this.config.siteUrl!);
      const hostname = siteUrl.hostname;
      const sitePath = siteUrl.pathname;

      const response = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/sites/${hostname}:${sitePath}`,
      );

      this.siteId = (response.data as { id: string }).id;
      this.log('getSiteId', { siteId: this.siteId });
    } catch (error) {
      this.handleApiError(error, 'getSiteId');
    }
  }

  override async testConnection(): Promise<ConnectionTestResult> {
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
      const err = error as Error & { originalError?: { response?: { data?: unknown; message?: string } } };
      return {
        success: false,
        message: err.message,
        details: { error: err.originalError?.response?.data ?? err.originalError?.message },
      };
    }
  }

  override async listFiles(
    folderPath = '/',
    limit: number | null = null,
  ): Promise<FileInfo[]> {
    try {
      await this.ensureAuthenticated();

      let endpoint: string;
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

      const params: Record<string, unknown> = {
        $select: 'id,name,size,lastModifiedDateTime,file,webUrl,@microsoft.graph.downloadUrl',
        $filter: 'file ne null',
      };

      if (limit) {
        params['$top'] = limit;
      }

      this.log('listFiles', { folderPath, limit, endpoint });

      const response = await this.makeAuthenticatedRequest(endpoint, { params });

      const files = (response.data as { value?: Array<{
        id: string;
        name: string;
        size?: number;
        lastModifiedDateTime: string;
        webUrl?: string;
        '@microsoft.graph.downloadUrl'?: string;
      }> }).value ?? [];

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

  override async downloadFile(fileId: string, destinationDir: string): Promise<string> {
    try {
      await this.ensureAuthenticated();

      const endpoint = this.isOneDrive
        ? `${this.baseUrl}/me/drive/items/${fileId}`
        : `${this.baseUrl}/sites/${this.siteId}/drive/items/${fileId}`;

      this.log('downloadFile', { fileId, destinationDir });

      const fileInfoResponse = await this.makeAuthenticatedRequest(endpoint);
      const fileInfo = fileInfoResponse.data as {
        name: string;
        size?: number;
        '@microsoft.graph.downloadUrl'?: string;
      };
      const downloadUrl = fileInfo['@microsoft.graph.downloadUrl'];

      if (!downloadUrl) {
        throw new Error('No download URL available for this file');
      }

      await fs.ensureDir(destinationDir);

      const response = await axios.get<NodeJS.ReadableStream>(downloadUrl, {
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

  override async watchForChanges(
    folderPath: string,
    callback: (files: FileInfo[]) => void,
  ): Promise<() => void> {
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
        logger.error({ err: error }, 'Error in watchForChanges polling');
      }
    }, 60000);

    return () => {
      clearInterval(pollInterval);
      this.log('watchForChanges', { status: 'stopped' });
    };
  }

  private async makeAuthenticatedRequest(
    url: string,
    config: AxiosRequestConfig = {},
  ): Promise<ReturnType<typeof axios>> {
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

  private async ensureAuthenticated(): Promise<void> {
    if (!this.isAuthenticated || Date.now() >= (this.tokenExpiry ?? 0) - 30000) {
      await this.authenticate();
    }
  }

  override validateConfig(): boolean {
    super.validateConfig();

    const { clientId, clientSecret, tenantId } =
      (this.config.credentials as SharePointCredentials) ?? {};

    if (!clientId || !clientSecret || !tenantId) {
      throw new Error('SharePoint requires clientId, clientSecret, and tenantId');
    }

    if (!this.isOneDrive && !this.config.siteUrl) {
      throw new Error('SharePoint requires siteUrl');
    }

    return true;
  }

  override async cleanup(): Promise<void> {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.isAuthenticated = false;
    this.siteId = null;
    this.log('cleanup', { status: 'completed' });
  }
}

export default SharePointConnector;
