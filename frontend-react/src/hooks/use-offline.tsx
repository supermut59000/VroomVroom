import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api'
import {
  isPermanentQueueStatus,
  itemKey,
  migrateItem,
} from '@/lib/offline'
import type {
  QueueItem,
  QueuedPayload,
} from '@/lib/offline'
import type { FuelEntry } from '@/types'

const QUEUE_KEY = 'vv_offline_queue'
const RETRY_DELAY_MS = 60_000
const ESCALATION_THRESHOLD = 3

interface OfflineContextValue {
  isOnline: boolean
  queue: QueueItem[]
  addToQueue: (payload: QueuedPayload) => void
  syncQueue: () => Promise<{ synced: number; failed: number; rejected: number }>
}

const OfflineContext = createContext<OfflineContextValue | null>(null)

function loadQueue(): QueueItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as unknown[]
    return parsed.map((item) => {
      const migrated = migrateItem(item as { id: number; data: unknown })
      if (migrated.payload.kind === 'fuel-create') {
        migrated.payload.data.client_request_id =
          migrated.payload.data.client_request_id ?? crypto.randomUUID()
      }
      return migrated
    })
  } catch {
    return []
  }
}

function describeItem(item: QueueItem): string {
  const p = item.payload
  switch (p.kind) {
    case 'fuel-create':
      return `Plein rejeté (${p.data.liters} L du ${p.data.fueling_date})`
    case 'fuel-update':
      return 'Modification de plein rejetée'
    case 'maintenance-create':
      return `Maintenance rejetée (${p.data.maintenance_type} du ${p.data.maintenance_date})`
    case 'maintenance-update':
      return 'Modification de maintenance rejetée'
  }
}

/** Record the E10 reference price captured at the pump, deduped by date. */
async function captureE10Price(e10Price: number, fuelingDate: string): Promise<void> {
  try {
    const existing = await api.get<{ reference_date: string }[]>('/flexfuel/e10-prices')
    if (existing.some((p) => p.reference_date === fuelingDate)) return
    await api.post('/flexfuel/e10-prices', {
      reference_date: fuelingDate,
      price_per_liter: e10Price,
      notes: 'Auto (hors-ligne)',
    })
  } catch {
    // reference price is a bonus — never block the sync
  }
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queue, setQueue] = useState<QueueItem[]>(loadQueue)
  const isSyncing = useRef(false)
  const initialSyncDone = useRef(false)
  const wasOnline = useRef(isOnline)
  const consecutiveFailures = useRef(0)

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

  const addToQueue = useCallback((payload: QueuedPayload) => {
    if (payload.kind === 'fuel-create') {
      payload.data.client_request_id = payload.data.client_request_id ?? crypto.randomUUID()
    }
    setQueue((prev) => [...prev, { id: Date.now(), payload }])
  }, [])

  const syncQueue = useCallback(async () => {
    if (queue.length === 0 || isSyncing.current) return { synced: 0, failed: 0, rejected: 0 }

    isSyncing.current = true
    let synced = 0
    let rejected = 0
    const transientFailures: QueueItem[] = []

    try {
      for (const item of queue) {
        const p = item.payload
        try {
          switch (p.kind) {
            case 'fuel-create': {
              const { allowOdometerDecrease, e10Price, ...body } = p.data
              await api.post<FuelEntry>(
                `/fuel-entries/${allowOdometerDecrease ? '?allow_odometer_decrease=true' : ''}`,
                body,
              )
              if (e10Price != null) await captureE10Price(e10Price, p.data.fueling_date)
              break
            }
            case 'fuel-update': {
              const { allowOdometerDecrease, ...body } = p.data
              await api.put<FuelEntry>(
                `/fuel-entries/${p.id}${allowOdometerDecrease ? '?allow_odometer_decrease=true' : ''}`,
                body,
              )
              break
            }
            case 'maintenance-create':
              await api.post('/maintenances/', p.data)
              break
            case 'maintenance-update':
              await api.put(`/maintenances/${p.id}`, p.data)
              break
          }
          synced++
        } catch (e) {
          if (e instanceof ApiError && isPermanentQueueStatus(e.status)) {
            rejected++
            toast.error(`${describeItem(item)} : ${e.message}`, { duration: 10000 })
          } else {
            transientFailures.push(item)
          }
        }
      }

      const attempted = new Set(queue.map(itemKey))
      const keep = new Set(transientFailures.map(itemKey))
      setQueue((current) => current.filter((item) => !attempted.has(itemKey(item)) || keep.has(itemKey(item))))
      if (synced > 0) {
        consecutiveFailures.current = 0
        toast.success(`${synced} élément${synced > 1 ? 's' : ''} synchronisé${synced > 1 ? 's' : ''}`)
        for (const key of [
          'fuelEntries', 'allFuelEntries', 'latestFuelEntry', 'fuelStats',
          'consumptionHistory', 'vehicleStats', 'vehicleCostStats',
          'maintenances', 'maintenanceStats', 'e10ReferencePrices', 'flexfuelRentability',
        ]) {
          queryClient.invalidateQueries({ queryKey: [key] })
        }
      } else if (transientFailures.length > 0) {
        consecutiveFailures.current += 1
        // Escalation, not a behavior change: 401/403/429 stay retryable (deliberate
        // decision, 2026-08-14), but after N silent failures the user is told —
        // otherwise a rotated API key or dead server retries forever invisibly.
        if (consecutiveFailures.current === ESCALATION_THRESHOLD) {
          toast.error(
            `${transientFailures.length} élément${transientFailures.length > 1 ? 's' : ''} toujours en attente après ${ESCALATION_THRESHOLD} tentatives — vérifiez le serveur ou la clé API. La synchronisation continue automatiquement.`,
            { duration: 15000 },
          )
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
