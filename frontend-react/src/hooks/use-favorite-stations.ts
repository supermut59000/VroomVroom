import { useState, useCallback } from 'react'

export interface FavoriteStation {
  id: string
  name: string
  lat: number
  lon: number
}

const STORAGE_KEY = 'vroomvroom-fav-stations'

function load(): Record<string, FavoriteStation> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function save(data: Record<string, FavoriteStation>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function useFavoriteStations() {
  const [favorites, setFavorites] = useState<Record<string, FavoriteStation>>(load)

  const toggle = useCallback((station: FavoriteStation) => {
    setFavorites((prev) => {
      const next = { ...prev }
      if (next[station.id]) {
        delete next[station.id]
      } else {
        next[station.id] = station
      }
      save(next)
      return next
    })
  }, [])

  const isFavorite = useCallback(
    (id: string) => id in favorites,
    [favorites],
  )

  return { favorites, toggle, isFavorite }
}
