import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * notify.ts branches on Capacitor.isNativePlatform() at module level, so each
 * test mocks the two modules and re-imports fresh.
 */
function mocks(isNative: boolean) {
  const schedule = vi.fn((_opts: { notifications: { schedule: { at: Date } }[] }) =>
    Promise.resolve({} as never),
  )
  const requestPermissions = vi.fn(() =>
    Promise.resolve({ display: 'granted', alert: 'granted', badge: 'granted', sound: 'granted' }),
  )
  vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNative } }))
  vi.doMock('@capacitor/local-notifications', () => ({
    LocalNotifications: { schedule, requestPermissions },
  }))
  return { schedule, requestPermissions }
}

describe('notify — browser path (PWA)', () => {
  beforeEach(() => vi.resetModules())

  it('fires a Notification when permission is granted', async () => {
    mocks(false)
    const NotificationMock = vi.fn()
    vi.stubGlobal('Notification', NotificationMock)
    ;(NotificationMock as unknown as { permission: string }).permission = 'granted'
    const { notifyColdAlert } = await import('@/lib/notify')
    expect(notifyColdAlert({ title: 'T', body: 'B' })).toBe(true)
    expect(NotificationMock).toHaveBeenCalledWith('T', { body: 'B' })
  })

  it('returns false when permission is denied', async () => {
    mocks(false)
    const NotificationMock = vi.fn()
    vi.stubGlobal('Notification', NotificationMock)
    const notif = NotificationMock as unknown as {
      permission: string
      requestPermission: () => Promise<string>
    }
    notif.permission = 'denied'
    notif.requestPermission = vi.fn().mockResolvedValue('denied')
    const { notifyColdAlert, requestNotificationPermission } = await import('@/lib/notify')
    expect(notifyColdAlert({ title: 'T', body: 'B' })).toBe(false)
    expect(await requestNotificationPermission()).toBe(false)
  })

  it('returns false when Notification is unsupported (no crash)', async () => {
    mocks(false)
    const { notifyColdAlert } = await import('@/lib/notify')
    expect(notifyColdAlert({ title: 'T', body: 'B' })).toBe(false)
  })
})

describe('notify — Capacitor path (Android)', () => {
  beforeEach(() => vi.resetModules())

  it('schedules a local notification at the exact occurrence', async () => {
    const { schedule } = mocks(true)
    const at = new Date('2026-11-16T06:45:00')
    const { notifyColdAlert, requestNotificationPermission } = await import('@/lib/notify')
    expect(notifyColdAlert({ title: 'T', body: 'B', at })).toBe(true)
    expect(schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          title: 'T',
          body: 'B',
          schedule: { at, allowWhileIdle: true },
        }),
      ],
    })
    expect(await requestNotificationPermission()).toBe(true)
  })

  it('falls back to ~1 minute when no occurrence is given', async () => {
    const { schedule } = mocks(true)
    const before = Date.now()
    const { notifyColdAlert } = await import('@/lib/notify')
    notifyColdAlert({ title: 'T', body: 'B' })
    const call = schedule.mock.calls[0][0]
    expect(call.notifications[0].schedule.at.getTime()).toBeGreaterThanOrEqual(before + 59_000)
  })
})
