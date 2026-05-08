import { describe, it, expect } from 'bun:test';
import { DriveConnectorFactory } from './driveConnectorFactory.js';
import GoogleDriveConnector from '../googledrive/googledriveConnector.js';
import SharePointConnector from '../sharepoint/sharepointConnector.js';
import type { SourceConfig } from '../../types/domain.js';

const baseConfig: SourceConfig = {
  credentials: { clientId: 'a', clientSecret: 'b', refreshToken: 'c' },
  sourcePath: '/',
};

describe('DriveConnectorFactory.createConnector', () => {
  it('builds a SharePoint connector for the "sharepoint" platform', () => {
    expect(DriveConnectorFactory.createConnector('sharepoint', baseConfig)).toBeInstanceOf(
      SharePointConnector,
    );
  });

  it('builds a Google Drive connector for "googledrive"', () => {
    expect(DriveConnectorFactory.createConnector('googledrive', baseConfig)).toBeInstanceOf(
      GoogleDriveConnector,
    );
  });

  it('treats "google-drive" as an alias for googledrive', () => {
    expect(DriveConnectorFactory.createConnector('google-drive', baseConfig)).toBeInstanceOf(
      GoogleDriveConnector,
    );
  });

  it('builds a SharePoint connector with isOneDrive flag for "onedrive"', () => {
    const connector = DriveConnectorFactory.createConnector('onedrive', baseConfig);
    expect(connector).toBeInstanceOf(SharePointConnector);
  });

  it('is case-insensitive', () => {
    expect(DriveConnectorFactory.createConnector('SharePoint', baseConfig)).toBeInstanceOf(
      SharePointConnector,
    );
  });

  it('throws when platform is missing', () => {
    expect(() => DriveConnectorFactory.createConnector('', baseConfig)).toThrow(
      'Platform is required',
    );
  });

  it('throws when config is missing', () => {
    expect(() =>
      DriveConnectorFactory.createConnector('googledrive', null as unknown as SourceConfig),
    ).toThrow('Config is required');
  });

  it('throws on unknown platform', () => {
    expect(() => DriveConnectorFactory.createConnector('dropbox', baseConfig)).toThrow(
      /Unsupported platform: dropbox/,
    );
  });
});

describe('DriveConnectorFactory.getSupportedPlatforms / isPlatformSupported', () => {
  it('returns the canonical platform list', () => {
    expect(DriveConnectorFactory.getSupportedPlatforms()).toEqual([
      'sharepoint',
      'googledrive',
      'onedrive',
    ]);
  });

  it('checks support case-insensitively', () => {
    expect(DriveConnectorFactory.isPlatformSupported('SharePoint')).toBe(true);
    expect(DriveConnectorFactory.isPlatformSupported('dropbox')).toBe(false);
  });
});

describe('DriveConnectorFactory.getConfigSchema', () => {
  it('returns the SharePoint schema with credentials and siteUrl required', () => {
    const schema = DriveConnectorFactory.getConfigSchema('sharepoint') as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(schema['credentials']?.['clientId']?.['required']).toBe(true);
    expect(schema['siteUrl']?.['required']).toBe(true);
  });

  it('returns the Google Drive schema with refreshToken required', () => {
    const schema = DriveConnectorFactory.getConfigSchema('googledrive') as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(schema['credentials']?.['refreshToken']?.['required']).toBe(true);
  });

  it('throws on unknown platform', () => {
    expect(() => DriveConnectorFactory.getConfigSchema('dropbox')).toThrow(/Unknown platform/);
  });
});

describe('DriveConnectorFactory.validateConfig', () => {
  it('reports missing required fields', () => {
    const result = DriveConnectorFactory.validateConfig('googledrive', {
      credentials: { clientId: 'a' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('credentials.clientSecret'))).toBe(true);
    expect(result.errors.some((e) => e.includes('credentials.refreshToken'))).toBe(true);
  });

  it('approves a fully valid config', () => {
    const result = DriveConnectorFactory.validateConfig('googledrive', {
      credentials: { clientId: 'a', clientSecret: 'b', refreshToken: 'c' },
      sourcePath: 'root',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns invalid for an unknown platform', () => {
    const result = DriveConnectorFactory.validateConfig('dropbox', {});
    expect(result.valid).toBe(false);
  });
});
