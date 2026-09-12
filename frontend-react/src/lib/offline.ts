import type {
  FuelEntryCreate,
  FuelEntryUpdate,
  MaintenanceCreate,
  MaintenanceUpdate,
} from '@/types'

export const isPermanentQueueStatus = (status: number) =>
  [400, 404, 409, 422].includes(status)

/** Fuel create — allowOdometerDecrease maps to the backend's query parameter at
 * sync time; client_request_id makes retries idempotent without conflating
 * legitimate same-odometer blend fills. e10Price (if any) is captured at the
 * pump and recorded as an E10 reference once the fill syncs. */
export type QueuedFuelCreate = FuelEntryCreate & {
  allowOdometerDecrease?: boolean
  e10Price?: number | null
}

export type QueuedFuelUpdate = FuelEntryUpdate & { allowOdometerDecrease?: boolean }

export type QueuedPayload =
  | { kind: 'fuel-create'; data: QueuedFuelCreate }
  | { kind: 'fuel-update'; id: number; vehicleId: number; data: QueuedFuelUpdate }
  | { kind: 'maintenance-create'; data: MaintenanceCreate }
  | { kind: 'maintenance-update'; id: number; vehicleId: number; data: MaintenanceUpdate }

export interface QueueItem {
  id: number
  payload: QueuedPayload
}

/** Vehicle a queued item belongs to (updates carry it for the per-vehicle badge). */
export function payloadVehicleId(payload: QueuedPayload): number | null {
  switch (payload.kind) {
    case 'fuel-create':
      return payload.data.vehicle_id
    case 'fuel-update':
    case 'maintenance-update':
      return payload.vehicleId
    case 'maintenance-create':
      return payload.data.vehicle_id
  }
}

/** Stable identity per queue item for the sync dedup (client_request_id for
 * fuel creates — survives cross-tab/reload duplication — the queue id otherwise). */
export function itemKey(item: QueueItem): string {
  return item.payload.kind === 'fuel-create' && item.payload.data.client_request_id
    ? item.payload.data.client_request_id
    : `k${item.id}`
}

/** Item as stored in localStorage: current format `{id, payload}`, or the
 * legacy pre-discriminated format `{id, data}` (data = fuel-create fields). */
export interface StoredQueueItem {
  id: number
  payload?: unknown
  data?: unknown
}

/** Items queued before the discriminated-payload format had no `kind` (and
 * were stored as `{id, data}`) — migrate them rather than dropping a user's
 * offline fills. Must accept BOTH stored shapes: passing a current-format
 * item through the legacy-only read used to wipe the whole queue on refresh
 * (payload.data === undefined → TypeError → empty queue persisted back). */
export function migrateItem(item: StoredQueueItem): QueueItem {
  const data = item.payload !== undefined ? item.payload : item.data
  if (typeof data === 'object' && data !== null && 'kind' in data) {
    return { id: item.id, payload: data as QueuedPayload }
  }
  return { id: item.id, payload: { kind: 'fuel-create', data: data as QueuedFuelCreate } }
}

export const QUEUE_KEY = 'vv_offline_queue'

/** Read the persisted queue. One corrupt entry must never drop the rest —
 * the old all-or-nothing catch wiped every queued fill on a single bad item. */
export function loadQueue(): QueueItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((item) => {
    try {
      const it = item as StoredQueueItem
      if (typeof it?.id !== 'number') return []
      const migrated = migrateItem(it)
      if (migrated.payload.kind === 'fuel-create') {
        if (migrated.payload.data == null) return []
        migrated.payload.data.client_request_id =
          migrated.payload.data.client_request_id ?? crypto.randomUUID()
      }
      return [migrated]
    } catch {
      return []
    }
  })
}
