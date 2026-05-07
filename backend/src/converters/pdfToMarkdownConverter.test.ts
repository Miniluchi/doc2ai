import { describe, it, expect, mock, beforeAll, beforeEach, afterAll } from 'bun:test';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import type { ConversionResult } from '../types/domain.js';

const tmpRoot = path.join(os.tmpdir(), `doc2ai-pdf-${Date.now()}`);

let getTextMock = mock(async () => ({
  text: 'CHAPTER ONE\n\nLorem ipsum dolor sit amet.',
  total: 1,
}));
let getInfoMock = mock(async () => ({
  info: { Title: 'Doc Title', Author: 'Tester', Creator: 'Tester', CreationDate: 'today' },
  total: 1,
}));
const destroyMock = mock(async () => undefined);

class FakePDFParse {
  constructor(_args: { data: Buffer }) {}
  async getText() {
    return getTextMock();
  }
  async getInfo() {
    return getInfoMock();
  }
  async destroy() {
    return destroyMock();
  }
}

let PdfToMarkdownConverter: new () => {
  convert(input: string, output: string): Promise<ConversionResult>;
  extractMetadata(input: string): Promise<{ pages: number; info: Record<string, unknown> }>;
};
let originalPdfParse: unknown;

beforeAll(async () => {
  originalPdfParse = await import('pdf-parse');
  mock.module('pdf-parse', () => ({
    PDFParse: FakePDFParse,
    default: { PDFParse: FakePDFParse },
  }));
  ({ default: PdfToMarkdownConverter } = (await import('./pdfToMarkdownConverter.js')) as {
    default: new () => {
      convert(input: string, output: string): Promise<ConversionResult>;
      extractMetadata(input: string): Promise<{ pages: number; info: Record<string, unknown> }>;
    };
  });
});

afterAll(async () => {
  mock.module('pdf-parse', () => originalPdfParse);
  await fs.remove(tmpRoot);
});

beforeEach(() => {
  getTextMock = mock(async () => ({
    text: 'CHAPTER ONE\n\nLorem ipsum dolor sit amet.',
    total: 2,
  }));
  getInfoMock = mock(async () => ({
    info: { Title: 'Doc Title', Author: 'Tester', Creator: 'Tester' },
    total: 2,
  }));
});

async function makeFakePdf(): Promise<string> {
  await fs.ensureDir(tmpRoot);
  const filePath = path.join(tmpRoot, `${Math.random().toString(36).slice(2)}.pdf`);
  const header = Buffer.from('%PDF-1.4\n', 'ascii');
  await fs.writeFile(filePath, Buffer.concat([header, Buffer.from('payload')]));
  return filePath;
}

describe('PdfToMarkdownConverter.convert', () => {
  it('returns success with metadata and a checksum for a valid PDF', async () => {
    const inputPath = await makeFakePdf();
    const outputPath = path.join(tmpRoot, 'out', `${Date.now()}.md`);
    const converter = new PdfToMarkdownConverter();

    const result = await converter.convert(inputPath, outputPath);

    expect(result.success).toBe(true);
    expect(typeof result.checksum).toBe('string');
    const stats = result.stats as { pages: number; title: string };
    expect(stats.pages).toBe(2);
    expect(stats.title).toBe('Doc Title');

    const md = await fs.readFile(outputPath, 'utf8');
    expect(md).toContain('Lorem ipsum');
    expect(md).toContain('2-page PDF');
  });

  it('rejects non-pdf extensions', async () => {
    await fs.ensureDir(tmpRoot);
    const inputPath = path.join(tmpRoot, `${Date.now()}.txt`);
    await fs.writeFile(inputPath, 'not a pdf');
    const converter = new PdfToMarkdownConverter();

    const result = await converter.convert(inputPath, path.join(tmpRoot, 'out.md'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Expected PDF file|Unsupported/);
  });

  it('rejects files lacking the %PDF header', async () => {
    await fs.ensureDir(tmpRoot);
    const inputPath = path.join(tmpRoot, `bad-${Date.now()}.pdf`);
    await fs.writeFile(inputPath, 'totally-not-pdf-content');
    const converter = new PdfToMarkdownConverter();

    const result = await converter.convert(inputPath, path.join(tmpRoot, 'out.md'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not appear to be a valid PDF/);
  });

  it('returns a failed ConversionResult when pdf-parse throws', async () => {
    getTextMock = mock(async () => {
      throw new Error('pdf boom');
    });
    const inputPath = await makeFakePdf();
    const converter = new PdfToMarkdownConverter();

    const result = await converter.convert(inputPath, path.join(tmpRoot, 'out-fail.md'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('pdf boom');
  });
});

describe('PdfToMarkdownConverter.extractMetadata', () => {
  it('returns parsed info on success', async () => {
    const inputPath = await makeFakePdf();
    const converter = new PdfToMarkdownConverter();

    const meta = await converter.extractMetadata(inputPath);
    expect(meta.pages).toBe(2);
    expect(meta.info['Title']).toBe('Doc Title');
  });

  it('returns a safe empty payload when parsing fails', async () => {
    getInfoMock = mock(async () => {
      throw new Error('cannot read');
    });
    const inputPath = await makeFakePdf();
    const converter = new PdfToMarkdownConverter();

    const meta = await converter.extractMetadata(inputPath);
    expect(meta).toEqual({ pages: 0, info: {}, textLength: 0 } as unknown as typeof meta);
  });
});
