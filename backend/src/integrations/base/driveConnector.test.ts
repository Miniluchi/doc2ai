import { describe, it, expect } from 'bun:test';
import DriveConnector, { TokenExpiredError } from './driveConnector.js';
import type { ConnectionTestResult, FileInfo, SourceConfig } from '../../types/domain.js';

class TestConnector extends DriveConnector {
  override async authenticate(): Promise<boolean> {
    return true;
  }
  override async testConnection(): Promise<ConnectionTestResult> {
    return { success: true, message: 'ok' };
  }
  override async listFiles(): Promise<FileInfo[]> {
    return [];
  }
  override async downloadFile(): Promise<string> {
    return '';
  }
  override async watchForChanges(): Promise<() => void> {
    return () => undefined;
  }

  // Expose protected helpers for tests
  publicNormalize(input: Parameters<DriveConnector['normalizeFileInfo']>[0]) {
    return this.normalizeFileInfo(input);
  }
  publicHandleApi(error: unknown, op: string): never {
    return this.handleApiError(error, op);
  }
}

const cfg: SourceConfig = { credentials: { token: 'abc' } };

describe('DriveConnector.validateConfig', () => {
  it('throws when configuration is missing entirely', () => {
    const c = new TestConnector(undefined as unknown as SourceConfig);
    expect(() => c.validateConfig()).toThrow('Configuration is required');
  });

  it('throws when credentials are missing', () => {
    const c = new TestConnector({} as SourceConfig);
    expect(() => c.validateConfig()).toThrow('Credentials are required');
  });

  it('passes with valid credentials', () => {
    const c = new TestConnector(cfg);
    expect(c.validateConfig()).toBe(true);
  });
});

describe('DriveConnector.normalizeFileInfo', () => {
  it('fills defaults for missing fields', () => {
    const c = new TestConnector(cfg);
    const result = c.publicNormalize({ id: 'f1' });
    expect(result.id).toBe('f1');
    expect(result.name).toBe('Unknown');
    expect(result.size).toBe(0);
    expect(result.checksum).toBeNull();
    expect(result.mimeType).toBeNull();
    expect(result.platform).toBe('test');
    expect(result.modifiedTime).toBeInstanceOf(Date);
  });

  it('parses string size and uses md5Checksum fallback', () => {
    const c = new TestConnector(cfg);
    const result = c.publicNormalize({
      id: 'f2',
      name: 'note.txt',
      size: '1024',
      md5Checksum: 'abc',
      modifiedTime: '2024-01-01T00:00:00Z',
    });
    expect(result.size).toBe(1024);
    expect(result.checksum).toBe('abc');
    expect(result.modifiedTime.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(result.path).toBe('note.txt');
  });

  it('uses provided checksum over md5Checksum', () => {
    const c = new TestConnector(cfg);
    const result = c.publicNormalize({ id: 'f3', checksum: 'primary', md5Checksum: 'secondary' });
    expect(result.checksum).toBe('primary');
  });
});

describe('DriveConnector.handleApiError', () => {
  it('throws TokenExpiredError for invalid_grant responses', () => {
    const c = new TestConnector(cfg);
    const err = {
      message: 'oops',
      response: { status: 400, data: { error: 'invalid_grant', error_description: 'expired' } },
    } as unknown as Error;
    expect(() => c.publicHandleApi(err, 'authenticate')).toThrow(TokenExpiredError);
  });

  it('throws TokenExpiredError for 401 responses', () => {
    const c = new TestConnector(cfg);
    const err = {
      message: 'unauthorized',
      response: { status: 401, data: {} },
    } as unknown as Error;
    expect(() => c.publicHandleApi(err, 'listFiles')).toThrow(TokenExpiredError);
  });

  it('throws an enriched generic error otherwise', () => {
    const c = new TestConnector(cfg);
    try {
      c.publicHandleApi(new Error('boom'), 'downloadFile');
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as Error & { operation: string; connector: string };
      expect(err.message).toContain('downloadFile failed: boom');
      expect(err.operation).toBe('downloadFile');
      expect(err.connector).toBe('TestConnector');
      expect(err).not.toBeInstanceOf(TokenExpiredError);
    }
  });
});

describe('TokenExpiredError', () => {
  it('has the expected name and code', () => {
    const err = new TokenExpiredError();
    expect(err.name).toBe('TokenExpiredError');
    expect(err.code).toBe('TOKEN_EXPIRED');
  });
});
