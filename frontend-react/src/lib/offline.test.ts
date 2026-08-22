import { describe, expect, it } from 'vitest'
import { isPermanentQueueStatus } from '@/lib/offline'

describe('isPermanentQueueStatus', () => {
  it('keeps authentication and rate-limit failures for retry', () => {
    expect(isPermanentQueueStatus(401)).toBe(false)
    expect(isPermanentQueueStatus(403)).toBe(false)
    expect(isPermanentQueueStatus(429)).toBe(false)
  })

  it('drops payloads that cannot succeed unchanged', () => {
    expect(isPermanentQueueStatus(400)).toBe(true)
    expect(isPermanentQueueStatus(404)).toBe(true)
    expect(isPermanentQueueStatus(409)).toBe(true)
    expect(isPermanentQueueStatus(422)).toBe(true)
  })
})

// Queue migration (pure helper from use-offline.tsx — importing it is
// side-effect free; the provider itself needs React Query, so only the pure
// parts are tested here).
import { migrateItem } from '@/lib/offline'

describe('migrateItem', () => {
  it('keeps discriminated payloads as-is', () => {
    const item = {
      id: 1,
      data: { kind: 'fuel-update', id: 42, data: { liters: 30 } },
    }
    expect(migrateItem(item as never).payload).toEqual(item.data)
  })

  it('migrates legacy pre-discriminated items to fuel-create (no data loss)', () => {
    const legacy = { id: 1, data: { liters: 40, vehicle_id: 2 } }
    const migrated = migrateItem(legacy as never)
    expect(migrated.payload.kind).toBe('fuel-create')
    expect(migrated.payload.data).toMatchObject({ liters: 40, vehicle_id: 2 })
  })
})
