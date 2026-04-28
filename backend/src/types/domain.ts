// Domain interfaces for the 4 main entities.
// Intentionally decoupled from the ORM layer — these are the shapes exposed to
// controllers, routes, and converters regardless of what sits below.

export interface SourceConfig {
  credentials?: Record<string, string> | string | null;
  sourcePath?: string;
  destination?: string;
  siteUrl?: string;
  destinations?: string[];
  filters?: {
    extensions?: string[] | Record<string, string>;
    excludePatterns?: string[] | Record<string, string>;
  };
  isOneDrive?: boolean;
}

export interface Source {
  id: string;
  name: string;
  platform: string;
  config: string; // raw JSON string as stored in DB
  status: string;
  lastSync: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Service layer return type when config has been parsed
export type ParsedSource = Omit<Source, 'config'> & { config: SourceConfig };

export interface ConversionJob {
  id: string;
  sourceId: string;
  fileName: string;
  filePath: string;
  outputPath: string | null;
  fileSize: number | null;
  status: string;
  progress: number;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface SyncLog {
  id: string;
  sourceId: string;
  action: string;
  status: string;
  message: string;
  details: string | null;
  createdAt: Date;
  source?: { name: string; platform?: string };
}

export interface ConvertedFile {
  id: string;
  originalPath: string;
  convertedPath: string;
  fileName: string;
  fileType: string;
  platform: string;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
}

// File info returned by drive connectors
export interface FileInfo {
  id: string;
  name: string;
  path: string;
  size: number;
  modifiedTime: Date;
  checksum: string | null;
  mimeType: string | null;
  platform: string;
}

// Result returned by DriveConnector.testConnection()
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// Result returned by converter.convert()
export interface ConversionResult {
  success: boolean;
  message?: string;
  checksum?: string;
  error?: string;
  warnings?: number;
  stats?: Record<string, unknown>;
  details?: Record<string, unknown>;
}
