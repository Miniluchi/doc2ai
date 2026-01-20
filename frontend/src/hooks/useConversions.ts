import { useState, useEffect, useCallback } from "react";
import { conversionsApi, ApiError } from "../services/api";
import type {
  ConversionJob,
  ConversionStats,
  PaginatedResponse,
} from "../types/api";

export function useConversions(page = 1, limit = 20, status?: string) {
  const [data, setData] = useState<PaginatedResponse<ConversionJob> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await conversionsApi.getAll(page, limit, status);
      setData(response);
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : "Erreur lors du chargement des conversions";
      setError(errorMessage);
      console.error("Error fetching conversions:", err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, status]);

  const cancelJob = useCallback(
    async (id: string): Promise<ConversionJob> => {
      try {
        const cancelledJob = await conversionsApi.cancel(id);
        await fetchConversions(); // Rafraîchir la liste
        return cancelledJob;
      } catch (err) {
        const errorMessage =
          err instanceof ApiError
            ? err.message
            : "Erreur lors de l'annulation du job";
        throw new Error(errorMessage);
      }
    },
    [fetchConversions],
  );

  const retryJob = useCallback(
    async (id: string): Promise<ConversionJob> => {
      try {
        const retriedJob = await conversionsApi.retry(id);
        await fetchConversions(); // Rafraîchir la liste
        return retriedJob;
      } catch (err) {
        const errorMessage =
          err instanceof ApiError
            ? err.message
            : "Erreur lors de la relance du job";
        throw new Error(errorMessage);
      }
    },
    [fetchConversions],
  );

  useEffect(() => {
    fetchConversions();
  }, [fetchConversions]);

  return {
    jobs: data?.data || [],
    pagination: data?.pagination || null,
    loading,
    error,
    refetch: fetchConversions,
    cancelJob,
    retryJob,
  };
}

export function useConversionStats() {
  const [stats, setStats] = useState<ConversionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await conversionsApi.getStats();
      setStats(data);
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : "Erreur lors du chargement des statistiques";
      setError(errorMessage);
      console.error("Error fetching conversion stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  };
}

export function useJobProgress(jobId: string | null, pollingInterval = 2000) {
  const [progress, setProgress] = useState<{
    id: string;
    status: string;
    progress: number;
    error?: string;
    startedAt?: string;
    completedAt?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!jobId) {
      setProgress(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await conversionsApi.getProgress(jobId);
      setProgress(data);
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : "Erreur lors du chargement de la progression";
      setError(errorMessage);
      console.error("Error fetching job progress:", err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) {
      setProgress(null);
      return;
    }

    // Fetch initial progress
    fetchProgress();

    // Set up polling if job is in progress
    const interval = setInterval(() => {
      if (progress?.status === "processing" || progress?.status === "pending") {
        fetchProgress();
      }
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [jobId, fetchProgress, pollingInterval, progress?.status]);

  return {
    progress,
    loading,
    error,
    refetch: fetchProgress,
  };
}
