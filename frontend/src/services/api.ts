import type {
  ApiResponse,
  ConnectionTestResult,
  ConversionJob,
  ConversionStats,
  CreateSourceRequest,
  MonitoringStatus,
  PaginatedResponse,
  Source,
  SourceStats,
  SyncLog,
} from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_URL;
console.log('API_BASE_URL: ', API_BASE_URL);

/** Custom event dispatched when Google OAuth token is expired/revoked */
export const GOOGLE_TOKEN_EXPIRED_EVENT = 'google-auth-expired';

class ApiError extends Error {
  public status?: number;
  public data?: any;

  constructor(message: string, status?: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  console.log('fetchApi: Making request to:', url, 'with options:', {
    ...defaultOptions,
    ...options,
  });

  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    console.log('fetchApi: Response status:', response.status, response.statusText);
    const data = await response.json();
    console.log('fetchApi: Response data:', data);

    if (!response.ok) {
      if (response.status === 401 && data.code === 'TOKEN_EXPIRED') {
        window.dispatchEvent(new CustomEvent(GOOGLE_TOKEN_EXPIRED_EVENT));
      }

      throw new ApiError(data.message || 'An error occurred', response.status, data);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(error instanceof Error ? error.message : 'Connection error', 0);
  }
}

// === Sources API ===

export const sourcesApi = {
  getAll: async (): Promise<Source[]> => {
    const response = await fetchApi<ApiResponse<Source[]>>('/sources');
    return response.data;
  },

  getById: async (id: string): Promise<Source> => {
    const response = await fetchApi<ApiResponse<Source>>(`/sources/${id}`);
    return response.data;
  },

  create: async (sourceData: CreateSourceRequest): Promise<Source> => {
    console.log('API: Creating source with data:', sourceData);
    console.log('API: Making POST request to:', `${API_BASE_URL}/sources`);
    const response = await fetchApi<ApiResponse<Source>>('/sources', {
      method: 'POST',
      body: JSON.stringify(sourceData),
    });
    console.log('API: Create source response:', response);
    return response.data;
  },

  update: async (id: string, sourceData: Partial<CreateSourceRequest>): Promise<Source> => {
    const response = await fetchApi<ApiResponse<Source>>(`/sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(sourceData),
    });
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await fetchApi<ApiResponse<null>>(`/sources/${id}`, {
      method: 'DELETE',
    });
  },

  testConnection: async (id: string): Promise<ConnectionTestResult> => {
    const response = await fetchApi<ApiResponse<ConnectionTestResult>>(`/sources/${id}/test`, {
      method: 'POST',
    });
    return response.data;
  },

  testCredentials: async (credentialsData: {
    platform: string;
    credentials: any;
    sourcePath?: string;
    siteUrl?: string;
  }): Promise<ConnectionTestResult> => {
    const response = await fetchApi<ApiResponse<ConnectionTestResult>>(
      `/sources/test-credentials`,
      {
        method: 'POST',
        body: JSON.stringify(credentialsData),
      },
    );
    return response.data;
  },

  sync: async (id: string): Promise<void> => {
    await fetchApi<ApiResponse<{ success: boolean; message: string }>>(`/sources/${id}/sync`, {
      method: 'POST',
    });
  },

  getStats: async (): Promise<SourceStats> => {
    const response = await fetchApi<ApiResponse<SourceStats>>('/sources/stats');
    return response.data;
  },

  getGoogleDriveFolders: async (
    parentId: string,
    credentials: { clientId: string; clientSecret: string; refreshToken: string },
  ): Promise<any[]> => {
    const response = await fetchApi<ApiResponse<any[]>>(
      `/sources/google-drive/folders?parent_id=${encodeURIComponent(parentId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ credentials }),
      },
    );
    return response.data;
  },

  previewGoogleDriveFiles: async (
    folderId: string,
    credentials: { clientId: string; clientSecret: string; refreshToken: string },
    extensions: string[],
  ): Promise<{ totalFiles: number; convertibleFiles: number; files: any[] }> => {
    const response = await fetchApi<
      ApiResponse<{ totalFiles: number; convertibleFiles: number; files: any[] }>
    >('/sources/google-drive/preview-files', {
      method: 'POST',
      body: JSON.stringify({ folder_id: folderId, credentials, extensions }),
    });
    return response.data;
  },
};

// === Conversions API ===

export const conversionsApi = {
  getAll: async (
    page = 1,
    limit = 20,
    status?: string,
  ): Promise<PaginatedResponse<ConversionJob>> => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(status && { status }),
    });

    return await fetchApi<PaginatedResponse<ConversionJob>>(`/conversions?${params}`);
  },

  getById: async (id: string): Promise<ConversionJob> => {
    const response = await fetchApi<ApiResponse<ConversionJob>>(`/conversions/${id}`);
    return response.data;
  },

  create: async (jobData: {
    sourceId: string;
    fileName: string;
    filePath: string;
    fileSize?: number;
  }): Promise<ConversionJob> => {
    const response = await fetchApi<ApiResponse<ConversionJob>>('/conversions', {
      method: 'POST',
      body: JSON.stringify(jobData),
    });
    return response.data;
  },

  cancel: async (id: string): Promise<ConversionJob> => {
    const response = await fetchApi<ApiResponse<ConversionJob>>(`/conversions/${id}`, {
      method: 'DELETE',
    });
    return response.data;
  },

  retry: async (id: string): Promise<ConversionJob> => {
    const response = await fetchApi<ApiResponse<ConversionJob>>(`/conversions/${id}/retry`, {
      method: 'POST',
    });
    return response.data;
  },

  getProgress: async (
    id: string,
  ): Promise<{
    id: string;
    status: string;
    progress: number;
    error?: string;
    startedAt?: string;
    completedAt?: string;
  }> => {
    const response = await fetchApi<ApiResponse<any>>(`/conversions/${id}/progress`);
    return response.data;
  },

  getStats: async (): Promise<ConversionStats> => {
    const response = await fetchApi<ApiResponse<ConversionStats>>('/conversions/stats');
    return response.data;
  },

  cleanup: async (olderThanDays = 30): Promise<{ deletedCount: number }> => {
    const response = await fetchApi<ApiResponse<{ deletedCount: number }>>('/conversions/cleanup', {
      method: 'POST',
      body: JSON.stringify({ olderThanDays }),
    });
    return response.data;
  },
};

// === Monitoring API ===

export const monitoringApi = {
  getStatus: async (): Promise<MonitoringStatus> => {
    const response = await fetchApi<ApiResponse<MonitoringStatus>>('/monitoring/status');
    return response.data;
  },

  start: async (): Promise<void> => {
    await fetchApi<ApiResponse<null>>('/monitoring/start', {
      method: 'POST',
    });
  },

  stop: async (): Promise<void> => {
    await fetchApi<ApiResponse<null>>('/monitoring/stop', {
      method: 'POST',
    });
  },

  restart: async (): Promise<void> => {
    await fetchApi<ApiResponse<null>>('/monitoring/restart', {
      method: 'POST',
    });
  },

  getLogs: async (sourceId?: string, limit = 50): Promise<SyncLog[]> => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      ...(sourceId && { sourceId }),
    });

    const response = await fetchApi<ApiResponse<SyncLog[]>>(`/monitoring/logs?${params}`);
    return response.data;
  },

  syncSource: async (sourceId: string): Promise<void> => {
    await fetchApi<ApiResponse<null>>(`/monitoring/sync/${sourceId}`, {
      method: 'POST',
    });
  },

  healthCheck: async (): Promise<{
    status: string;
    monitoring: boolean;
    activeMonitors: number;
    totalSources: number;
    lastSync?: string;
    timestamp: string;
  }> => {
    const response = await fetchApi<ApiResponse<any>>('/monitoring/health');
    return response.data;
  },
};

// === Health API ===

export const healthApi = {
  check: async (): Promise<{
    name: string;
    version: string;
    status: string;
    timestamp: string;
    environment: string;
    endpoints: Record<string, string>;
  }> => {
    const response = await fetchApi<any>('/health');
    return response;
  },
};

export { ApiError };
