// Services API pour communiquer avec le backend Doc2AI

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
} from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_URL;
console.log("API_BASE_URL: ", API_BASE_URL);

class ApiError extends Error {
  public status?: number;
  public data?: any;

  constructor(message: string, status?: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const defaultOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  console.log("fetchApi: Making request to:", url, "with options:", {
    ...defaultOptions,
    ...options,
  });

  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    console.log(
      "fetchApi: Response status:",
      response.status,
      response.statusText,
    );
    const data = await response.json();
    console.log("fetchApi: Response data:", data);

    if (!response.ok) {
      throw new ApiError(
        data.message || "Une erreur est survenue",
        response.status,
        data,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Erreur réseau ou parsing JSON
    throw new ApiError(
      error instanceof Error ? error.message : "Erreur de connexion",
      0,
    );
  }
}

// === Sources API ===

export const sourcesApi = {
  // Récupérer toutes les sources
  getAll: async (): Promise<Source[]> => {
    const response = await fetchApi<ApiResponse<Source[]>>("/sources");
    return response.data;
  },

  // Récupérer une source par ID
  getById: async (id: string): Promise<Source> => {
    const response = await fetchApi<ApiResponse<Source>>(`/sources/${id}`);
    return response.data;
  },

  // Créer une nouvelle source
  create: async (sourceData: CreateSourceRequest): Promise<Source> => {
    console.log("API: Creating source with data:", sourceData);
    console.log("API: Making POST request to:", `${API_BASE_URL}/sources`);
    const response = await fetchApi<ApiResponse<Source>>("/sources", {
      method: "POST",
      body: JSON.stringify(sourceData),
    });
    console.log("API: Create source response:", response);
    return response.data;
  },

  // Mettre à jour une source
  update: async (
    id: string,
    sourceData: Partial<CreateSourceRequest>,
  ): Promise<Source> => {
    const response = await fetchApi<ApiResponse<Source>>(`/sources/${id}`, {
      method: "PUT",
      body: JSON.stringify(sourceData),
    });
    return response.data;
  },

  // Supprimer une source
  delete: async (id: string): Promise<void> => {
    await fetchApi<ApiResponse<null>>(`/sources/${id}`, {
      method: "DELETE",
    });
  },

  // Tester la connexion d'une source
  testConnection: async (id: string): Promise<ConnectionTestResult> => {
    const response = await fetchApi<ApiResponse<ConnectionTestResult>>(
      `/sources/${id}/test`,
      {
        method: "POST",
      },
    );
    return response.data;
  },

  // Tester les identifiants avant création
  testCredentials: async (credentialsData: {
    platform: string;
    credentials: any;
    sourcePath?: string;
    siteUrl?: string;
  }): Promise<ConnectionTestResult> => {
    const response = await fetchApi<ApiResponse<ConnectionTestResult>>(
      `/sources/test-credentials`,
      {
        method: "POST",
        body: JSON.stringify(credentialsData),
      },
    );
    return response.data;
  },

  // Synchroniser une source manuellement
  sync: async (id: string): Promise<void> => {
    await fetchApi<ApiResponse<{ success: boolean; message: string }>>(
      `/sources/${id}/sync`,
      {
        method: "POST",
      },
    );
  },

  // Récupérer les statistiques des sources
  getStats: async (): Promise<SourceStats> => {
    const response = await fetchApi<ApiResponse<SourceStats>>("/sources/stats");
    return response.data;
  },
};

// === Conversions API ===

export const conversionsApi = {
  // Récupérer tous les jobs de conversion
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

    return await fetchApi<PaginatedResponse<ConversionJob>>(
      `/conversions?${params}`,
    );
  },

  // Récupérer un job par ID
  getById: async (id: string): Promise<ConversionJob> => {
    const response = await fetchApi<ApiResponse<ConversionJob>>(
      `/conversions/${id}`,
    );
    return response.data;
  },

  // Créer un job de conversion manuel
  create: async (jobData: {
    sourceId: string;
    fileName: string;
    filePath: string;
    fileSize?: number;
  }): Promise<ConversionJob> => {
    const response = await fetchApi<ApiResponse<ConversionJob>>(
      "/conversions",
      {
        method: "POST",
        body: JSON.stringify(jobData),
      },
    );
    return response.data;
  },

  // Annuler un job
  cancel: async (id: string): Promise<ConversionJob> => {
    const response = await fetchApi<ApiResponse<ConversionJob>>(
      `/conversions/${id}`,
      {
        method: "DELETE",
      },
    );
    return response.data;
  },

  // Relancer un job échoué
  retry: async (id: string): Promise<ConversionJob> => {
    const response = await fetchApi<ApiResponse<ConversionJob>>(
      `/conversions/${id}/retry`,
      {
        method: "POST",
      },
    );
    return response.data;
  },

  // Récupérer la progression d'un job
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
    const response = await fetchApi<ApiResponse<any>>(
      `/conversions/${id}/progress`,
    );
    return response.data;
  },

  // Récupérer les statistiques des conversions
  getStats: async (): Promise<ConversionStats> => {
    const response =
      await fetchApi<ApiResponse<ConversionStats>>("/conversions/stats");
    return response.data;
  },

  // Nettoyer les anciens jobs
  cleanup: async (olderThanDays = 30): Promise<{ deletedCount: number }> => {
    const response = await fetchApi<ApiResponse<{ deletedCount: number }>>(
      "/conversions/cleanup",
      {
        method: "POST",
        body: JSON.stringify({ olderThanDays }),
      },
    );
    return response.data;
  },
};

// === Monitoring API ===

export const monitoringApi = {
  // Récupérer le statut du monitoring
  getStatus: async (): Promise<MonitoringStatus> => {
    const response =
      await fetchApi<ApiResponse<MonitoringStatus>>("/monitoring/status");
    return response.data;
  },

  // Démarrer le monitoring
  start: async (): Promise<void> => {
    await fetchApi<ApiResponse<null>>("/monitoring/start", {
      method: "POST",
    });
  },

  // Arrêter le monitoring
  stop: async (): Promise<void> => {
    await fetchApi<ApiResponse<null>>("/monitoring/stop", {
      method: "POST",
    });
  },

  // Redémarrer le monitoring
  restart: async (): Promise<void> => {
    await fetchApi<ApiResponse<null>>("/monitoring/restart", {
      method: "POST",
    });
  },

  // Récupérer les logs
  getLogs: async (sourceId?: string, limit = 50): Promise<SyncLog[]> => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      ...(sourceId && { sourceId }),
    });

    const response = await fetchApi<ApiResponse<SyncLog[]>>(
      `/monitoring/logs?${params}`,
    );
    return response.data;
  },

  // Synchroniser une source spécifique
  syncSource: async (sourceId: string): Promise<void> => {
    await fetchApi<ApiResponse<null>>(`/monitoring/sync/${sourceId}`, {
      method: "POST",
    });
  },

  // Health check
  healthCheck: async (): Promise<{
    status: string;
    monitoring: boolean;
    activeMonitors: number;
    totalSources: number;
    lastSync?: string;
    timestamp: string;
  }> => {
    const response = await fetchApi<ApiResponse<any>>("/monitoring/health");
    return response.data;
  },
};

// === Health API ===

export const healthApi = {
  // Health check général
  check: async (): Promise<{
    name: string;
    version: string;
    status: string;
    timestamp: string;
    environment: string;
    endpoints: Record<string, string>;
  }> => {
    const response = await fetchApi<any>("/health");
    return response;
  },
};

// Export de l'erreur pour la gestion
export { ApiError };
