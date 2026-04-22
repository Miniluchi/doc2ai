/**
 * Error thrown when OAuth credentials are expired or revoked.
 * Controllers should catch this to return 401 instead of 500.
 */
export class TokenExpiredError extends Error {
  constructor(message = 'Refresh token expired or revoked') {
    super(message);
    this.name = 'TokenExpiredError';
    this.code = 'TOKEN_EXPIRED';
  }
}

class DriveConnector {
  constructor(config) {
    this.config = config;
    this.isAuthenticated = false;
  }

  async authenticate() {
    throw new Error('authenticate() method must be implemented by subclass');
  }

  async testConnection() {
    throw new Error('testConnection() method must be implemented by subclass');
  }

  async listFiles(_path = '/') {
    throw new Error('listFiles() method must be implemented by subclass');
  }

  async downloadFile(_fileId, _destinationPath) {
    throw new Error('downloadFile() method must be implemented by subclass');
  }

  async watchForChanges(_path, _callback) {
    throw new Error('watchForChanges() method must be implemented by subclass');
  }

  async cleanup() {
    // No-op by default; subclasses can override
  }

  validateConfig() {
    if (!this.config) {
      throw new Error('Configuration is required');
    }

    if (!this.config.credentials) {
      throw new Error('Credentials are required');
    }

    return true;
  }

  normalizeFileInfo(rawFile) {
    return {
      id: rawFile.id,
      name: rawFile.name || 'Unknown',
      path: rawFile.path || rawFile.name,
      size: rawFile.size || 0,
      modifiedTime: rawFile.modifiedTime ? new Date(rawFile.modifiedTime) : new Date(),
      checksum: rawFile.checksum || rawFile.md5Checksum || null,
      mimeType: rawFile.mimeType || null,
      platform: this.constructor.name.replace('Connector', '').toLowerCase(),
    };
  }

  handleApiError(error, operation) {
    console.error(`${this.constructor.name} ${operation} failed:`, error);

    // Detect expired/revoked OAuth tokens
    const responseData = error.response?.data;
    if (responseData?.error === 'invalid_grant' || error.response?.status === 401) {
      throw new TokenExpiredError(
        `${operation} failed: ${responseData?.error_description || 'Refresh token expired or revoked'}`,
      );
    }

    const enrichedError = new Error(`${operation} failed: ${error.message}`);
    enrichedError.originalError = error;
    enrichedError.operation = operation;
    enrichedError.connector = this.constructor.name;

    throw enrichedError;
  }

  log(operation, details = {}) {
    console.log(`[${this.constructor.name}] ${operation}:`, details);
  }
}

export default DriveConnector;
