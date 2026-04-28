import { useState, useEffect, useCallback, useRef } from 'react';
import { sourcesApi, ApiError } from '../services/api';
import type { Source, CreateSourceRequest, SourceStats } from '../types/api';
import { useServerEvents } from './useServerEvents';

const SOURCE_REFRESH_EVENTS = new Set([
  'sync.completed',
  'sync.failed',
  'source.created',
  'source.updated',
  'source.deleted',
]);

/**
 * Mutation-only hook for components that need to act on sources but don't
 * render the full list. Doesn't fetch, doesn't subscribe to SSE — keep this
 * as light as possible since it's used per-card.
 */
export function useSourceActions() {
  const createSource = useCallback(async (sourceData: CreateSourceRequest): Promise<Source> => {
    try {
      return await sourcesApi.create(sourceData);
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Failed to create source';
      throw new Error(errorMessage);
    }
  }, []);

  const updateSource = useCallback(
    async (id: string, sourceData: Partial<CreateSourceRequest>): Promise<Source> => {
      try {
        return await sourcesApi.update(id, sourceData);
      } catch (err) {
        const errorMessage = err instanceof ApiError ? err.message : 'Failed to update source';
        throw new Error(errorMessage);
      }
    },
    [],
  );

  const deleteSource = useCallback(async (id: string): Promise<void> => {
    try {
      await sourcesApi.delete(id);
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Failed to delete source';
      throw new Error(errorMessage);
    }
  }, []);

  const testConnection = useCallback(async (id: string) => {
    try {
      return await sourcesApi.testConnection(id);
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Failed to test connection';
      throw new Error(errorMessage);
    }
  }, []);

  const syncSource = useCallback(async (id: string): Promise<void> => {
    try {
      await sourcesApi.sync(id);
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Failed to sync';
      throw new Error(errorMessage);
    }
  }, []);

  return { createSource, updateSource, deleteSource, testConnection, syncSource };
}

export function useSources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const actions = useSourceActions();

  const fetchSources = useCallback(async () => {
    try {
      if (!hasFetched.current) setLoading(true);
      setError(null);
      const data = await sourcesApi.getAll();
      setSources(data);
      hasFetched.current = true;
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Failed to load sources';
      setError(errorMessage);
      console.error('Error fetching sources:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  useServerEvents((event) => {
    if (SOURCE_REFRESH_EVENTS.has(event.type)) {
      fetchSources();
    }
  });

  return {
    sources,
    loading,
    error,
    refetch: fetchSources,
    ...actions,
  };
}

export function useSourceStats() {
  const [stats, setStats] = useState<SourceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await sourcesApi.getStats();
      setStats(data);
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Failed to load statistics';
      setError(errorMessage);
      console.error('Error fetching source stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useServerEvents((event) => {
    if (SOURCE_REFRESH_EVENTS.has(event.type)) {
      fetchStats();
    }
  });

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  };
}

export function useSource(id: string | null) {
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSource = useCallback(async () => {
    if (!id) {
      setSource(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await sourcesApi.getById(id);
      setSource(data);
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Failed to load source';
      setError(errorMessage);
      console.error('Error fetching source:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSource();
  }, [fetchSource]);

  return {
    source,
    loading,
    error,
    refetch: fetchSource,
  };
}
