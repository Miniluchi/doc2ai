/**
 * Utilitaires pour le parsing et la validation des configurations
 */

/**
 * Parse de manière sécurisée la configuration JSON d'une source
 * @param {Object|string} source - La source avec sa configuration
 * @returns {Object} - La configuration parsée
 * @throws {Error} - Si le parsing échoue
 */
export function parseSourceConfig(source) {
  if (!source || !source.config) {
    throw new Error("Source configuration is missing");
  }

  // Si c'est déjà un objet, le retourner
  if (typeof source.config === "object") {
    return source.config;
  }

  // Si c'est une string, essayer de la parser
  if (typeof source.config === "string") {
    try {
      return JSON.parse(source.config);
    } catch (error) {
      console.error("Failed to parse source config JSON:", error);
      throw new Error(`Invalid source configuration JSON: ${error.message}`);
    }
  }

  throw new Error("Source configuration must be an object or valid JSON string");
}

/**
 * Valide le chemin de destination pour éviter les attaques de traversal
 * @param {string} destination - Le chemin de destination à valider
 * @throws {Error} - Si le chemin n'est pas valide
 */
export function validateDestinationPath(destination) {
  if (!destination || typeof destination !== "string") {
    throw new Error("Destination must be a non-empty string");
  }

  const trimmed = destination.trim();

  if (trimmed.length === 0) {
    throw new Error("Destination cannot be empty");
  }

  // Vérifier les caractères dangereux
  if (trimmed.includes("..")) {
    throw new Error("Destination cannot contain '..' (path traversal prevention)");
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("\\")) {
    throw new Error("Destination cannot start with '/' or '\\' (must be relative)");
  }

  // Vérifier les caractères interdits
  const dangerousChars = ["<", ">", ":", '"', "|", "?", "*"];
  for (const char of dangerousChars) {
    if (trimmed.includes(char)) {
      throw new Error(`Destination cannot contain '${char}' character`);
    }
  }

  // Vérifier la longueur maximum
  if (trimmed.length > 200) {
    throw new Error("Destination path too long (max 200 characters)");
  }

  return trimmed;
}

/**
 * Extrait et valide la destination d'une configuration source
 * @param {Object} config - La configuration parsée
 * @param {string} fallback - Valeur par défaut si destination manquante
 * @returns {string} - La destination validée
 */
export function getValidatedDestination(config, fallback = "default") {
  const destination = config.destination || fallback;
  return validateDestinationPath(destination);
}

/**
 * Parse et enrichit une source avec sa configuration validée
 * @param {Object} source - La source brute de la base de données
 * @returns {Object} - La source avec sa configuration parsée et validée
 */
export function enrichSourceWithConfig(source) {
  try {
    const parsedConfig = parseSourceConfig(source);

    // Valider la destination si elle existe
    if (parsedConfig.destination) {
      parsedConfig.destination = validateDestinationPath(parsedConfig.destination);
    }

    return {
      ...source,
      config: parsedConfig
    };
  } catch (error) {
    console.error(`Failed to enrich source ${source.id || 'unknown'}:`, error);
    throw error;
  }
}
