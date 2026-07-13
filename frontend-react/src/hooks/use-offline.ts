import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import type { FuelEntryCreate, FuelEntry } from '@/types'

const QUEUE_KEY = 'vv_offline_queue'

/** Queued payload — allowOdometerDecrease is a client-side flag mapped to the
 *  backend's ?allow_odometer_decrease query param at sync time. */
export type QueuedFuelEntry = FuelEntryCreate & { allowOdometerDecrease?: boolean }

interface QueueItem {
  id: number
  data: QueuedFuelEntry
}

export function useOffline() {
  const queryClient = useQueryClient()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
    } catch {
      return []
    }
  })
  // Prevents concurrent sync runs (e.g. re-render during an in-flight sync,
  // or two tabs coming online at the same time and racing over localStorage).
  const isSyncing = useRef(false)

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

  const addToQueue = useCallback((data: QueuedFuelEntry) => {
    setQueue((prev) => [...prev, { id: Date.now(), data }])
  }, [])

  const syncQueue = useCallback(async () => {
    if (queue.length === 0 || isSyncing.current) return { synced: 0, failed: 0, rejected: 0 }

    isSyncing.current = true
    let synced = 0
    let rejected = 0
    const transientFailures: QueueItem[] = []

    for (const item of queue) {
      const { allowOdometerDecrease, ...body } = item.data
      try {
        await api.post<FuelEntry>(
          `/fuel-entries/${allowOdometerDecrease ? '?allow_odometer_decrease=true' : ''}`,
          body,
        )
        synced++
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
          // Permanent rejection (validation) — retrying forever can never
          // succeed. Drop it from the queue and tell the user what was lost.
          rejected++
          toast.error(
            `Plein rejeté (${item.data.liters} L du ${item.data.fueling_date}) : ${e.message}`,
            { duration: 10000 },
          )
        } else {
          // Network/timeout/5xx — keep it, retry on next reconnect
          transientFailures.push(item)
        }
      }
    }

    isSyncing.current = false
    setQueue(transientFailures)
    if (synced > 0) {
      toast.success(`${synced} plein${synced > 1 ? 's' : ''} synchronisé${synced > 1 ? 's' : ''}`)
      // Prefix invalidation (no vehicle id) — refresh every vehicle's data
      for (const key of [
        'fuelEntries', 'allFuelEntries', 'latestFuelEntry', 'fuelStats',
        'consumptionHistory', 'vehicleStats', 'vehicleCostStats',
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    }
    return { synced, failed: transientFailures.length, rejected }
  }, [queue, queryClient])

  // Auto-sync when back online
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      syncQueue()
    }
  }, [isOnline, syncQueue, queue.length])

  return { isOnline, queue, addToQueue, syncQueue }
}
