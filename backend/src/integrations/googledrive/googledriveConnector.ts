import DriveConnector from '../base/driveConnector.js';
import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import fs from 'fs-extra';
import path from 'node:path';
import logger from '../../config/logger.js';
import type { FileInfo, ConnectionTestResult, SourceConfig } from '../../types/domain.js';

interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

class GoogleDriveConnector extends DriveConnector {
  private accessToken: string | null;
  private tokenExpiry: number | null;
  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';

  constructor(config: SourceConfig) {
    super(config);
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  override async authenticate(): Promise<boolean> {
    try {
      this.validateConfig();

      const { clientId, clientSecret, refreshToken } = (this.config
        .credentials as unknown) as GoogleCredentials;

      const tokenUrl = 'https://oauth2.googleapis.com/token';

      this.log('authenticate', { clientId: clientId.substring(0, 12) + '...' });

      const response = await axios.post(
        tokenUrl,
        {
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        },
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      const data = response.data as { access_token: string; expires_in: number };
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + data.expires_in * 1000;
      this.isAuthenticated = true;

      this.log('authenticate', { success: true, tokenExpiry: new Date(this.tokenExpiry) });
      return true;
    } catch (error) {
      this.handleApiError(error, 'authenticate');
    }
  }

  override async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.authenticate();

      const response = await this.makeAuthenticatedRequest(
        'https://www.googleapis.com/drive/v3/about?fields=user,storageQuota',
      );

      const userInfo = response.data as {
        user?: { emailAddress?: string };
        storageQuota?: { usage?: string };
      };

      return {
        success: true,
        message: 'Connection successful',
        details: {
          platform: 'Google Drive',
          user: userInfo.user?.emailAddress,
          storageUsed: userInfo.storageQuota?.usage,
          authenticated: this.isAuthenticated,
        },
      };
    } catch (error) {
      const err = error as Error & { originalError?: { message?: string; response?: { data?: unknown; message?: string } } };
      return {
        success: false,
        message: err.message,
        details: { error: err.originalError?.response?.data ?? err.originalError?.message },
      };
    }
  }

  async listFolders(folderId = 'root'): Promise<
    Array<{
      id: string;
      name: string;
      path: string;
      modifiedTime: string;
      parents: unknown;
      type: string;
    }>
  > {
    try {
      await this.ensureAuthenticated();

      const params = {
        q: `'${folderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
        fields: 'files(id,name,modifiedTime,parents)',
        orderBy: 'name',
      };

      this.log('listFolders', { folderId });

      const response = await this.makeAuthenticatedRequest(`${this.baseUrl}/files`, { params });

      const folders = (response.data as { files?: Array<{
        id: string;
        name: string;
        modifiedTime: string;
        parents: unknown;
      }> }).files ?? [];

      return folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        path: `/${folder.name}`,
        modifiedTime: folder.modifiedTime,
        parents: folder.parents,
        type: 'folder',
      }));
    } catch (error) {
      this.handleApiError(error, 'listFolders');
    }
  }

  override async listFiles(folderId = 'root', limit: number | null = null): Promise<FileInfo[]> {
    try {
      await this.ensureAuthenticated();

      const params: Record<string, unknown> = {
        q: `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
        fields: 'files(id,name,size,modifiedTime,mimeType,webViewLink,md5Checksum,parents)',
        orderBy: 'modifiedTime desc',
      };

      if (limit) {
        params['pageSize'] = limit;
      }

      this.log('listFiles', { folderId, limit });

      const response = await this.makeAuthenticatedRequest(`${this.baseUrl}/files`, { params });

      const files = (response.data as { files?: Array<{
        id: string;
        name: string;
        size?: string;
        modifiedTime: string;
        mimeType: string;
        webViewLink?: string;
        md5Checksum?: string;
        parents?: string[];
      }> }).files ?? [];

      return files.map((file) =>
        this.normalizeFileInfo({
          id: file.id,
          name: file.name,
          path: `/${file.name}`,
          size: parseInt(file.size ?? '0') || 0,
          modifiedTime: file.modifiedTime,
          checksum: file.md5Checksum,
          mimeType: file.mimeType,
          webViewLink: file.webViewLink,
          parents: file.parents,
        }),
      );
    } catch (error) {
      this.handleApiError(error, 'listFiles');
    }
  }

  async searchFiles(query: string, limit = 50): Promise<FileInfo[]> {
    try {
      await this.ensureAuthenticated();

      const params = {
        q: `name contains '${query}' and trashed=false`,
        fields: 'files(id,name,size,modifiedTime,mimeType,webViewLink,md5Checksum)',
        pageSize: limit,
      };

      this.log('searchFiles', { query, limit });

      const response = await this.makeAuthenticatedRequest(`${this.baseUrl}/files`, { params });

      const files = (response.data as { files?: Record<string, unknown>[] }).files ?? [];
      return files.map((file) => this.normalizeFileInfo(file as Parameters<typeof this.normalizeFileInfo>[0]));
    } catch (error) {
      this.handleApiError(error, 'searchFiles');
    }
  }

  override async downloadFile(fileId: string, destinationDir: string): Promise<string> {
    try {
      await this.ensureAuthenticated();

      this.log('downloadFile', { fileId, destinationDir });

      const fileInfoResponse = await this.makeAuthenticatedRequest(
        `${this.baseUrl}/files/${fileId}?fields=name,size,mimeType`,
      );

      const fileInfo = fileInfoResponse.data as { name: string; size?: string; mimeType: string };

      await fs.ensureDir(destinationDir);

      let downloadUrl = `${this.baseUrl}/files/${fileId}?alt=media`;
      let fileName = fileInfo.name;

      // Handle Google Docs native formats (export required)
      if (fileInfo.mimeType.startsWith('application/vnd.google-apps.')) {
        const conversionMap: Record<string, { mimeType: string; extension: string }> = {
          'application/vnd.google-apps.document': {
            mimeType:
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            extension: '.docx',
          },
          'application/vnd.google-apps.spreadsheet': {
            mimeType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            extension: '.xlsx',
          },
          'application/vnd.google-apps.presentation': {
            mimeType:
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            extension: '.pptx',
          },
        };

        const conversion = conversionMap[fileInfo.mimeType];
        if (conversion) {
          downloadUrl = `${this.baseUrl}/files/${fileId}/export?mimeType=${encodeURIComponent(conversion.mimeType)}`;
          fileName = fileName.replace(/\.[^/.]+$/, '') + conversion.extension;
        } else {
          throw new Error(`Unsupported Google Apps format: ${fileInfo.mimeType}`);
        }
      }

      const response = await this.makeAuthenticatedRequest(downloadUrl, {
        responseType: 'stream',
      });

      const filePath = path.join(destinationDir, fileName);
      const writer = fs.createWriteStream(filePath);

      (response.data as NodeJS.ReadableStream).pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          this.log('downloadFile', { completed: filePath, originalSize: fileInfo.size });
          resolve(filePath);
        });
        writer.on('error', reject);
      });
    } catch (error) {
      this.handleApiError(error, 'downloadFile');
    }
  }

  override async watchForChanges(
    folderId: string,
    callback: (files: FileInfo[]) => void,
  ): Promise<() => void> {
    this.log('watchForChanges', {
      folderId,
      note: 'Using polling approach - push notifications require webhook setup',
    });

    let pageToken: string | null = null;

    const pollChanges = async (): Promise<void> => {
      try {
        const params: Record<string, unknown> = {
          fields:
            'nextPageToken,newStartPageToken,changes(fileId,file(id,name,parents,modifiedTime,trashed))',
          includeRemoved: false,
        };

        if (pageToken) {
          params['pageToken'] = pageToken;
        }

        const response = await this.makeAuthenticatedRequest(`${this.baseUrl}/changes`, { params });

        const data = response.data as {
          changes?: Array<{
            file?: {
              id: string;
              name: string;
              parents?: string[];
              modifiedTime: string;
              trashed?: boolean;
            };
          }>;
          nextPageToken?: string;
          newStartPageToken?: string;
        };

        const changes = data.changes ?? [];

        const relevantChanges = changes.filter((change) => {
          const file = change.file;
          return file && file.parents && file.parents.includes(folderId) && !file.trashed;
        });

        if (relevantChanges.length > 0) {
          this.log('watchForChanges', { changes: relevantChanges.length });
          const changedFiles = relevantChanges.map((change) =>
            this.normalizeFileInfo(change.file as Parameters<typeof this.normalizeFileInfo>[0]),
          );
          callback(changedFiles);
        }

        pageToken = data.nextPageToken ?? data.newStartPageToken ?? null;
      } catch (error) {
        logger.error({ err: error }, 'Error in watchForChanges polling');
      }
    };

    await pollChanges();

    const pollInterval = setInterval(pollChanges, 60000);

    return () => {
      clearInterval(pollInterval);
      this.log('watchForChanges', { status: 'stopped' });
    };
  }

  private async makeAuthenticatedRequest(
    url: string,
    config: AxiosRequestConfig = {},
  ): Promise<AxiosResponse> {
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

    const { clientId, clientSecret, refreshToken } = ((this.config.credentials as unknown) as GoogleCredentials) ?? {};

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Google Drive requires clientId, clientSecret, and refreshToken');
    }

    return true;
  }

  override async cleanup(): Promise<void> {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.isAuthenticated = false;
    this.log('cleanup', { status: 'completed' });
  }
}

export default GoogleDriveConnector;
