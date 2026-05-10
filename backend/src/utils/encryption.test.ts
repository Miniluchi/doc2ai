import { describe, it, expect } from 'bun:test';
import { encryptCredentials, decryptCredentials, generateFileChecksum } from './encryption.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('encryptCredentials / decryptCredentials', () => {
  it('round-trips a string value', () => {
    const cipher = encryptCredentials('hello world');
    expect(typeof cipher).toBe('string');
    expect(cipher).not.toContain('hello');
    expect(decryptCredentials(cipher)).toBe('hello world');
  });

  it('round-trips an object value (returns parsed JSON)', () => {
    const payload = { user: 'alice', token: 'secret-token-123', count: 42 };
    const cipher = encryptCredentials(payload);
    expect(decryptCredentials(cipher)).toEqual(payload);
  });

  it('produces a different ciphertext on each call (random IV)', () => {
    const a = encryptCredentials('same plaintext');
    const b = encryptCredentials('same plaintext');
    expect(a).not.toBe(b);
  });

  it('throws a wrapped error when decryption input is empty', () => {
    expect(() => decryptCredentials('')).toThrow('Failed to decrypt credentials');
  });

  it('throws a wrapped error when ciphertext is tampered with', () => {
    const cipher = encryptCredentials('payload');
    const tampered = cipher.slice(0, -4) + 'AAAA';
    expect(() => decryptCredentials(tampered)).toThrow('Failed to decrypt credentials');
  });

  it('returns the raw string when ciphertext does not encode JSON', () => {
    const cipher = encryptCredentials('not-json-just-a-string');
    expect(decryptCredentials(cipher)).toBe('not-json-just-a-string');
  });
});

describe('generateFileChecksum', () => {
  it('produces a stable md5 hex digest for the same content', async () => {
    const tmpFile = path.join(os.tmpdir(), `checksum-${Date.now()}-${Math.random()}.txt`);
    fs.writeFileSync(tmpFile, 'doc2ai checksum test content');

    try {
      const checksum = await generateFileChecksum(tmpFile);
      expect(checksum).toMatch(/^[a-f0-9]{32}$/);
      const second = await generateFileChecksum(tmpFile);
      expect(second).toBe(checksum);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('rejects when the file does not exist', async () => {
    await expect(
      generateFileChecksum(path.join(os.tmpdir(), `does-not-exist-${Date.now()}.bin`)),
    ).rejects.toThrow();
  });
});
