import DocxToMarkdownConverter from './docxToMarkdownConverter.js'
import PdfToMarkdownConverter from './pdfToMarkdownConverter.js'

class ConverterFactory {
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

  static getSupportedExtensions() {
    return ['.docx', '.doc', '.pdf']
  }

  static isExtensionSupported(fileExtension) {
    return this.getSupportedExtensions().includes(fileExtension.toLowerCase())
  }

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

  static getConverterFromFileName(fileName) {
    if (!fileName) {
      throw new Error('File name is required')
    }

    const extension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase()
    return this.getConverter(extension)
  }

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
