import SharePointConnector from '../sharepoint/sharepointConnector.js'
import GoogleDriveConnector from '../googledrive/googledriveConnector.js'

/**
 * Factory pour créer les connecteurs de drives appropriés
 */
class DriveConnectorFactory {
  /**
   * Crée un connecteur basé sur la plateforme
   * @param {string} platform - Type de plateforme ('sharepoint', 'googledrive', 'onedrive')
   * @param {object} config - Configuration du connecteur
   * @returns {DriveConnector} - Instance du connecteur approprié
   */
  static createConnector(platform, config) {
    if (!platform) {
      throw new Error('Platform is required')
    }

    if (!config) {
      throw new Error('Config is required')
    }

    const normalizedPlatform = platform.toLowerCase()

    switch (normalizedPlatform) {
      case 'sharepoint':
        return new SharePointConnector(config)
      
      case 'googledrive':
      case 'google-drive':
        return new GoogleDriveConnector(config)
      
      case 'onedrive':
        // OneDrive utilise la même API que SharePoint (Microsoft Graph)
        return new SharePointConnector({
          ...config,
          isOneDrive: true
        })
      
      default:
        throw new Error(`Unsupported platform: ${platform}. Supported platforms: sharepoint, googledrive, onedrive`)
    }
  }

  /**
   * Retourne la liste des plateformes supportées
   * @returns {Array<string>} - Liste des plateformes
   */
  static getSupportedPlatforms() {
    return ['sharepoint', 'googledrive', 'onedrive']
  }

  /**
   * Valide qu'une plateforme est supportée
   * @param {string} platform - Plateforme à valider
   * @returns {boolean} - True si supportée
   */
  static isPlatformSupported(platform) {
    return this.getSupportedPlatforms().includes(platform.toLowerCase())
  }

  /**
   * Retourne les champs de configuration requis pour une plateforme
   * @param {string} platform - Plateforme
   * @returns {object} - Schéma de configuration
   */
  static getConfigSchema(platform) {
    const normalizedPlatform = platform.toLowerCase()

    switch (normalizedPlatform) {
      case 'sharepoint':
      case 'onedrive':
        return {
          credentials: {
            clientId: { required: true, type: 'string', description: 'Microsoft App Client ID' },
            clientSecret: { required: true, type: 'string', description: 'Microsoft App Client Secret' },
            tenantId: { required: true, type: 'string', description: 'Microsoft Tenant ID' }
          },
          sourcePath: { required: false, type: 'string', default: '/', description: 'Path to monitor' },
          siteUrl: { required: true, type: 'string', description: 'SharePoint site URL' },
          destinations: { required: false, type: 'array', default: [], description: 'Local destination paths' },
          filters: {
            extensions: { required: false, type: 'array', default: ['.docx', '.pdf'], description: 'File extensions to process' },
            excludePatterns: { required: false, type: 'array', default: [], description: 'Regex patterns to exclude' }
          }
        }

      case 'googledrive':
        return {
          credentials: {
            clientId: { required: true, type: 'string', description: 'Google Client ID' },
            clientSecret: { required: true, type: 'string', description: 'Google Client Secret' },
            refreshToken: { required: true, type: 'string', description: 'Google Refresh Token' }
          },
          sourcePath: { required: false, type: 'string', default: 'root', description: 'Folder ID to monitor' },
          destinations: { required: false, type: 'array', default: [], description: 'Local destination paths' },
          filters: {
            extensions: { required: false, type: 'array', default: ['.docx', '.pdf'], description: 'File extensions to process' },
            excludePatterns: { required: false, type: 'array', default: [], description: 'Regex patterns to exclude' }
          }
        }

      default:
        throw new Error(`Unknown platform: ${platform}`)
    }
  }

  /**
   * Valide la configuration pour une plateforme donnée
   * @param {string} platform - Plateforme
   * @param {object} config - Configuration à valider
   * @returns {object} - Résultat de validation { valid: boolean, errors: Array<string> }
   */
  static validateConfig(platform, config) {
    try {
      const schema = this.getConfigSchema(platform)
      const errors = []

      // Fonction récursive pour valider un objet contre un schéma
      function validateObject(obj, schemaObj, path = '') {
        for (const [key, schemaValue] of Object.entries(schemaObj)) {
          const currentPath = path ? `${path}.${key}` : key
          
          if (typeof schemaValue === 'object' && schemaValue.required !== undefined) {
            // C'est une propriété avec des règles
            if (schemaValue.required && !obj[key]) {
              errors.push(`Missing required field: ${currentPath}`)
            } else if (obj[key] && schemaValue.type) {
              const actualType = Array.isArray(obj[key]) ? 'array' : typeof obj[key]
              if (actualType !== schemaValue.type) {
                errors.push(`Invalid type for ${currentPath}: expected ${schemaValue.type}, got ${actualType}`)
              }
            }
          } else if (typeof schemaValue === 'object') {
            // C'est un objet imbriqué
            if (obj[key]) {
              validateObject(obj[key], schemaValue, currentPath)
            }
          }
        }
      }

      validateObject(config, schema)

      return {
        valid: errors.length === 0,
        errors
      }
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error.message}`]
      }
    }
  }
}

export { DriveConnectorFactory }