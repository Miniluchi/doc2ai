// Type shims for libraries without bundled declarations or whose published
// types do not match the API actually used in this codebase.

// pdf-parse v2.x uses a class-based API not covered by @types/pdf-parse (v1.x).
declare module 'pdf-parse' {
  export class PDFParse {
    constructor(options: { data: Buffer });
    getText(): Promise<{ text: string; total: number }>;
    getInfo(): Promise<{ total: number; info: Record<string, unknown> }>;
    destroy(): Promise<void>;
  }
}
