import logger from '../config/logger.js';
import type { Source, SourceConfig, ParsedSource } from '../types/domain.js';

export function parseSourceConfig(source: { config: unknown }): SourceConfig {
  if (!source || source.config === null || source.config === undefined) {
    throw new Error('Source configuration is missing');
  }

  if (typeof source.config === 'object') {
    return source.config as SourceConfig;
  }

  if (typeof source.config === 'string') {
    try {
      return JSON.parse(source.config) as SourceConfig;
    } catch (error) {
      logger.error({ err: error }, 'Failed to parse source config JSON');
      throw new Error(`Invalid source configuration JSON: ${(error as Error).message}`);
    }
  }

  throw new Error('Source configuration must be an object or valid JSON string');
}

export function validateDestinationPath(destination: unknown): string {
  if (!destination || typeof destination !== 'string') {
    throw new Error('Destination must be a non-empty string');
  }

  const trimmed = destination.trim();

  if (trimmed.length === 0) {
    throw new Error('Destination cannot be empty');
  }

  if (trimmed.includes('..')) {
    throw new Error("Destination cannot contain '..' (path traversal prevention)");
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    throw new Error("Destination cannot start with '/' or '\\' (must be relative)");
  }

  const dangerousChars = ['<', '>', ':', '"', '|', '?', '*'];
  for (const char of dangerousChars) {
    if (trimmed.includes(char)) {
      throw new Error(`Destination cannot contain '${char}' character`);
    }
  }

  if (trimmed.length > 200) {
    throw new Error('Destination path too long (max 200 characters)');
  }

  return trimmed;
}

export function getValidatedDestination(
  cfg: SourceConfig,
  fallback: string = 'default',
): string {
  const destination = cfg.destination ?? fallback;
  return validateDestinationPath(destination);
}

export function enrichSourceWithConfig(source: Source): ParsedSource {
  try {
    const parsedConfig = parseSourceConfig(source);

    if (parsedConfig.destination) {
      parsedConfig.destination = validateDestinationPath(parsedConfig.destination);
    }

    return { ...source, config: parsedConfig };
  } catch (error) {
    logger.error({ err: error, sourceId: source.id }, 'Failed to enrich source');
    throw error;
  }
}
