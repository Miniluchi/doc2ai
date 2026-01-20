import BaseConverter from "./baseConverter.js";
import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);
const mammoth = require("mammoth");

/**
 * Convertisseur de fichiers DOCX vers Markdown
 * Utilise mammoth.js pour l'extraction de contenu
 */
class DocxToMarkdownConverter extends BaseConverter {
  constructor() {
    super();
    this.name = "DOCX to Markdown Converter";
    this.supportedExtensions = [".docx", ".doc"];
  }

  /**
   * Convertit un fichier DOCX en Markdown
   * @param {string} inputPath - Chemin du fichier DOCX
   * @param {string} outputPath - Chemin de sortie du fichier Markdown
   * @returns {Promise<{success: boolean, message?: string, checksum?: string, error?: string}>}
   */
  async convert(inputPath, outputPath) {
    try {
      this.log("convert", { inputPath, outputPath });
      this.updateProgress(10, "Validating input file");

      // Valider le fichier d'entrée
      await this.validateInputFile(inputPath);

      const fileInfo = await this.getFileInfo(inputPath);
      if (!fileInfo.isSupported) {
        throw new Error(`Unsupported file extension: ${fileInfo.extension}`);
      }

      this.updateProgress(20, "Reading DOCX file");

      // Options de conversion Mammoth
      const options = {
        styleMap: [
          // Mappings pour les styles Word vers Markdown
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "p[style-name='Quote'] => blockquote:fresh",
          "p[style-name='Code'] => pre:fresh",
          "r[style-name='Code'] => code",
          "p[style-name='List Paragraph'] => p:fresh",
        ],
        convertImage: mammoth.images.imgElement(async (image) => {
          // Convertir les images en références Markdown
          // En production, vous pourriez vouloir sauvegarder les images
          await image.read();
          const imageName = `image_${Date.now()}.${image.contentType.split("/")[1] || "png"}`;

          // Pour l'instant, juste retourner une référence
          return {
            src: `./images/${imageName}`,
            alt: `Image ${imageName}`,
          };
        }),
        ignoreEmptyParagraphs: true,
      };

      this.updateProgress(40, "Converting to Markdown");

      // Convertir avec Mammoth
      const result = await mammoth.convertToMarkdown(
        { path: inputPath },
        options,
      );

      this.updateProgress(60, "Processing conversion result");

      // Traiter le résultat
      let markdown = result.value;

      // Nettoyer et améliorer le Markdown
      markdown = this.enhanceMarkdown(markdown);

      this.updateProgress(80, "Adding metadata and saving");

      // Ajouter les métadonnées
      const metadata = {
        source_file: path.basename(inputPath),
        file_size: fileInfo.size,
        converted_from: "DOCX",
        conversion_warnings: result.messages.length,
      };

      markdown = this.addMetadata(markdown, metadata);

      // Sauvegarder le fichier
      const checksum = await this.saveMarkdown(markdown, outputPath);

      // Log des warnings de conversion s'il y en a
      if (result.messages.length > 0) {
        this.log("conversion_warnings", {
          count: result.messages.length,
          messages: result.messages.map((m) => ({
            type: m.type,
            message: m.message,
          })),
        });
      }

      this.updateProgress(100, "Conversion completed");

      return {
        success: true,
        message: `DOCX converted successfully to ${outputPath}`,
        checksum,
        warnings: result.messages.length,
        stats: {
          inputSize: fileInfo.size,
          outputLength: markdown.length,
          warningsCount: result.messages.length,
        },
      };
    } catch (error) {
      return this.handleError(error, "DOCX conversion", inputPath);
    }
  }

  /**
   * Améliore le Markdown généré par Mammoth
   * @param {string} markdown - Markdown brut de Mammoth
   * @returns {string} - Markdown amélioré
   */
  enhanceMarkdown(markdown) {
    if (!markdown) return "";

    let enhanced = markdown;

    // Corriger les titres mal formés
    enhanced = enhanced.replace(/^#{7,}/gm, "######"); // Max 6 niveaux de titres

    // Améliorer les listes
    enhanced = enhanced.replace(/^\* /gm, "- "); // Uniformiser les puces

    // Nettoyer les espaces autour des titres
    enhanced = enhanced.replace(/^(#{1,6})\s+(.+)$/gm, "$1 $2");

    // Améliorer les liens
    enhanced = enhanced.replace(/\[([^\]]+)\]\(\s*([^)]+)\s*\)/g, "[$1]($2)");

    // Corriger les tableaux mal formés
    enhanced = this.fixTables(enhanced);

    // Améliorer les citations
    enhanced = enhanced.replace(/^>\s*/gm, "> ");

    // Nettoyer les sauts de ligne excessifs
    enhanced = enhanced.replace(/\n{4,}/g, "\n\n\n");

    return enhanced;
  }

  /**
   * Corrige le formatage des tableaux
   * @param {string} markdown - Markdown avec potentiels problèmes de tableaux
   * @returns {string} - Markdown avec tableaux corrigés
   */
  fixTables(markdown) {
    // Cette méthode peut être étendue pour améliorer le traitement des tableaux
    // Mammoth ne génère pas toujours des tableaux Markdown parfaits

    // Pour l'instant, on fait un nettoyage basique
    let fixed = markdown;

    // Assurer que les lignes de tableau ont bien des pipes de début/fin
    fixed = fixed.replace(/^([^|\n]*\|[^|\n]*\|[^|\n]*)$/gm, "|$1|");

    return fixed;
  }

  /**
   * Valide spécifiquement les fichiers DOCX/DOC
   * @param {string} filePath - Chemin du fichier
   * @returns {Promise<boolean>}
   */
  async validateInputFile(filePath) {
    // Validation de base
    await super.validateInputFile(filePath);

    // Validation spécifique DOCX/DOC
    const extension = path.extname(filePath).toLowerCase();

    if (!this.supportedExtensions.includes(extension)) {
      throw new Error(
        `Unsupported extension: ${extension}. Supported: ${this.supportedExtensions.join(", ")}`,
      );
    }

    // Vérifier que le fichier semble être un document Office valide
    // (vérification basique sur les premiers bytes)
    const fs = require("fs");
    const buffer = Buffer.alloc(8);
    const fd = fs.openSync(filePath, "r");

    try {
      fs.readSync(fd, buffer, 0, 8, 0);

      // DOCX commence par 'PK' (ZIP signature)
      // DOC a une signature différente
      if (
        extension === ".docx" &&
        !buffer.toString("ascii", 0, 2).includes("PK")
      ) {
        console.warn(`Warning: ${filePath} may not be a valid DOCX file`);
      }
    } finally {
      fs.closeSync(fd);
    }

    return true;
  }
}

export default DocxToMarkdownConverter;
