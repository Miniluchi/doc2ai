import BaseConverter from './baseConverter.js';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');

class DocxToMarkdownConverter extends BaseConverter {
  constructor() {
    super();
    this.name = 'DOCX to Markdown Converter';
    this.supportedExtensions = ['.docx', '.doc'];
  }

  async convert(inputPath, outputPath) {
    try {
      this.log('convert', { inputPath, outputPath });
      this.updateProgress(10, 'Validating input file');

      await this.validateInputFile(inputPath);

      const fileInfo = await this.getFileInfo(inputPath);
      if (!fileInfo.isSupported) {
        throw new Error(`Unsupported file extension: ${fileInfo.extension}`);
      }

      this.updateProgress(20, 'Reading DOCX file');

      const options = {
        styleMap: [
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
          await image.read();
          const imageName = `image_${Date.now()}.${image.contentType.split('/')[1] || 'png'}`;

          return {
            src: `./images/${imageName}`,
            alt: `Image ${imageName}`,
          };
        }),
        ignoreEmptyParagraphs: true,
      };

      this.updateProgress(40, 'Converting to Markdown');

      const result = await mammoth.convertToMarkdown({ path: inputPath }, options);

      this.updateProgress(60, 'Processing conversion result');

      let markdown = result.value;
      markdown = this.enhanceMarkdown(markdown);

      this.updateProgress(80, 'Adding metadata and saving');

      const metadata = {
        source_file: path.basename(inputPath),
        file_size: fileInfo.size,
        converted_from: 'DOCX',
        conversion_warnings: result.messages.length,
      };

      markdown = this.addMetadata(markdown, metadata);

      const checksum = await this.saveMarkdown(markdown, outputPath);

      if (result.messages.length > 0) {
        this.log('conversion_warnings', {
          count: result.messages.length,
          messages: result.messages.map((m) => ({
            type: m.type,
            message: m.message,
          })),
        });
      }

      this.updateProgress(100, 'Conversion completed');

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
      return this.handleError(error, 'DOCX conversion', inputPath);
    }
  }

  enhanceMarkdown(markdown) {
    if (!markdown) return '';

    let enhanced = markdown;

    enhanced = enhanced.replace(/^#{7,}/gm, '######');
    enhanced = enhanced.replace(/^\* /gm, '- ');
    enhanced = enhanced.replace(/^(#{1,6})\s+(.+)$/gm, '$1 $2');
    enhanced = enhanced.replace(/\[([^\]]+)\]\(\s*([^)]+)\s*\)/g, '[$1]($2)');
    enhanced = this.fixTables(enhanced);
    enhanced = enhanced.replace(/^>\s*/gm, '> ');
    enhanced = enhanced.replace(/\n{4,}/g, '\n\n\n');

    return enhanced;
  }

  fixTables(markdown) {
    let fixed = markdown;
    fixed = fixed.replace(/^([^|\n]*\|[^|\n]*\|[^|\n]*)$/gm, '|$1|');
    return fixed;
  }

  async validateInputFile(filePath) {
    await super.validateInputFile(filePath);

    const extension = path.extname(filePath).toLowerCase();

    if (!this.supportedExtensions.includes(extension)) {
      throw new Error(
        `Unsupported extension: ${extension}. Supported: ${this.supportedExtensions.join(', ')}`,
      );
    }

    // Check file magic bytes for valid Office document
    const fs = require('fs');
    const buffer = Buffer.alloc(8);
    const fd = fs.openSync(filePath, 'r');

    try {
      fs.readSync(fd, buffer, 0, 8, 0);

      if (extension === '.docx' && !buffer.toString('ascii', 0, 2).includes('PK')) {
        console.warn(`Warning: ${filePath} may not be a valid DOCX file`);
      }
    } finally {
      fs.closeSync(fd);
    }

    return true;
  }
}

export default DocxToMarkdownConverter;
