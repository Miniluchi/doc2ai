import BaseConverter from './baseConverter.js';
import { PDFParse } from 'pdf-parse';
import fs from 'fs-extra';
import path from 'node:path';
import type { ConversionResult } from '../types/domain.js';

class PdfToMarkdownConverter extends BaseConverter {
  constructor() {
    super();
    this.name = 'PDF to Markdown Converter';
    this.supportedExtensions = ['.pdf'];
  }

  override async convert(inputPath: string, outputPath: string): Promise<ConversionResult> {
    let parser: InstanceType<typeof PDFParse> | null = null;

    try {
      this.log('convert', { inputPath, outputPath });
      this.updateProgress(10, 'Validating input file');

      await this.validateInputFile(inputPath);

      const fileInfo = await this.getFileInfo(inputPath);
      if (!fileInfo.isSupported) {
        throw new Error(`Unsupported file extension: ${fileInfo.extension}`);
      }

      this.updateProgress(20, 'Reading PDF file');

      const dataBuffer = await fs.readFile(inputPath);

      this.updateProgress(40, 'Parsing PDF content');

      parser = new PDFParse({ data: dataBuffer });

      const [textResult, infoResult] = await Promise.all([
        parser.getText(),
        parser.getInfo(),
      ]);

      this.updateProgress(60, 'Converting to Markdown');

      let markdown = this.convertTextToMarkdown(textResult.text, textResult.total);

      this.updateProgress(80, 'Adding metadata and saving');

      const pdfInfo = infoResult.info as Record<string, unknown>;
      const metadata: Record<string, unknown> = {
        source_file: path.basename(inputPath),
        file_size: fileInfo.size,
        converted_from: 'PDF',
        pages: textResult.total,
        pdf_info: {
          title: pdfInfo['Title'] ?? 'Unknown',
          author: pdfInfo['Author'] ?? 'Unknown',
          creator: pdfInfo['Creator'] ?? 'Unknown',
          creation_date: pdfInfo['CreationDate'] ?? null,
        },
      };

      markdown = this.addMetadata(markdown, metadata);

      const checksum = await this.saveMarkdown(markdown, outputPath);

      this.updateProgress(100, 'Conversion completed');

      return {
        success: true,
        message: `PDF converted successfully to ${outputPath}`,
        checksum,
        stats: {
          inputSize: fileInfo.size,
          outputLength: markdown.length,
          pages: textResult.total,
          title: pdfInfo['Title'],
        },
      };
    } catch (error) {
      return this.handleError(error, 'PDF conversion', inputPath);
    } finally {
      if (parser) {
        await parser.destroy();
      }
    }
  }

  private convertTextToMarkdown(text: string, pageCount: number): string {
    if (!text) return '';

    let markdown = text;

    markdown = this.cleanRawText(markdown);
    markdown = this.detectHeaders(markdown);
    markdown = this.detectLists(markdown);
    markdown = this.detectParagraphs(markdown);
    markdown = this.addPageBreaks(markdown, pageCount);

    return markdown;
  }

  private cleanRawText(text: string): string {
    let cleaned = text;

    // eslint-disable-next-line no-control-regex
    cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    cleaned = cleaned.replace(/\r\n/g, '\n');
    cleaned = cleaned.replace(/\r/g, '\n');
    cleaned = cleaned.replace(/[ \t]+$/gm, '');
    cleaned = cleaned.replace(/([a-z])-\n([a-z])/g, '$1$2');

    return cleaned;
  }

  private detectHeaders(text: string): string {
    const lines = text.split('\n');
    const processedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = (lines[i] ?? '').trim();
      const nextLine = (lines[i + 1] ?? '').trim();
      const prevLine = (lines[i - 1] ?? '').trim();

      let isHeader = false;
      let headerLevel = 1;

      if (line.length > 0 && line.length < 80) {
        if (line.toUpperCase() === line && line.length > 5) {
          isHeader = true;
          headerLevel = 1;
        } else if (nextLine === '' && prevLine === '' && line.length < 50) {
          isHeader = true;
          headerLevel = 2;
        } else if (/^\d+\./.test(line)) {
          isHeader = true;
          headerLevel = 2;
        } else if (/^[A-Z][A-Z\s]{10,}$/.test(line)) {
          isHeader = true;
          headerLevel = 1;
        }
      }

      if (isHeader) {
        processedLines.push('#'.repeat(headerLevel) + ' ' + line);
      } else {
        processedLines.push(line);
      }
    }

    return processedLines.join('\n');
  }

  private detectLists(text: string): string {
    let formatted = text;

    formatted = formatted.replace(/^[\s]*[•·‣▪▫‪‬]\s+(.+)$/gm, '- $1');
    formatted = formatted.replace(/^[\s]*[*]\s+(.+)$/gm, '- $1');
    formatted = formatted.replace(/^[\s]*[-]\s+(.+)$/gm, '- $1');
    formatted = formatted.replace(/^[\s]*(\d+)[.)]\s+(.+)$/gm, '$1. $2');

    return formatted;
  }

  private detectParagraphs(text: string): string {
    let formatted = text;

    formatted = formatted.replace(/\n([^\n\s-#*\d])/g, '\n\n$1');
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted;
  }

  private addPageBreaks(text: string, pageCount: number): string {
    if (pageCount <= 1) return text;

    return `> Extracted from a ${pageCount}-page PDF document\n\n` + text;
  }

  override async validateInputFile(filePath: string): Promise<boolean> {
    await super.validateInputFile(filePath);

    const extension = path.extname(filePath).toLowerCase();

    if (extension !== '.pdf') {
      throw new Error(`Expected PDF file, got: ${extension}`);
    }

    try {
      const buffer = await fs.readFile(filePath, { encoding: null });
      const header = buffer.subarray(0, 4).toString('ascii');

      if (!header.includes('%PDF')) {
        throw new Error(`File does not appear to be a valid PDF: ${filePath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`PDF file not found: ${filePath}`);
      }
      throw error;
    }

    return true;
  }

  async extractMetadata(
    filePath: string,
  ): Promise<{ pages: number; info: Record<string, unknown>; textLength: number }> {
    let parser: InstanceType<typeof PDFParse> | null = null;

    try {
      const dataBuffer = await fs.readFile(filePath);
      parser = new PDFParse({ data: dataBuffer });
      const infoResult = await parser.getInfo();

      return {
        pages: infoResult.total,
        info: (infoResult.info as Record<string, unknown>) ?? {},
        textLength: 0,
      };
    } catch (error) {
      this.log('metadata_extraction_failed', { error: (error as Error).message });
      return { pages: 0, info: {}, textLength: 0 };
    } finally {
      if (parser) {
        await parser.destroy();
      }
    }
  }
}

export default PdfToMarkdownConverter;
