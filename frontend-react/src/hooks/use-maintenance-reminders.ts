import { useMemo } from 'react'
import { useMaintenances } from './use-maintenances'
import { useVehicleStats } from './use-vehicles'
import { getMaintenanceLabel } from '@/lib/constants'

export interface Reminder {
  type: string
  status: 'overdue' | 'upcoming'
  detail: string
}

export function useMaintenanceReminders(vehicleId: number) {
  const { data: maintenances } = useMaintenances(vehicleId)
  const { data: stats } = useVehicleStats(vehicleId)

  const reminders = useMemo(() => {
    if (!maintenances || maintenances.length === 0) return []

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in30Days = new Date(today)
    in30Days.setDate(in30Days.getDate() + 30)

    const lastOdometer = stats?.last_odometer ?? 0
    const result: Reminder[] = []

    // Group by maintenance type — only check the most recent entry per type
    const latestByType = new Map<string, (typeof maintenances)[0]>()
    for (const m of maintenances) {
      const existing = latestByType.get(m.maintenance_type)
      if (!existing || m.maintenance_date > existing.maintenance_date) {
        latestByType.set(m.maintenance_type, m)
      }
    }

    for (const m of latestByType.values()) {
      const label = getMaintenanceLabel(m.maintenance_type)

      // Check date-based reminders
      if (m.next_maintenance_date) {
        const nextDate = new Date(m.next_maintenance_date)
        nextDate.setHours(0, 0, 0, 0)

        if (nextDate < today) {
          const daysOverdue = Math.round(
            (today.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24),
          )
          result.push({
            type: label,
            status: 'overdue',
            detail: `${label} dépassé${label.endsWith('e') ? 'e' : ''} de ${daysOverdue} jour${daysOverdue > 1 ? 's' : ''}`,
          })
        } else if (nextDate <= in30Days) {
          const daysLeft = Math.round(
            (nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
          )
          result.push({
            type: label,
            status: 'upcoming',
            detail: `${label} dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`,
          })
        }
      }

      // Check odometer-based reminders
      if (m.next_maintenance_odometer && lastOdometer > 0) {
        const kmRemaining = m.next_maintenance_odometer - lastOdometer

        if (kmRemaining <= 0) {
          result.push({
            type: label,
            status: 'overdue',
            detail: `${label} dépassé${label.endsWith('e') ? 'e' : ''} de ${Math.abs(Math.round(kmRemaining))} km`,
          })
        } else if (kmRemaining <= 1000) {
          result.push({
            type: label,
            status: 'upcoming',
            detail: `${label} dans ${Math.round(kmRemaining)} km`,
          })
        }
      }
    }

    // Sort: overdue first, then upcoming
    result.sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1
      if (a.status !== 'overdue' && b.status === 'overdue') return 1
      return 0
    })

    return result
  }, [maintenances, stats])

  return {
    reminders,
    hasUrgent: reminders.some((r) => r.status === 'overdue'),
  }
}
