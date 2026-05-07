import { describe, it, expect } from 'bun:test';
import {
  parseSourceConfig,
  validateDestinationPath,
  getValidatedDestination,
  enrichSourceWithConfig,
} from './configParser.js';
import type { Source, SourceConfig } from '../types/domain.js';

describe('parseSourceConfig', () => {
  it('returns the object when config is already an object', () => {
    const cfg: SourceConfig = { sourcePath: '/docs', destination: 'out' };
    const result = parseSourceConfig({ config: cfg });
    expect(result).toEqual(cfg);
  });

  it('parses a JSON string config', () => {
    const cfg = { sourcePath: '/docs', destination: 'out' };
    const result = parseSourceConfig({ config: JSON.stringify(cfg) });
    expect(result).toEqual(cfg);
  });

  it('throws when config is null', () => {
    expect(() => parseSourceConfig({ config: null })).toThrow('Source configuration is missing');
  });

  it('throws when config is undefined', () => {
    expect(() => parseSourceConfig({ config: undefined })).toThrow(
      'Source configuration is missing',
    );
  });

  it('throws on invalid JSON string', () => {
    expect(() => parseSourceConfig({ config: '{not valid json' })).toThrow(
      /Invalid source configuration JSON/,
    );
  });

  it('throws when config is an unsupported primitive', () => {
    expect(() => parseSourceConfig({ config: 42 as unknown })).toThrow(
      'Source configuration must be an object or valid JSON string',
    );
  });
});

describe('validateDestinationPath', () => {
  it('trims and returns a valid relative path', () => {
    expect(validateDestinationPath('  my/folder  ')).toBe('my/folder');
  });

  it('rejects non-string values', () => {
    expect(() => validateDestinationPath(123 as unknown)).toThrow(
      'Destination must be a non-empty string',
    );
    expect(() => validateDestinationPath(null)).toThrow('Destination must be a non-empty string');
  });

  it('rejects empty after trim', () => {
    expect(() => validateDestinationPath('   ')).toThrow('Destination cannot be empty');
  });

  it('rejects path traversal attempts', () => {
    expect(() => validateDestinationPath('../etc/passwd')).toThrow("cannot contain '..'");
    expect(() => validateDestinationPath('foo/../bar')).toThrow("cannot contain '..'");
  });

  it('rejects absolute paths', () => {
    expect(() => validateDestinationPath('/abs/path')).toThrow("cannot start with '/'");
    expect(() => validateDestinationPath('\\abs\\path')).toThrow("cannot start with '/'");
  });

  it('rejects dangerous filename characters', () => {
    for (const c of ['<', '>', ':', '"', '|', '?', '*']) {
      expect(() => validateDestinationPath(`bad${c}name`)).toThrow(
        `Destination cannot contain '${c}' character`,
      );
    }
  });

  it('rejects paths longer than 200 characters', () => {
    expect(() => validateDestinationPath('a'.repeat(201))).toThrow(/too long/);
  });

  it('accepts a 200 character path', () => {
    const value = 'a'.repeat(200);
    expect(validateDestinationPath(value)).toBe(value);
  });
});

describe('getValidatedDestination', () => {
  it('returns the validated destination from the config', () => {
    expect(getValidatedDestination({ destination: 'docs/my' })).toBe('docs/my');
  });

  it('falls back when destination is missing', () => {
    expect(getValidatedDestination({} as SourceConfig, 'fallback')).toBe('fallback');
  });

  it('uses default fallback when both are missing', () => {
    expect(getValidatedDestination({} as SourceConfig)).toBe('default');
  });

  it('validates the fallback as well', () => {
    expect(() => getValidatedDestination({} as SourceConfig, '../bad')).toThrow();
  });
});

describe('enrichSourceWithConfig', () => {
  const baseSource: Source = {
    id: 'src-1',
    name: 'Test',
    platform: 'googledrive',
    config: '',
    status: 'active',
    lastSync: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('parses string config and validates destination', () => {
    const source = { ...baseSource, config: JSON.stringify({ destination: 'out/my' }) };
    const result = enrichSourceWithConfig(source);
    expect(result.config.destination).toBe('out/my');
    expect(result.id).toBe('src-1');
  });

  it('rethrows when destination is invalid', () => {
    const source = { ...baseSource, config: JSON.stringify({ destination: '/abs' }) };
    expect(() => enrichSourceWithConfig(source)).toThrow();
  });
});
