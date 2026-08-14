import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import { isPermanentQueueStatus } from '@/lib/offline'
import type { FuelEntryCreate, FuelEntry } from '@/types'

const QUEUE_KEY = 'vv_offline_queue'
const RETRY_DELAY_MS = 60_000

/** Queued payload — allowOdometerDecrease is a client-side flag mapped to the
 * backend's query parameter at sync time. client_request_id makes retries
 * idempotent without conflating legitimate same-odometer blend fills. */
export type QueuedFuelEntry = FuelEntryCreate & { allowOdometerDecrease?: boolean }

interface QueueItem {
  id: number
  data: QueuedFuelEntry
}

interface OfflineContextValue {
  isOnline: boolean
  queue: QueueItem[]
  addToQueue: (data: QueuedFuelEntry) => void
  syncQueue: () => Promise<{ synced: number; failed: number; rejected: number }>
}

const OfflineContext = createContext<OfflineContextValue | null>(null)

function loadQueue(): QueueItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueueItem[]
    return parsed.map((item) => ({
      ...item,
      data: {
        ...item.data,
        client_request_id: item.data.client_request_id ?? crypto.randomUUID(),
      },
    }))
  } catch {
    return []
  }
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queue, setQueue] = useState<QueueItem[]>(loadQueue)
  const isSyncing = useRef(false)
  const initialSyncDone = useRef(false)
  const wasOnline = useRef(isOnline)

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

  useEffect(() => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  }, [queue])

  const addToQueue = useCallback((data: QueuedFuelEntry) => {
    const queued = {
      ...data,
      client_request_id: data.client_request_id ?? crypto.randomUUID(),
    }
    setQueue((prev) => [...prev, { id: Date.now(), data: queued }])
  }, [])

  const syncQueue = useCallback(async () => {
    if (queue.length === 0 || isSyncing.current) return { synced: 0, failed: 0, rejected: 0 }

    isSyncing.current = true
    let synced = 0
    let rejected = 0
    const transientFailures: QueueItem[] = []

    try {
      for (const item of queue) {
        const { allowOdometerDecrease, ...body } = item.data
        try {
          await api.post<FuelEntry>(
            `/fuel-entries/${allowOdometerDecrease ? '?allow_odometer_decrease=true' : ''}`,
            body,
          )
          synced++
        } catch (e) {
          if (e instanceof ApiError && isPermanentQueueStatus(e.status)) {
            rejected++
            toast.error(
              `Plein rejeté (${item.data.liters} L du ${item.data.fueling_date}) : ${e.message}`,
              { duration: 10000 },
            )
          } else {
            transientFailures.push(item)
          }
        }
      }

      const attempted = new Set(queue.map((item) => item.data.client_request_id))
      const keep = new Set(transientFailures.map((item) => item.data.client_request_id))
      setQueue((current) => current.filter(
        (item) => !attempted.has(item.data.client_request_id) || keep.has(item.data.client_request_id),
      ))
      if (synced > 0) {
        toast.success(`${synced} plein${synced > 1 ? 's' : ''} synchronisé${synced > 1 ? 's' : ''}`)
        for (const key of [
          'fuelEntries', 'allFuelEntries', 'latestFuelEntry', 'fuelStats',
          'consumptionHistory', 'vehicleStats', 'vehicleCostStats',
        ]) {
          queryClient.invalidateQueries({ queryKey: [key] })
        }
      }
      return { synced, failed: transientFailures.length, rejected }
    } finally {
      isSyncing.current = false
    }
  }, [queue, queryClient])

  // One initial recovery attempt after a reload. The ref also prevents React
  // StrictMode's development effect replay from submitting twice.
  useEffect(() => {
    if (initialSyncDone.current) return
    initialSyncDone.current = true
    if (isOnline && queue.length > 0) void syncQueue()
  }, [isOnline, queue.length, syncQueue])

  // Reconnects retry immediately; ordinary server outages retry with a delay
  // instead of looping after every unchanged setQueue().
  useEffect(() => {
    if (isOnline && !wasOnline.current && queue.length > 0) void syncQueue()
    wasOnline.current = isOnline
  }, [isOnline, queue.length, syncQueue])

  useEffect(() => {
    if (!isOnline || queue.length === 0) return
    const timer = window.setTimeout(() => void syncQueue(), RETRY_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [isOnline, queue.length, syncQueue])

  return (
    <OfflineContext.Provider value={{ isOnline, queue, addToQueue, syncQueue }}>
      {children}
    </OfflineContext.Provider>
  )
}

export function useOffline() {
  const context = useContext(OfflineContext)
  if (!context) throw new Error('useOffline must be used inside OfflineProvider')
  return context
}
