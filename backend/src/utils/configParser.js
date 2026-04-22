export function parseSourceConfig(source) {
  if (!source || !source.config) {
    throw new Error('Source configuration is missing');
  }

  if (typeof source.config === 'object') {
    return source.config;
  }

  if (typeof source.config === 'string') {
    try {
      return JSON.parse(source.config);
    } catch (error) {
      console.error('Failed to parse source config JSON:', error);
      throw new Error(`Invalid source configuration JSON: ${error.message}`);
    }
  }

  throw new Error('Source configuration must be an object or valid JSON string');
}

export function validateDestinationPath(destination) {
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

export function getValidatedDestination(config, fallback = 'default') {
  const destination = config.destination || fallback;
  return validateDestinationPath(destination);
}

export function enrichSourceWithConfig(source) {
  try {
    const parsedConfig = parseSourceConfig(source);

    // Valider la destination si elle existe
    if (parsedConfig.destination) {
      parsedConfig.destination = validateDestinationPath(parsedConfig.destination);
    }

    return {
      ...source,
      config: parsedConfig,
    };
  } catch (error) {
    console.error(`Failed to enrich source ${source.id || 'unknown'}:`, error);
    throw error;
  }
}
