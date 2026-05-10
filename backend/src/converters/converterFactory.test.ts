import { describe, it, expect } from 'bun:test';
import { ConverterFactory } from './converterFactory.js';
import DocxToMarkdownConverter from './docxToMarkdownConverter.js';
import PdfToMarkdownConverter from './pdfToMarkdownConverter.js';

describe('ConverterFactory.getConverter', () => {
  it('returns a DOCX converter for .docx', () => {
    expect(ConverterFactory.getConverter('.docx')).toBeInstanceOf(DocxToMarkdownConverter);
  });

  it('returns a DOCX converter for .doc', () => {
    expect(ConverterFactory.getConverter('.doc')).toBeInstanceOf(DocxToMarkdownConverter);
  });

  it('returns a PDF converter for .pdf', () => {
    expect(ConverterFactory.getConverter('.pdf')).toBeInstanceOf(PdfToMarkdownConverter);
  });

  it('is case-insensitive', () => {
    expect(ConverterFactory.getConverter('.PDF')).toBeInstanceOf(PdfToMarkdownConverter);
    expect(ConverterFactory.getConverter('.DocX')).toBeInstanceOf(DocxToMarkdownConverter);
  });

  it('throws when extension is empty', () => {
    expect(() => ConverterFactory.getConverter('')).toThrow('File extension is required');
  });

  it('throws on unsupported extension with a clear message', () => {
    expect(() => ConverterFactory.getConverter('.xls')).toThrow(/Unsupported file format: \.xls/);
  });
});

describe('ConverterFactory.getSupportedExtensions / isExtensionSupported', () => {
  it('lists the supported extensions', () => {
    expect(ConverterFactory.getSupportedExtensions()).toEqual(['.docx', '.doc', '.pdf']);
  });

  it('confirms supported extensions case-insensitively', () => {
    expect(ConverterFactory.isExtensionSupported('.PDF')).toBe(true);
    expect(ConverterFactory.isExtensionSupported('.docx')).toBe(true);
  });

  it('rejects unsupported extensions', () => {
    expect(ConverterFactory.isExtensionSupported('.txt')).toBe(false);
  });
});

describe('ConverterFactory.getConverterFromFileName', () => {
  it('selects converter based on the file extension', () => {
    expect(ConverterFactory.getConverterFromFileName('report.pdf')).toBeInstanceOf(
      PdfToMarkdownConverter,
    );
    expect(ConverterFactory.getConverterFromFileName('notes.DOCX')).toBeInstanceOf(
      DocxToMarkdownConverter,
    );
  });

  it('throws when the file name is empty', () => {
    expect(() => ConverterFactory.getConverterFromFileName('')).toThrow('File name is required');
  });
});

describe('ConverterFactory.validateFile', () => {
  it('approves supported files', () => {
    expect(ConverterFactory.validateFile('a.docx')).toEqual({ canConvert: true });
  });

  it('rejects empty file names', () => {
    expect(ConverterFactory.validateFile('')).toEqual({
      canConvert: false,
      reason: 'File name is required',
    });
  });

  it('rejects files without extension', () => {
    const result = ConverterFactory.validateFile('README');
    expect(result.canConvert).toBe(false);
  });

  it('rejects unsupported extensions with a helpful reason', () => {
    const result = ConverterFactory.validateFile('image.png');
    expect(result.canConvert).toBe(false);
    expect(result.reason).toContain('Unsupported extension');
  });
});

describe('ConverterFactory.getConverterInfo', () => {
  it('returns metadata for every supported extension', () => {
    const info = ConverterFactory.getConverterInfo();
    expect(Object.keys(info).sort()).toEqual(['.doc', '.docx', '.pdf']);
    expect(info['.pdf']?.['library']).toBe('pdf-parse');
  });
});
