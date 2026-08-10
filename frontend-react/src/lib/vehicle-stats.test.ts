import { describe, expect, it } from 'vitest'
import { shouldFetchIndividualStats } from './vehicle-stats'

describe('shouldFetchIndividualStats', () => {
  it('falls back when the batch omitted this vehicle', () => {
    expect(shouldFetchIndividualStats({ '1': {} }, 2)).toBe(true)
    expect(shouldFetchIndividualStats({ '2': {} }, 2)).toBe(false)
  })
})
