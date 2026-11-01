import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

/**
 * Cold-alert notification layer — same message, two platforms:
 * - Capacitor (android-local): local notification scheduled for the exact occurrence
 * - browser (PWA): immediate Notification — a PWA cannot reliably push while closed
 *   (true push would need VAPID/FCM, out of scope for v1); the in-app banner covers it.
 */
export interface ColdAlertNotification {
  title: string
  body: string
  /** Scheduled occurrence (Capacitor path); falls back to ~1 min when absent */
  at?: Date
}

export function notificationsSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (Capacitor.isNativePlatform()) return true
  return 'Notification' in window
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const status = await LocalNotifications.requestPermissions()
    return status.display === 'granted'
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  return (await Notification.requestPermission()) === 'granted'
}

/** Returns true when a notification was delivered/scheduled. */
export function notifyColdAlert(n: ColdAlertNotification): boolean {
  try {
    if (Capacitor.isNativePlatform()) {
      const at = n.at ?? new Date(Date.now() + 60_000)
      LocalNotifications.schedule({
        notifications: [
          {
            id: Date.now(),
            title: n.title,
            body: n.body,
            // v8 API: schedule.at (was scheduledAt in v5)
            schedule: { at, allowWhileIdle: true },
          },
        ],
      }).catch(() => {})
      return true
    }
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new Notification(n.title, { body: n.body })
      return true
    }
  } catch {
    // no notification — the in-app banner still shows
  }
  return false
}
