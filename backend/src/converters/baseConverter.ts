import fs from 'fs-extra';
import path from 'node:path';
import { generateFileChecksum } from '../utils/encryption.js';
import logger from '../config/logger.js';
import type { ConversionResult } from '../types/domain.js';

export interface FileInfo {
  size: number;
  extension: string;
  modified: Date;
  created: Date;
  isSupported: boolean;
}

abstract class BaseConverter {
  protected name: string;
  protected supportedExtensions: string[];

  constructor() {
    this.name = 'Base Converter';
    this.supportedExtensions = [];
  }

  abstract convert(inputPath: string, outputPath: string): Promise<ConversionResult>;

  async validateInputFile(filePath: string): Promise<boolean> {
    try {
      const exists = await fs.pathExists(filePath);
      if (!exists) {
        throw new Error(`Input file does not exist: ${filePath}`);
      }

      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }

      if (stats.size === 0) {
        throw new Error(`Input file is empty: ${filePath}`);
      }

      return true;
    } catch (error) {
      logger.error({ err: error, filePath }, 'File validation failed');
      throw error;
    }
  }

  async prepareOutputFile(outputPath: string): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(outputPath));

      if (await fs.pathExists(outputPath)) {
        await fs.remove(outputPath);
      }
    } catch (error) {
      logger.error({ err: error, outputPath }, 'Failed to prepare output file');
      throw error;
    }
  }

  cleanMarkdown(markdown: string): string {
    if (!markdown) return '';

    let cleaned = markdown.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+$/gm, '');
    cleaned = cleaned.trim();

    if (cleaned && !cleaned.endsWith('\n')) {
      cleaned += '\n';
    }

    return cleaned;
  }

  addMetadata(markdown: string, metadata: Record<string, unknown> = {}): string {
    const defaultMetadata: Record<string, unknown> = {
      generated_by: 'Doc2AI',
      generated_at: new Date().toISOString(),
      ...metadata,
    };

    const metadataLines = [
      '---',
      ...Object.entries(defaultMetadata).map(([key, value]) => `${key}: ${String(value)}`),
      '---',
      '',
      markdown,
    ];

    return metadataLines.join('\n');
  }

  async saveMarkdown(markdown: string, outputPath: string): Promise<string> {
    try {
      await this.prepareOutputFile(outputPath);

      const cleanedMarkdown = this.cleanMarkdown(markdown);
      await fs.writeFile(outputPath, cleanedMarkdown, 'utf8');

      const checksum = await generateFileChecksum(outputPath);

      logger.info(
        { outputPath, chars: cleanedMarkdown.length, checksum: checksum.substring(0, 8) },
        'Markdown saved',
      );

      return checksum;
    } catch (error) {
      logger.error({ err: error, outputPath }, 'Failed to save markdown');
      throw error;
    }
  }

  log(operation: string, details: Record<string, unknown> = {}): void {
    logger.info({ converter: this.name, ...details }, operation);
  }

  handleError(error: unknown, operation: string, filePath: string): ConversionResult {
    const err = error instanceof Error ? error : new Error(String(error));
    const errorMessage = `${operation} failed for ${filePath}: ${err.message}`;
    logger.error({ err, converter: this.name, operation, filePath }, errorMessage);

    return {
      success: false,
      error: errorMessage,
      details: {
        operation,
        filePath,
        converterName: this.name,
        originalError: err.message,
        stack: err.stack,
      },
    };
  }

  async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      const stats = await fs.stat(filePath);
      const extension = path.extname(filePath).toLowerCase();

      return {
        size: stats.size,
        extension,
        modified: stats.mtime,
        created: stats.birthtime,
        isSupported: this.supportedExtensions.includes(extension),
      };
    } catch (error) {
      throw new Error(`Failed to get file info for ${filePath}: ${(error as Error).message}`);
    }
  }

  updateProgress(progress: number, message: string): void {
    logger.info({ converter: this.name, progress }, message);
  }
}

export default BaseConverter;
