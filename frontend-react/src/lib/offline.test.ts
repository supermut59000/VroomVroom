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
