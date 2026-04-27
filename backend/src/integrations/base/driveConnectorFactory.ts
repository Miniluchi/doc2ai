import SharePointConnector from '../sharepoint/sharepointConnector.js';
import GoogleDriveConnector from '../googledrive/googledriveConnector.js';
import type DriveConnector from './driveConnector.js';
import type { SourceConfig } from '../../types/domain.js';

interface SharePointConfig extends SourceConfig {
  isOneDrive?: boolean;
}

class DriveConnectorFactory {
  static createConnector(platform: string, config: SourceConfig): DriveConnector {
    if (!platform) {
      throw new Error('Platform is required');
    }

    if (!config) {
      throw new Error('Config is required');
    }

    const normalizedPlatform = platform.toLowerCase();

    switch (normalizedPlatform) {
      case 'sharepoint':
        return new SharePointConnector(config);

      case 'googledrive':
      case 'google-drive':
        return new GoogleDriveConnector(config);

      case 'onedrive': {
        // OneDrive uses the same Microsoft Graph API as SharePoint
        const onedriveConfig: SharePointConfig = { ...config, isOneDrive: true };
        return new SharePointConnector(onedriveConfig);
      }

      default:
        throw new Error(
          `Unsupported platform: ${platform}. Supported platforms: sharepoint, googledrive, onedrive`,
        );
    }
  }

  static getSupportedPlatforms(): string[] {
    return ['sharepoint', 'googledrive', 'onedrive'];
  }

  static isPlatformSupported(platform: string): boolean {
    return this.getSupportedPlatforms().includes(platform.toLowerCase());
  }

  static getConfigSchema(platform: string): Record<string, unknown> {
    const normalizedPlatform = platform.toLowerCase();

    switch (normalizedPlatform) {
      case 'sharepoint':
      case 'onedrive':
        return {
          credentials: {
            clientId: { required: true, type: 'string', description: 'Microsoft App Client ID' },
            clientSecret: {
              required: true,
              type: 'string',
              description: 'Microsoft App Client Secret',
            },
            tenantId: { required: true, type: 'string', description: 'Microsoft Tenant ID' },
          },
          sourcePath: {
            required: false,
            type: 'string',
            default: '/',
            description: 'Path to monitor',
          },
          siteUrl: { required: true, type: 'string', description: 'SharePoint site URL' },
          destinations: {
            required: false,
            type: 'array',
            default: [],
            description: 'Local destination paths',
          },
          filters: {
            extensions: {
              required: false,
              type: 'array',
              default: ['.docx', '.pdf'],
              description: 'File extensions to process',
            },
            excludePatterns: {
              required: false,
              type: 'array',
              default: [],
              description: 'Regex patterns to exclude',
            },
          },
        };

      case 'googledrive':
        return {
          credentials: {
            clientId: { required: true, type: 'string', description: 'Google Client ID' },
            clientSecret: { required: true, type: 'string', description: 'Google Client Secret' },
            refreshToken: { required: true, type: 'string', description: 'Google Refresh Token' },
          },
          sourcePath: {
            required: false,
            type: 'string',
            default: 'root',
            description: 'Folder ID to monitor',
          },
          destinations: {
            required: false,
            type: 'array',
            default: [],
            description: 'Local destination paths',
          },
          filters: {
            extensions: {
              required: false,
              type: 'array',
              default: ['.docx', '.pdf'],
              description: 'File extensions to process',
            },
            excludePatterns: {
              required: false,
              type: 'array',
              default: [],
              description: 'Regex patterns to exclude',
            },
          },
        };

      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  static validateConfig(
    platform: string,
    config: Record<string, unknown>,
  ): { valid: boolean; errors: string[] } {
    try {
      const schema = this.getConfigSchema(platform);
      const errors: string[] = [];

      function validateObject(
        obj: Record<string, unknown>,
        schemaObj: Record<string, unknown>,
        pathPrefix = '',
      ): void {
        for (const [key, schemaValue] of Object.entries(schemaObj)) {
          const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key;
          const sv = schemaValue as Record<string, unknown>;

          if (typeof sv === 'object' && sv['required'] !== undefined) {
            if (sv['required'] && !obj[key]) {
              errors.push(`Missing required field: ${currentPath}`);
            } else if (obj[key] && sv['type']) {
              const actualType = Array.isArray(obj[key]) ? 'array' : typeof obj[key];
              if (actualType !== sv['type']) {
                errors.push(
                  `Invalid type for ${currentPath}: expected ${String(sv['type'])}, got ${actualType}`,
                );
              }
            }
          } else if (typeof sv === 'object' && obj[key]) {
            validateObject(
              obj[key] as Record<string, unknown>,
              sv as Record<string, unknown>,
              currentPath,
            );
          }
        }
      }

      validateObject(config, schema as Record<string, unknown>);

      return { valid: errors.length === 0, errors };
    } catch (error) {
      return { valid: false, errors: [`Validation error: ${(error as Error).message}`] };
    }
  }
}

export { DriveConnectorFactory };
