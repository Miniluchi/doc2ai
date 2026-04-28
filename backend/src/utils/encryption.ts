import crypto from 'node:crypto';
import fs from 'node:fs';
import config from '../config/env.js';
import logger from '../config/logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ENCODING = 'base64' as const;

export function encryptCredentials(data: unknown): string {
  try {
    const text = typeof data === 'string' ? data : JSON.stringify(data);

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, config.encryptionKey, iv);

    let encrypted = cipher.update(text, 'utf8', ENCODING);
    encrypted += cipher.final(ENCODING);

    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, Buffer.from(encrypted, ENCODING)]).toString(ENCODING);
  } catch (error) {
    logger.error({ err: error }, 'Encryption failed');
    throw new Error('Failed to encrypt credentials');
  }
}

export function decryptCredentials(encryptedData: string): unknown {
  try {
    if (!encryptedData) {
      throw new Error('No encrypted data provided');
    }

    const buffer = Buffer.from(encryptedData, ENCODING);
    const iv = buffer.subarray(0, IV_LENGTH);
    const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + TAG_LENGTH).toString(ENCODING);

    const decipher = crypto.createDecipheriv(ALGORITHM, config.encryptionKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, ENCODING, 'utf8');
    decrypted += decipher.final('utf8');

    try {
      return JSON.parse(decrypted) as unknown;
    } catch {
      return decrypted;
    }
  } catch (error) {
    logger.error({ err: error }, 'Decryption failed');
    throw new Error('Failed to decrypt credentials');
  }
}

export function generateFileChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => {
      hash.update(data);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (error) => {
      reject(error);
    });
  });
}
