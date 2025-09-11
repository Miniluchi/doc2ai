import { useState, useEffect, useCallback } from 'react'
import { sourcesApi, ApiError } from '../services/api'
import type { Source, CreateSourceRequest, SourceStats } from '../types/api'

export function useSources() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSources = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await sourcesApi.getAll()
      setSources(data)
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Erreur lors du chargement des sources'
      setError(errorMessage)
      console.error('Error fetching sources:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const createSource = useCallback(async (sourceData: CreateSourceRequest): Promise<Source> => {
    try {
      const newSource = await sourcesApi.create(sourceData)
      setSources(prev => [...prev, newSource])
      return newSource
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Erreur lors de la création de la source'
      throw new Error(errorMessage)
    }
  }, [])

  const updateSource = useCallback(async (id: string, sourceData: Partial<CreateSourceRequest>): Promise<Source> => {
    try {
      const updatedSource = await sourcesApi.update(id, sourceData)
      setSources(prev => prev.map(source => source.id === id ? updatedSource : source))
      return updatedSource
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Erreur lors de la mise à jour de la source'
      throw new Error(errorMessage)
    }
  }, [])

  const deleteSource = useCallback(async (id: string): Promise<void> => {
    try {
      await sourcesApi.delete(id)
      setSources(prev => prev.filter(source => source.id !== id))
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Erreur lors de la suppression de la source'
      throw new Error(errorMessage)
    }
  }, [])

  const testConnection = useCallback(async (id: string) => {
    try {
      const result = await sourcesApi.testConnection(id)
      // Optionnel: rafraîchir les sources après le test
      await fetchSources()
      return result
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Erreur lors du test de connexion'
      throw new Error(errorMessage)
    }
  }, [fetchSources])

  const syncSource = useCallback(async (id: string): Promise<void> => {
    try {
      await sourcesApi.sync(id)
      // Rafraîchir les sources après la sync
      await fetchSources()
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Erreur lors de la synchronisation'
      throw new Error(errorMessage)
    }
  }, [fetchSources])

  useEffect(() => {
    fetchSources()
  }, [fetchSources])

  return {
    sources,
    loading,
    error,
    refetch: fetchSources,
    createSource,
    updateSource,
    deleteSource,
    testConnection,
    syncSource,
  }
}

export function useSourceStats() {
  const [stats, setStats] = useState<SourceStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await sourcesApi.getStats()
      setStats(data)
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Erreur lors du chargement des statistiques'
      setError(errorMessage)
      console.error('Error fetching source stats:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  }
}

export function useSource(id: string | null) {
  const [source, setSource] = useState<Source | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSource = useCallback(async () => {
    if (!id) {
      setSource(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await sourcesApi.getById(id)
      setSource(data)
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Erreur lors du chargement de la source'
      setError(errorMessage)
      console.error('Error fetching source:', err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchSource()
  }, [fetchSource])

  return {
    source,
    loading,
    error,
    refetch: fetchSource,
  }
}