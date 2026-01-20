import BaseConverter from "./baseConverter.js";
import { PDFParse } from "pdf-parse";
import fs from "fs-extra";
import path from "path";

/**
 * Convertisseur de fichiers PDF vers Markdown
 * Utilise pdf-parse v2 pour l'extraction de texte
 */
class PdfToMarkdownConverter extends BaseConverter {
  constructor() {
    super();
    this.name = "PDF to Markdown Converter";
    this.supportedExtensions = [".pdf"];
  }

  /**
   * Convertit un fichier PDF en Markdown
   * @param {string} inputPath - Chemin du fichier PDF
   * @param {string} outputPath - Chemin de sortie du fichier Markdown
   * @returns {Promise<{success: boolean, message?: string, checksum?: string, error?: string}>}
   */
  async convert(inputPath, outputPath) {
    let parser = null;

    try {
      this.log("convert", { inputPath, outputPath });
      this.updateProgress(10, "Validating input file");

      // Valider le fichier d'entrée
      await this.validateInputFile(inputPath);

      const fileInfo = await this.getFileInfo(inputPath);
      if (!fileInfo.isSupported) {
        throw new Error(`Unsupported file extension: ${fileInfo.extension}`);
      }

      this.updateProgress(20, "Reading PDF file");

      // Lire le fichier PDF
      const dataBuffer = await fs.readFile(inputPath);

      this.updateProgress(40, "Parsing PDF content");

      // Créer le parser pdf-parse v2
      parser = new PDFParse({ data: dataBuffer });

      // Extraire le texte et les métadonnées
      const [textResult, infoResult] = await Promise.all([
        parser.getText(),
        parser.getInfo(),
      ]);

      this.updateProgress(60, "Converting to Markdown");

      // Convertir le texte en Markdown
      let markdown = this.convertTextToMarkdown(
        textResult.text,
        textResult.total,
      );

      this.updateProgress(80, "Adding metadata and saving");

      // Ajouter les métadonnées
      const metadata = {
        source_file: path.basename(inputPath),
        file_size: fileInfo.size,
        converted_from: "PDF",
        pages: textResult.total,
        pdf_info: {
          title: infoResult.info?.Title || "Unknown",
          author: infoResult.info?.Author || "Unknown",
          creator: infoResult.info?.Creator || "Unknown",
          creation_date: infoResult.info?.CreationDate || null,
        },
      };

      markdown = this.addMetadata(markdown, metadata);

      // Sauvegarder le fichier
      const checksum = await this.saveMarkdown(markdown, outputPath);

      this.updateProgress(100, "Conversion completed");

      return {
        success: true,
        message: `PDF converted successfully to ${outputPath}`,
        checksum,
        stats: {
          inputSize: fileInfo.size,
          outputLength: markdown.length,
          pages: textResult.total,
          title: infoResult.info?.Title,
        },
      };
    } catch (error) {
      return this.handleError(error, "PDF conversion", inputPath);
    } finally {
      // Toujours libérer les ressources du parser
      if (parser) {
        await parser.destroy();
      }
    }
  }

  /**
   * Convertit le texte brut extrait du PDF en Markdown
   * @param {string} text - Texte brut du PDF
   * @param {number} pageCount - Nombre de pages
   * @returns {string} - Texte formaté en Markdown
   */
  convertTextToMarkdown(text, pageCount) {
    if (!text) return "";

    let markdown = text;

    // Nettoyer le texte initial
    markdown = this.cleanRawText(markdown);

    // Détecter et convertir les structures
    markdown = this.detectHeaders(markdown);
    markdown = this.detectLists(markdown);
    markdown = this.detectParagraphs(markdown);
    markdown = this.addPageBreaks(markdown, pageCount);

    return markdown;
  }

  /**
   * Nettoie le texte brut extrait du PDF
   * @param {string} text - Texte brut
   * @returns {string} - Texte nettoyé
   */
  cleanRawText(text) {
    let cleaned = text;

    // Supprimer les caractères de contrôle étranges
    // eslint-disable-next-line no-control-regex
    cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");

    // Corriger les sauts de ligne
    cleaned = cleaned.replace(/\r\n/g, "\n");
    cleaned = cleaned.replace(/\r/g, "\n");

    // Supprimer les espaces en fin de ligne
    cleaned = cleaned.replace(/[ \t]+$/gm, "");

    // Corriger les mots coupés en fin de ligne (heuristique simple)
    cleaned = cleaned.replace(/([a-z])-\n([a-z])/g, "$1$2");

    return cleaned;
  }

  /**
   * Détecte et formate les en-têtes potentiels
   * @param {string} text - Texte à analyser
   * @returns {string} - Texte avec en-têtes formatés
   */
  detectHeaders(text) {
    let formatted = text;

    // Détecter les lignes qui pourraient être des titres
    // (lignes courtes, en majuscules, ou suivies de lignes vides)
    const lines = formatted.split("\n");
    const processedLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : "";
      const prevLine = i > 0 ? lines[i - 1].trim() : "";

      // Heuristiques pour détecter les titres
      let isHeader = false;
      let headerLevel = 1;

      if (line.length > 0 && line.length < 80) {
        // Ligne courte non vide

        if (line.toUpperCase() === line && line.length > 5) {
          // Tout en majuscules
          isHeader = true;
          headerLevel = 1;
        } else if (nextLine === "" && prevLine === "" && line.length < 50) {
          // Ligne isolée et courte
          isHeader = true;
          headerLevel = 2;
        } else if (/^\d+\./.test(line)) {
          // Commence par un numéro (1. 2. etc.)
          isHeader = true;
          headerLevel = 2;
        } else if (/^[A-Z][A-Z\s]{10,}$/.test(line)) {
          // Beaucoup de majuscules
          isHeader = true;
          headerLevel = 1;
        }
      }

      if (isHeader) {
        processedLines.push("#".repeat(headerLevel) + " " + line);
      } else {
        processedLines.push(line);
      }
    }

    return processedLines.join("\n");
  }

  /**
   * Détecte et formate les listes
   * @param {string} text - Texte à analyser
   * @returns {string} - Texte avec listes formatées
   */
  detectLists(text) {
    let formatted = text;

    // Détecter les listes avec puces ou numéros
    formatted = formatted.replace(/^[\s]*[•·‣▪▫‪‬]\s+(.+)$/gm, "- $1");
    formatted = formatted.replace(/^[\s]*[*]\s+(.+)$/gm, "- $1");
    formatted = formatted.replace(/^[\s]*[-]\s+(.+)$/gm, "- $1");

    // Listes numérotées
    formatted = formatted.replace(/^[\s]*(\d+)[.)]\s+(.+)$/gm, "$1. $2");

    return formatted;
  }

  /**
   * Améliore la structure des paragraphes
   * @param {string} text - Texte à analyser
   * @returns {string} - Texte avec paragraphes mieux structurés
   */
  detectParagraphs(text) {
    let formatted = text;

    // Assurer qu'il y a des espaces entre les paragraphes
    formatted = formatted.replace(/\n([^\n\s-#*\d])/g, "\n\n$1");

    // Nettoyer les multiples sauts de ligne
    formatted = formatted.replace(/\n{3,}/g, "\n\n");

    return formatted;
  }

  /**
   * Ajoute des marqueurs de page
   * @param {string} text - Texte à traiter
   * @param {number} pageCount - Nombre de pages
   * @returns {string} - Texte avec marqueurs de page
   */
  addPageBreaks(text, pageCount) {
    if (pageCount <= 1) return text;

    // Cette méthode est simplifiée - une implémentation plus avancée
    // nécessiterait de traiter chaque page séparément lors du parsing
    let enhanced = text;

    // Ajouter une note sur les pages
    enhanced =
      `> Document extrait d'un PDF de ${pageCount} pages\n\n` + enhanced;

    return enhanced;
  }

  /**
   * Valide spécifiquement les fichiers PDF
   * @param {string} filePath - Chemin du fichier
   * @returns {Promise<boolean>}
   */
  async validateInputFile(filePath) {
    // Validation de base
    await super.validateInputFile(filePath);

    // Validation spécifique PDF
    const extension = path.extname(filePath).toLowerCase();

    if (extension !== ".pdf") {
      throw new Error(`Expected PDF file, got: ${extension}`);
    }

    // Vérifier la signature PDF
    try {
      const buffer = await fs.readFile(filePath, { encoding: null });
      const header = buffer.subarray(0, 4).toString("ascii");

      if (!header.includes("%PDF")) {
        throw new Error(`File does not appear to be a valid PDF: ${filePath}`);
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(`PDF file not found: ${filePath}`);
      }
      throw error;
    }

    return true;
  }

  /**
   * Extrait les métadonnées du PDF
   * @param {string} filePath - Chemin du fichier PDF
   * @returns {Promise<object>} - Métadonnées du PDF
   */
  async extractMetadata(filePath) {
    let parser = null;

    try {
      const dataBuffer = await fs.readFile(filePath);
      parser = new PDFParse({ data: dataBuffer });
      const infoResult = await parser.getInfo();

      return {
        pages: infoResult.total,
        info: infoResult.info || {},
        textLength: 0, // Non disponible sans getText
      };
    } catch (error) {
      this.log("metadata_extraction_failed", { error: error.message });
      return {
        pages: 0,
        info: {},
        textLength: 0,
      };
    } finally {
      if (parser) {
        await parser.destroy();
      }
    }
  }
}

export default PdfToMarkdownConverter;
