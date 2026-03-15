import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import type { FuelEntryCreate, FuelEntry } from '@/types'

const QUEUE_KEY = 'vv_offline_queue'

interface QueueItem {
  id: number
  data: FuelEntryCreate
}

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Persist queue to localStorage
  useEffect(() => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  }, [queue])

  const addToQueue = useCallback((data: FuelEntryCreate) => {
    setQueue((prev) => [...prev, { id: Date.now(), data }])
  }, [])

  const syncQueue = useCallback(async () => {
    if (queue.length === 0) return { synced: 0, failed: 0 }

    let synced = 0
    const failed: QueueItem[] = []

    for (const item of queue) {
      try {
        await api.post<FuelEntry>('/fuel-entries/', item.data)
        synced++
      } catch {
        failed.push(item)
      }
    }

    setQueue(failed)
    return { synced, failed: failed.length }
  }, [queue])

  // Auto-sync when back online
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      syncQueue()
    }
  }, [isOnline, syncQueue, queue.length])

  return { isOnline, queue, addToQueue, syncQueue }
}
