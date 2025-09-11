/**
 * Interface de base pour tous les connecteurs de drives
 * Tous les connecteurs doivent hériter de cette classe
 */
class DriveConnector {
  constructor(config) {
    this.config = config
    this.isAuthenticated = false
  }

  /**
   * Authentifie le connecteur avec les credentials fournis
   * @returns {Promise<boolean>} - True si l'authentification réussit
   */
  async authenticate() {
    throw new Error('authenticate() method must be implemented by subclass')
  }

  /**
   * Test de connexion au drive
   * @returns {Promise<{success: boolean, message: string, details?: object}>}
   */
  async testConnection() {
    throw new Error('testConnection() method must be implemented by subclass')
  }

  /**
   * Liste les fichiers dans un répertoire donné
   * @param {string} path - Chemin du répertoire à lister
   * @returns {Promise<Array<{id: string, name: string, path: string, size: number, modifiedTime: Date, checksum?: string}>>}
   */
  async listFiles(path = '/') {
    throw new Error('listFiles() method must be implemented by subclass')
  }

  /**
   * Télécharge un fichier vers un répertoire local
   * @param {string} fileId - ID du fichier à télécharger
   * @param {string} destinationPath - Chemin de destination local
   * @returns {Promise<string>} - Chemin du fichier téléchargé
   */
  async downloadFile(fileId, destinationPath) {
    throw new Error('downloadFile() method must be implemented by subclass')
  }

  /**
   * Surveille les changements dans un répertoire
   * @param {string} path - Chemin à surveiller
   * @param {Function} callback - Fonction appelée lors de changements
   * @returns {Promise<void>}
   */
  async watchForChanges(path, callback) {
    throw new Error('watchForChanges() method must be implemented by subclass')
  }

  /**
   * Nettoie les ressources utilisées
   * @returns {Promise<void>}
   */
  async cleanup() {
    // Par défaut, rien à nettoyer
    // Les sous-classes peuvent override si nécessaire
  }

  /**
   * Valide la configuration fournie
   * @returns {boolean} - True si la configuration est valide
   */
  validateConfig() {
    if (!this.config) {
      throw new Error('Configuration is required')
    }

    if (!this.config.credentials) {
      throw new Error('Credentials are required')
    }

    return true
  }

  /**
   * Normalise les informations d'un fichier
   * @param {object} rawFile - Données brutes du fichier depuis l'API
   * @returns {object} - Fichier normalisé
   */
  normalizeFileInfo(rawFile) {
    return {
      id: rawFile.id,
      name: rawFile.name || 'Unknown',
      path: rawFile.path || rawFile.name,
      size: rawFile.size || 0,
      modifiedTime: rawFile.modifiedTime ? new Date(rawFile.modifiedTime) : new Date(),
      checksum: rawFile.checksum || rawFile.md5Checksum || null,
      platform: this.constructor.name.replace('Connector', '').toLowerCase()
    }
  }

  /**
   * Gère les erreurs d'API
   * @param {Error} error - Erreur à traiter
   * @param {string} operation - Nom de l'opération qui a échoué
   * @throws {Error} - Erreur enrichie
   */
  handleApiError(error, operation) {
    console.error(`${this.constructor.name} ${operation} failed:`, error)
    
    // Enrichir l'erreur avec des informations contextuelles
    const enrichedError = new Error(`${operation} failed: ${error.message}`)
    enrichedError.originalError = error
    enrichedError.operation = operation
    enrichedError.connector = this.constructor.name
    
    throw enrichedError
  }

  /**
   * Log une opération
   * @param {string} operation - Nom de l'opération
   * @param {object} details - Détails de l'opération
   */
  log(operation, details = {}) {
    console.log(`[${this.constructor.name}] ${operation}:`, details)
  }
}

export default DriveConnector