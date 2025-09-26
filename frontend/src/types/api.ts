// Types pour l'API Backend Doc2AI

export interface Source {
  id: string;
  name: string;
  platform: "sharepoint" | "googledrive" | "onedrive";
  config: SourceConfig;
  status: "active" | "inactive" | "error";
  lastSync?: string;
  createdAt: string;
  updatedAt: string;
  jobs?: ConversionJob[];
  syncLogs?: SyncLog[];
}

export interface SourceConfig {
  credentials: any; // Chiffré côté backend
  sourcePath: string;
  siteUrl?: string; // Pour SharePoint
  destination: string;
  filters: {
    extensions: string[];
    excludePatterns: string[];
  };
}

export interface CreateSourceRequest {
  name: string;
  platform: "sharepoint" | "googledrive" | "onedrive";
  config: {
    credentials: SharePointCredentials | GoogleDriveCredentials;
    sourcePath: string;
    siteUrl?: string;
    destination: string;
    filters?: {
      extensions?: string[];
      excludePatterns?: string[];
    };
  };
}

export interface SharePointCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

export interface GoogleDriveCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface ConversionJob {
  id: string;
  sourceId: string;
  fileName: string;
  filePath: string;
  outputPath?: string;
  fileSize?: number;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  source?: {
    id: string;
    name: string;
    platform: string;
  };
}

export interface SyncLog {
  id: string;
  sourceId: string;
  action: string;
  status: "success" | "error" | "warning";
  message: string;
  details?: Record<string, any>;
  createdAt: string;
  source?: {
    name: string;
  };
}

export interface MonitoringStatus {
  isRunning: boolean;
  activeMonitors: number;
  totalActiveSources: number;
  lastSync?: string;
  recentLogs: SyncLog[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface SourceStats {
  totalSources: number;
  activeSources: number;
  recentJobs: number;
}

export interface ConversionStats {
  byStatus: Record<string, number>;
  recent: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: {
    platform?: string;
    filesFound?: number;
    authenticated?: boolean;
    user?: string;
    storageUsed?: string;
    error?: any;
  };
}
