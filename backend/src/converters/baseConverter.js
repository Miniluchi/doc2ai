import fs from "fs-extra";
import path from "path";
import { generateFileChecksum } from "../utils/encryption.js";

class BaseConverter {
  constructor() {
    this.name = "Base Converter";
    this.supportedExtensions = [];
  }

  async convert(_inputPath, _outputPath) {
    throw new Error("convert() method must be implemented by subclass");
  }

  async validateInputFile(filePath) {
    try {
      const exists = await fs.pathExists(filePath);
      if (!exists) {
        throw new Error(`Input file does not exist: ${filePath}`);
      }

      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }

      if (stats.size === 0) {
        throw new Error(`Input file is empty: ${filePath}`);
      }

      return true;
    } catch (error) {
      console.error(`File validation failed for ${filePath}:`, error);
      throw error;
    }
  }

  async prepareOutputFile(outputPath) {
    try {
      await fs.ensureDir(path.dirname(outputPath));

      if (await fs.pathExists(outputPath)) {
        await fs.remove(outputPath);
      }
    } catch (error) {
      console.error(`Failed to prepare output file ${outputPath}:`, error);
      throw error;
    }
  }

  cleanMarkdown(markdown) {
    if (!markdown) return "";

    let cleaned = markdown.replace(/\n{3,}/g, "\n\n");
    cleaned = cleaned.replace(/[ \t]+$/gm, "");
    cleaned = cleaned.trim();

    if (cleaned && !cleaned.endsWith("\n")) {
      cleaned += "\n";
    }

    return cleaned;
  }

  addMetadata(markdown, metadata = {}) {
    const defaultMetadata = {
      generated_by: "Doc2AI",
      generated_at: new Date().toISOString(),
      ...metadata,
    };

    const metadataLines = [
      "---",
      ...Object.entries(defaultMetadata).map(
        ([key, value]) => `${key}: ${value}`,
      ),
      "---",
      "",
      markdown,
    ];

    return metadataLines.join("\n");
  }

  async saveMarkdown(markdown, outputPath) {
    try {
      await this.prepareOutputFile(outputPath);

      const cleanedMarkdown = this.cleanMarkdown(markdown);
      await fs.writeFile(outputPath, cleanedMarkdown, "utf8");

      const checksum = await generateFileChecksum(outputPath);

      console.log(
        `✅ Markdown saved: ${outputPath} (${cleanedMarkdown.length} chars, checksum: ${checksum.substring(0, 8)}...)`,
      );

      return checksum;
    } catch (error) {
      console.error(`Failed to save markdown to ${outputPath}:`, error);
      throw error;
    }
  }

  log(operation, details = {}) {
    console.log(`[${this.name}] ${operation}:`, details);
  }

  handleError(error, operation, filePath) {
    const errorMessage = `${operation} failed for ${filePath}: ${error.message}`;
    console.error(`[${this.name}] ${errorMessage}`, error);

    return {
      success: false,
      error: errorMessage,
      details: {
        operation,
        filePath,
        converterName: this.name,
        originalError: error.message,
        stack: error.stack,
      },
    };
  }

  async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const extension = path.extname(filePath).toLowerCase();

      return {
        size: stats.size,
        extension,
        modified: stats.mtime,
        created: stats.birthtime,
        isSupported: this.supportedExtensions.includes(extension),
      };
    } catch (error) {
      throw new Error(
        `Failed to get file info for ${filePath}: ${error.message}`,
      );
    }
  }

  updateProgress(progress, message) {
    console.log(`[${this.name}] ${progress}% - ${message}`);
  }
}

export default BaseConverter;
