import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  DEFAULT_COLD_ALERT,
  loadColdAlert,
  saveColdAlert,
  nextOccurrence,
  tempAtTime,
  coldAdvice,
  wasNotifiedFor,
  markNotifiedFor,
  isWinterWindow,
} from '@/lib/cold-alert'

describe('cold-alert', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.useRealTimers())

  it('loadColdAlert returns defaults when nothing is stored', () => {
    expect(loadColdAlert()).toEqual(DEFAULT_COLD_ALERT)
  })

  it('loadColdAlert merges partial config and survives corruption', () => {
    localStorage.setItem('vv_cold_alert', JSON.stringify({ time: '07:00' }))
    const cfg = loadColdAlert()
    expect(cfg.time).toBe('07:00')
    expect(cfg.thresholdC).toBe(5)
    expect(cfg.enabled).toBe(false)
    expect(cfg.city).toBeNull()

    localStorage.setItem('vv_cold_alert', '{corrupt')
    expect(loadColdAlert()).toEqual(DEFAULT_COLD_ALERT)
  })

  it('saveColdAlert round-trips a full config', () => {
    const cfg = {
      ...DEFAULT_COLD_ALERT,
      enabled: true,
      city: { name: 'Lyon', cp: '69001', lat: 45.76, lon: 4.84 },
    }
    saveColdAlert(cfg)
    expect(loadColdAlert()).toEqual(cfg)
  })

  it('isWinterWindow follows the mandatory winter-grade E85 dates', () => {
    expect(isWinterWindow(new Date(2026, 9, 31))).toBe(true) // Oct 31
    expect(isWinterWindow(new Date(2026, 10, 15))).toBe(true) // Nov 15
    expect(isWinterWindow(new Date(2027, 2, 15))).toBe(true) // Mar 15
    expect(isWinterWindow(new Date(2027, 2, 16))).toBe(false) // Mar 16
    expect(isWinterWindow(new Date(2026, 5, 15))).toBe(false) // Jun 15
  })

  it('nextOccurrence: today if the time has not passed, tomorrow otherwise', () => {
    const now = new Date(2026, 10, 15, 6, 0)
    expect(nextOccurrence('06:45', now).getDate()).toBe(15)
    expect(nextOccurrence('23:30', now).getDate()).toBe(15)
    expect(nextOccurrence('06:45', new Date(2026, 10, 15, 7, 0)).getDate()).toBe(16)
    // boundary: exactly the configured time → tomorrow
    expect(nextOccurrence('06:00', new Date(2026, 10, 15, 6, 0)).getDate()).toBe(16)
  })

  it('tempAtTime matches the local hour bucket', () => {
    const forecast = {
      time: ['2026-11-15T06:00', '2026-11-15T07:00', '2026-11-16T06:00'],
      temperature_2m: [4, 3, -2],
    }
    expect(tempAtTime(forecast, new Date(2026, 10, 15, 6, 45))).toBe(4)
    expect(tempAtTime(forecast, new Date(2026, 10, 16, 6, 45))).toBe(-2)
    expect(tempAtTime(forecast, new Date(2026, 10, 15, 8, 0))).toBeNull()
  })

  describe('coldAdvice', () => {
    const cfg = { time: '06:45', thresholdC: 5 }

    it('ok above threshold', () => {
      const a = coldAdvice(8, cfg, 'Lyon')
      expect(a.level).toBe('ok')
      expect(a.message).toContain("pas d'alerte")
    })

    it('cold at the threshold (≤ is cold)', () => {
      expect(coldAdvice(5, cfg, 'Lyon').level).toBe('cold')
      expect(coldAdvice(-1, cfg, 'Lyon').message).toContain('plein E10 conseillé')
    })

    it('unknown when the forecast has no matching hour', () => {
      expect(coldAdvice(null, cfg, 'Lyon').level).toBe('unknown')
    })

    it('adds the winter E85 note only inside the winter window', () => {
      vi.useFakeTimers({ now: new Date(2026, 10, 15, 12) })
      expect(coldAdvice(-1, cfg, 'Lyon').message).toContain('E85 ≤ 75 %')
      vi.useFakeTimers({ now: new Date(2026, 5, 15, 12) })
      expect(coldAdvice(-1, cfg, 'Lyon').message).not.toContain('E85 ≤ 75 %')
    })
  })

  it('notification dedup is per occurrence', () => {
    const occ = new Date(2026, 10, 16, 6, 45)
    expect(wasNotifiedFor(occ)).toBe(false)
    markNotifiedFor(occ)
    expect(wasNotifiedFor(occ)).toBe(true)
    expect(wasNotifiedFor(new Date(2026, 10, 17, 6, 45))).toBe(false)
  })
})
