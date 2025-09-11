import DocxToMarkdownConverter from './docxToMarkdownConverter.js'
import PdfToMarkdownConverter from './pdfToMarkdownConverter.js'

/**
 * Factory pour créer les convertisseurs appropriés selon le type de fichier
 */
class ConverterFactory {
  /**
   * Obtient le convertisseur approprié pour une extension de fichier
   * @param {string} fileExtension - Extension du fichier (ex: '.docx', '.pdf')
   * @returns {BaseConverter} - Instance du convertisseur approprié
   */
  static getConverter(fileExtension) {
    if (!fileExtension) {
      throw new Error('File extension is required')
    }

    const normalizedExt = fileExtension.toLowerCase()

    switch (normalizedExt) {
      case '.docx':
      case '.doc':
        return new DocxToMarkdownConverter()
      
      case '.pdf':
        return new PdfToMarkdownConverter()
      
      default:
        throw new Error(`Unsupported file format: ${fileExtension}. Supported formats: .docx, .doc, .pdf`)
    }
  }

  /**
   * Retourne la liste des extensions supportées
   * @returns {Array<string>} - Liste des extensions
   */
  static getSupportedExtensions() {
    return ['.docx', '.doc', '.pdf']
  }

  /**
   * Vérifie si une extension est supportée
   * @param {string} fileExtension - Extension à vérifier
   * @returns {boolean} - True si supportée
   */
  static isExtensionSupported(fileExtension) {
    return this.getSupportedExtensions().includes(fileExtension.toLowerCase())
  }

  /**
   * Retourne des informations sur les convertisseurs disponibles
   * @returns {object} - Informations sur les convertisseurs
   */
  static getConverterInfo() {
    return {
      '.docx': {
        name: 'DOCX to Markdown',
        description: 'Converts Microsoft Word documents to Markdown',
        library: 'mammoth.js',
        features: ['Text extraction', 'Basic formatting', 'Images', 'Tables']
      },
      '.doc': {
        name: 'DOC to Markdown',
        description: 'Converts legacy Word documents to Markdown',
        library: 'mammoth.js',
        features: ['Text extraction', 'Basic formatting'],
        note: 'Limited support compared to DOCX'
      },
      '.pdf': {
        name: 'PDF to Markdown',
        description: 'Converts PDF documents to Markdown',
        library: 'pdf-parse',
        features: ['Text extraction', 'Page separation'],
        limitations: ['No formatting preservation', 'Image extraction limited']
      }
    }
  }

  /**
   * Détermine le convertisseur à partir d'un nom de fichier
   * @param {string} fileName - Nom du fichier
   * @returns {BaseConverter} - Instance du convertisseur
   */
  static getConverterFromFileName(fileName) {
    if (!fileName) {
      throw new Error('File name is required')
    }

    const extension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase()
    return this.getConverter(extension)
  }

  /**
   * Valide qu'un fichier peut être converti
   * @param {string} fileName - Nom du fichier
   * @returns {object} - Résultat de validation { canConvert: boolean, reason?: string }
   */
  static validateFile(fileName) {
    if (!fileName) {
      return { canConvert: false, reason: 'File name is required' }
    }

    const extension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase()
    
    if (!extension) {
      return { canConvert: false, reason: 'File has no extension' }
    }

    if (!this.isExtensionSupported(extension)) {
      return { 
        canConvert: false, 
        reason: `Unsupported extension: ${extension}. Supported: ${this.getSupportedExtensions().join(', ')}` 
      }
    }

    return { canConvert: true }
  }
}

export { ConverterFactory }