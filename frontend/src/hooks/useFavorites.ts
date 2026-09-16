import { useCallback, useEffect, useState } from 'react'
import type { SavedFavorite, SavedSearch, ScanRequest, TripResponse } from '../types'
import {
  deleteFavorite,
  deleteSearch,
  getFavorites,
  getSavedSearches,
  saveFavorite,
  saveSearch,
} from '../utils/storage'

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const list = await getSavedSearches(force)
      setSearches(list)
    } finally {
      setLoading(false)
    }
  }, [])

  const create = useCallback(
    async (payload: Omit<SavedSearch, 'id' | 'createdAt'>) => {
      const saved = await saveSearch(payload)
      await refresh(true)
      return saved
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      await deleteSearch(id)
      await refresh(true)
    },
    [refresh]
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { searches, loading, refresh, create, remove, setSearches }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<SavedFavorite[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const list = await getFavorites(force)
      setFavorites(list)
    } finally {
      setLoading(false)
    }
  }, [])

  const add = useCallback(
    async (trip: TripResponse, searchRequest: ScanRequest) => {
      const fav = await saveFavorite(trip, searchRequest)
      await refresh(true)
      return fav
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      await deleteFavorite(id)
      await refresh(true)
    },
    [refresh]
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { favorites, loading, refresh, add, remove, setFavorites }
}
