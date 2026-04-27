import type { AxiosError } from 'axios';
import logger from '../../config/logger.js';
import type { FileInfo, ConnectionTestResult, SourceConfig } from '../../types/domain.js';

/**
 * Error thrown when OAuth credentials are expired or revoked.
 * Controllers catch this to return 401 instead of 500.
 */
export class TokenExpiredError extends Error {
  readonly code = 'TOKEN_EXPIRED';

  constructor(message = 'Refresh token expired or revoked') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export interface NormalizedFileInput {
  id: string;
  name?: string;
  path?: string;
  size?: number | string;
  modifiedTime?: string | Date;
  checksum?: string;
  md5Checksum?: string;
  mimeType?: string;
  [key: string]: unknown;
}

abstract class DriveConnector {
  protected config: SourceConfig;
  isAuthenticated: boolean;

  constructor(config: SourceConfig) {
    this.config = config;
    this.isAuthenticated = false;
  }

  abstract authenticate(): Promise<boolean>;
  abstract testConnection(): Promise<ConnectionTestResult>;
  abstract listFiles(path?: string, limit?: number | null): Promise<FileInfo[]>;
  abstract downloadFile(fileId: string, destinationPath: string): Promise<string>;
  abstract watchForChanges(
    path: string,
    callback: (files: FileInfo[]) => void,
  ): Promise<() => void>;

  async cleanup(): Promise<void> {
    // No-op by default; subclasses override
  }

  validateConfig(): boolean {
    if (!this.config) {
      throw new Error('Configuration is required');
    }

    if (!this.config.credentials) {
      throw new Error('Credentials are required');
    }

    return true;
  }

  normalizeFileInfo(rawFile: NormalizedFileInput): FileInfo {
    return {
      id: rawFile.id,
      name: rawFile.name ?? 'Unknown',
      path: rawFile.path ?? rawFile.name ?? rawFile.id,
      size: typeof rawFile.size === 'string' ? parseInt(rawFile.size) || 0 : (rawFile.size ?? 0),
      modifiedTime: rawFile.modifiedTime ? new Date(rawFile.modifiedTime as string) : new Date(),
      checksum: rawFile.checksum ?? rawFile.md5Checksum ?? null,
      mimeType: rawFile.mimeType ?? null,
      platform: this.constructor.name.replace('Connector', '').toLowerCase(),
    };
  }

  handleApiError(error: unknown, operation: string): never {
    logger.error(
      { err: error, connector: this.constructor.name, operation },
      `${operation} failed`,
    );

    const axiosError = error as AxiosError<{ error?: string; error_description?: string }>;
    const responseData = axiosError.response?.data;

    if (responseData?.error === 'invalid_grant' || axiosError.response?.status === 401) {
      throw new TokenExpiredError(
        `${operation} failed: ${responseData?.error_description ?? 'Refresh token expired or revoked'}`,
      );
    }

    const enrichedError = new Error(
      `${operation} failed: ${(error as Error).message}`,
    ) as Error & { originalError: unknown; operation: string; connector: string };

    enrichedError.originalError = error;
    enrichedError.operation = operation;
    enrichedError.connector = this.constructor.name;

    throw enrichedError;
  }

  log(operation: string, details: Record<string, unknown> = {}): void {
    logger.info({ connector: this.constructor.name, ...details }, operation);
  }
}

export default DriveConnector;
export type { FileInfo, ConnectionTestResult };
