import fs from 'fs-extra'
import { generateFileChecksum } from '../utils/encryption.js'

/**
 * Classe de base pour tous les convertisseurs
 * Tous les convertisseurs doivent hériter de cette classe
 */
class BaseConverter {
  constructor() {
    this.name = 'Base Converter'
    this.supportedExtensions = []
  }

  /**
   * Convertit un fichier vers Markdown
   * @param {string} inputPath - Chemin du fichier source
   * @param {string} outputPath - Chemin de sortie du fichier Markdown
   * @returns {Promise<{success: boolean, message?: string, checksum?: string, error?: string}>}
   */
  async convert(inputPath, outputPath) {
    throw new Error('convert() method must be implemented by subclass')
  }

  /**
   * Valide qu'un fichier d'entrée existe et est lisible
   * @param {string} filePath - Chemin du fichier
   * @returns {Promise<boolean>} - True si le fichier est valide
   */
  async validateInputFile(filePath) {
    try {
      const exists = await fs.pathExists(filePath)
      if (!exists) {
        throw new Error(`Input file does not exist: ${filePath}`)
      }

      const stats = await fs.stat(filePath)
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`)
      }

      if (stats.size === 0) {
        throw new Error(`Input file is empty: ${filePath}`)
      }

      return true
    } catch (error) {
      console.error(`File validation failed for ${filePath}:`, error)
      throw error
    }
  }

  /**
   * Prépare le fichier de sortie
   * @param {string} outputPath - Chemin de sortie
   * @returns {Promise<void>}
   */
  async prepareOutputFile(outputPath) {
    try {
      // Créer le répertoire parent s'il n'existe pas
      await fs.ensureDir(require('path').dirname(outputPath))
      
      // Si le fichier existe déjà, le supprimer
      if (await fs.pathExists(outputPath)) {
        await fs.remove(outputPath)
      }
    } catch (error) {
      console.error(`Failed to prepare output file ${outputPath}:`, error)
      throw error
    }
  }

  /**
   * Nettoie le contenu Markdown généré
   * @param {string} markdown - Contenu Markdown brut
   * @returns {string} - Contenu Markdown nettoyé
   */
  cleanMarkdown(markdown) {
    if (!markdown) return ''

    // Supprimer les lignes vides excessives
    let cleaned = markdown.replace(/\n{3,}/g, '\n\n')
    
    // Nettoyer les espaces en fin de ligne
    cleaned = cleaned.replace(/[ \t]+$/gm, '')
    
    // Nettoyer les espaces en début/fin de document
    cleaned = cleaned.trim()
    
    // Assurer qu'il y a une ligne vide à la fin
    if (cleaned && !cleaned.endsWith('\n')) {
      cleaned += '\n'
    }

    return cleaned
  }

  /**
   * Ajoute des métadonnées au début du fichier Markdown
   * @param {string} markdown - Contenu Markdown
   * @param {object} metadata - Métadonnées à ajouter
   * @returns {string} - Markdown avec métadonnées
   */
  addMetadata(markdown, metadata = {}) {
    const defaultMetadata = {
      generated_by: 'Doc2AI',
      generated_at: new Date().toISOString(),
      ...metadata
    }

    const metadataLines = [
      '---',
      ...Object.entries(defaultMetadata).map(([key, value]) => `${key}: ${value}`),
      '---',
      '',
      markdown
    ]

    return metadataLines.join('\n')
  }

  /**
   * Sauvegarde le contenu Markdown dans un fichier
   * @param {string} markdown - Contenu Markdown
   * @param {string} outputPath - Chemin de sortie
   * @returns {Promise<string>} - Checksum du fichier sauvegardé
   */
  async saveMarkdown(markdown, outputPath) {
    try {
      await this.prepareOutputFile(outputPath)
      
      const cleanedMarkdown = this.cleanMarkdown(markdown)
      await fs.writeFile(outputPath, cleanedMarkdown, 'utf8')
      
      // Générer le checksum du fichier créé
      const checksum = await generateFileChecksum(outputPath)
      
      console.log(`✅ Markdown saved: ${outputPath} (${cleanedMarkdown.length} chars, checksum: ${checksum.substring(0, 8)}...)`)
      
      return checksum
    } catch (error) {
      console.error(`Failed to save markdown to ${outputPath}:`, error)
      throw error
    }
  }

  /**
   * Log une opération du convertisseur
   * @param {string} operation - Nom de l'opération
   * @param {object} details - Détails de l'opération
   */
  log(operation, details = {}) {
    console.log(`[${this.name}] ${operation}:`, details)
  }

  /**
   * Gère les erreurs de conversion
   * @param {Error} error - Erreur à traiter
   * @param {string} operation - Nom de l'opération qui a échoué
   * @param {string} filePath - Chemin du fichier concerné
   * @returns {object} - Résultat d'erreur formaté
   */
  handleError(error, operation, filePath) {
    const errorMessage = `${operation} failed for ${filePath}: ${error.message}`
    console.error(`[${this.name}] ${errorMessage}`, error)
    
    return {
      success: false,
      error: errorMessage,
      details: {
        operation,
        filePath,
        converterName: this.name,
        originalError: error.message,
        stack: error.stack
      }
    }
  }

  /**
   * Obtient des informations sur le fichier d'entrée
   * @param {string} filePath - Chemin du fichier
   * @returns {Promise<object>} - Informations sur le fichier
   */
  async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath)
      const extension = require('path').extname(filePath).toLowerCase()
      
      return {
        size: stats.size,
        extension,
        modified: stats.mtime,
        created: stats.birthtime,
        isSupported: this.supportedExtensions.includes(extension)
      }
    } catch (error) {
      throw new Error(`Failed to get file info for ${filePath}: ${error.message}`)
    }
  }

  /**
   * Méthode utilitaire pour la progression (peut être overridée)
   * @param {number} progress - Progression 0-100
   * @param {string} message - Message de progression
   */
  updateProgress(progress, message) {
    console.log(`[${this.name}] ${progress}% - ${message}`)
  }
}

export default BaseConverter