import { useCallback, useEffect, useState } from "react";
import { ApiError, monitoringApi } from "../services/api";
import type { MonitoringStatus, SyncLog } from "../types/api";

export function useMonitoring() {
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await monitoringApi.getStatus();
      setStatus(data);
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : "Failed to load status";
      setError(errorMessage);
      console.error("Error fetching monitoring status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const startMonitoring = useCallback(async (): Promise<void> => {
    try {
      await monitoringApi.start();
      await fetchStatus();
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : "Failed to start monitoring";
      throw new Error(errorMessage);
    }
  }, [fetchStatus]);

  const stopMonitoring = useCallback(async (): Promise<void> => {
    try {
      await monitoringApi.stop();
      await fetchStatus();
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : "Failed to stop monitoring";
      throw new Error(errorMessage);
    }
  }, [fetchStatus]);

  const restartMonitoring = useCallback(async (): Promise<void> => {
    try {
      await monitoringApi.restart();
      await fetchStatus();
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : "Failed to restart monitoring";
      throw new Error(errorMessage);
    }
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
    startMonitoring,
    stopMonitoring,
    restartMonitoring,
  };
}

export function useLogs(sourceId?: string, limit = 50) {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await monitoringApi.getLogs(sourceId, limit);
      setLogs(data);
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : "Failed to load logs";
      setError(errorMessage);
      console.error("Error fetching logs:", err);
    } finally {
      setLoading(false);
    }
  }, [sourceId, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    loading,
    error,
    refetch: fetchLogs,
  };
}

export function useHealthCheck() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await monitoringApi.healthCheck();
      setHealth(data);
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : "Failed to check health";
      setError(errorMessage);
      console.error("Error fetching health status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();

    const interval = setInterval(fetchHealth, 30000);

    return () => clearInterval(interval);
  }, [fetchHealth]);

  return {
    health,
    loading,
    error,
    refetch: fetchHealth,
  };
}
