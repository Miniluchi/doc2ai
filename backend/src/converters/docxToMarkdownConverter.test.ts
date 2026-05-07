import { describe, it, expect, mock, beforeAll, beforeEach, afterAll } from 'bun:test';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import type { ConversionResult } from '../types/domain.js';

const tmpRoot = path.join(os.tmpdir(), `doc2ai-docx-${Date.now()}`);

let convertToMarkdownMock = mock(async () => ({
  value: '# Hello\n\nWorld',
  messages: [] as Array<{ type: string; message: string }>,
}));

const mammothStub = {
  convertToHtml: mock(async () => ({ value: '<p>x</p>', messages: [] })),
  convertToMarkdown: (...args: unknown[]) => convertToMarkdownMock(...(args as [])),
  images: {
    imgElement: () => ({ __mammothBrand: 'ImageConverter' }),
  },
};

let DocxToMarkdownConverter: new () => {
  convert(input: string, output: string): Promise<ConversionResult>;
};
let originalMammoth: unknown;

beforeAll(async () => {
  originalMammoth = await import('mammoth');
  mock.module('mammoth', () => ({ ...mammothStub, default: mammothStub }));
  ({ default: DocxToMarkdownConverter } = (await import('./docxToMarkdownConverter.js')) as {
    default: new () => { convert(input: string, output: string): Promise<ConversionResult> };
  });
});

afterAll(async () => {
  mock.module('mammoth', () => originalMammoth);
  await fs.remove(tmpRoot);
});

beforeEach(() => {
  convertToMarkdownMock = mock(async () => ({
    value: '# Heading\n\n* item one\n* item two',
    messages: [],
  }));
});

async function makeFakeDocx(): Promise<string> {
  await fs.ensureDir(tmpRoot);
  const filePath = path.join(tmpRoot, `${Math.random().toString(36).slice(2)}.docx`);
  const header = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  await fs.writeFile(filePath, Buffer.concat([header, Buffer.from('payload-bytes')]));
  return filePath;
}

describe('DocxToMarkdownConverter.convert', () => {
  it('returns success with checksum for a valid DOCX', async () => {
    const inputPath = await makeFakeDocx();
    const outputPath = path.join(tmpRoot, 'out', `${Date.now()}.md`);
    const converter = new DocxToMarkdownConverter();

    const result = await converter.convert(inputPath, outputPath);

    expect(result.success).toBe(true);
    expect(typeof result.checksum).toBe('string');
    expect(await fs.readFile(outputPath, 'utf8')).toContain('# Heading');
  });

  it('includes warning count in stats when mammoth reports messages', async () => {
    convertToMarkdownMock = mock(async () => ({
      value: '# X',
      messages: [{ type: 'warning', message: 'unknown style' }],
    }));
    const inputPath = await makeFakeDocx();
    const outputPath = path.join(tmpRoot, 'out', `${Date.now()}-warn.md`);
    const converter = new DocxToMarkdownConverter();

    const result = await converter.convert(inputPath, outputPath);

    expect(result.success).toBe(true);
    expect(result.warnings).toBe(1);
    expect((result.stats as { warningsCount: number }).warningsCount).toBe(1);
  });

  it('returns a failed ConversionResult when mammoth throws', async () => {
    convertToMarkdownMock = mock(async () => {
      throw new Error('mammoth boom');
    });
    const inputPath = await makeFakeDocx();
    const outputPath = path.join(tmpRoot, 'out', `${Date.now()}-fail.md`);
    const converter = new DocxToMarkdownConverter();

    const result = await converter.convert(inputPath, outputPath);

    expect(result.success).toBe(false);
    expect(result.error).toContain('mammoth boom');
  });

  it('rejects unsupported extensions during validation', async () => {
    const inputPath = path.join(tmpRoot, `${Date.now()}.txt`);
    await fs.ensureDir(tmpRoot);
    await fs.writeFile(inputPath, 'hello');
    const converter = new DocxToMarkdownConverter();

    const result = await converter.convert(inputPath, path.join(tmpRoot, 'out.md'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unsupported extension/);
  });

  it('rejects when input file is missing', async () => {
    const converter = new DocxToMarkdownConverter();
    const result = await converter.convert(
      path.join(tmpRoot, 'does-not-exist.docx'),
      path.join(tmpRoot, 'never.md'),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist/);
  });
});
