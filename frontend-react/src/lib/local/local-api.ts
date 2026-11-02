// Local mode transport — routes the same path strings the hooks use against
// the remote API onto the in-device services (IndexedDB + ported logic).
// Response shapes and error statuses mirror the backend exactly.
import { ApiError } from '@/lib/api-error'
import * as svc from './services'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

const notFound = (detail: string): never => {
  throw new ApiError(404, detail)
}

function seg(path: string): string[] {
  return path.split('?')[0].split('/').filter(Boolean)
}

/** OSRM direct (local mode has no backend proxy). Chunked, never throws. */
async function osrmMatrix(
  origin: { latitude: number; longitude: number },
  destinations: { latitude: number; longitude: number }[],
): Promise<{ legs: { distance_m: number | null; duration_s: number | null }[]; provider: string; cached: boolean }> {
  const legs: { distance_m: number | null; duration_s: number | null }[] = []
  const CH = 50
  for (let i = 0; i < destinations.length; i += CH) {
    const chunk = destinations.slice(i, i + CH)
    const coords = [
      `${origin.longitude},${origin.latitude}`,
      ...chunk.map((d) => `${d.longitude},${d.latitude}`),
    ].join(';')
    try {
      const res = await fetch(
        `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance,duration`,
      )
      if (!res.ok) throw new Error(`OSRM ${res.status}`)
      const data = (await res.json()) as {
        distances: number[][]
        durations: number[][]
      }
      chunk.forEach((_, j) => {
        legs.push({
          distance_m: Math.round(data.distances[0][j + 1]),
          duration_s: Math.round(data.durations[0][j + 1]),
        })
      })
    } catch {
      // Provider failure → null legs (callers fall back to crow-flies distance)
      chunk.forEach(() => legs.push({ distance_m: null, duration_s: null }))
    }
  }
  return { legs, provider: 'osrm', cached: false }
}

export async function localRequest<T = unknown>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  const [rawPath, rawQuery = ''] = path.split('?')
  const q = new URLSearchParams(rawQuery)
  const s = seg(path)
  const b = (body ?? {}) as Record<string, unknown>
  const id = (i: number) => Number(s[i])

  // ── Vehicles ──────────────────────────────────────────────────────────
  if (s[0] === 'vehicles') {
    if (method === 'GET' && s.length === 1) {
      return svc.listVehicles({
        activeOnly: q.get('active_only') !== 'false',
        fuelType: q.get('fuel_type') ?? undefined,
      }) as Promise<T>
    }
    if (method === 'POST' && s.length === 1) return svc.createVehicle(b) as Promise<T>
    if (method === 'GET' && s[1] === 'stats' && s[2] === 'batch') {
      return svc.vehicleStatsBatch() as Promise<T>
    }
    if (s.length >= 2 && !isNaN(id(1))) {
      if (method === 'GET' && s.length === 2) return svc.getVehicle(id(1)) as Promise<T>
      if (method === 'PUT' && s.length === 2) return svc.updateVehicle(id(1), b) as Promise<T>
      if (method === 'DELETE' && s.length === 2) {
        await svc.deleteVehicle(id(1), q.get('force') === 'true')
        return undefined as T
      }
      if (method === 'POST' && s[2] === 'archive')
        return (svc.archiveVehicle(id(1)) ?? undefined) as Promise<T>
      if (method === 'GET' && s[2] === 'stats') return svc.vehicleStats(id(1)) as Promise<T>
      if (method === 'GET' && s[2] === 'timeline')
        return svc.vehicleTimeline(id(1)) as Promise<T>
      if (method === 'GET' && s[2] === 'period-stats') {
        const start = q.get('start_date')
        const end = q.get('end_date')
        if (!start || !end || end < start)
          throw new ApiError(422, 'La date de fin doit être postérieure à la date de début')
        return svc.periodStats(id(1), start, end) as Promise<T>
      }
    }
  }

  // ── Fuel entries ──────────────────────────────────────────────────────
  if (s[0] === 'fuel-entries') {
    if (method === 'GET' && s.length === 1) {
      // Paginated collection (global station history uses this shape)
      const all = await svc.listFuelEntriesFiltered({
        vehicleId: q.get('vehicle_id') ? Number(q.get('vehicle_id')) : undefined,
        fuelType: q.get('fuel_type') ?? undefined,
        startDate: q.get('start_date') ?? undefined,
        endDate: q.get('end_date') ?? undefined,
      })
      const perPage = Number(q.get('per_page') ?? 100)
      const page = Number(q.get('page') ?? 1)
      const total = all.length
      const entries = all.slice((page - 1) * perPage, page * perPage)
      return {
        entries,
        total,
        page,
        per_page: perPage,
        pages: Math.max(1, Math.ceil(total / perPage)),
      } as T
    }
    if (method === 'POST' && s.length === 1) {
      return svc.createFuelEntry(b, q.get('allow_odometer_decrease') === 'true') as Promise<T>
    }
    if (s.length >= 2 && !isNaN(id(1))) {
      if (method === 'GET' && s.length === 2) {
        const e = await svc.getFuelEntry(id(1))
        if (!e) notFound('Entry not found')
        return e as T
      }
      if (method === 'PUT' && s.length === 2) {
        const e = await svc.updateFuelEntry(
          id(1),
          b,
          q.get('allow_odometer_decrease') === 'true',
        )
        if (!e) notFound('Entry not found')
        return e as T
      }
      if (method === 'DELETE' && s.length === 2) {
        const ok = await svc.deleteFuelEntry(id(1))
        if (!ok) notFound('Entry not found')
        return undefined as T
      }
    }
    // Per-vehicle sub-routes: s[1] is the literal 'vehicle', not an entry id —
    // they must live OUTSIDE the numeric id(1) guard above (regression: they
    // 404'd and every screen reading them spun on "Chargement…" forever).
    if (s[1] === 'vehicle' && s.length >= 3) {
      const vid = id(2)
      if (method === 'GET' && s.length === 3) {
        // Plain array (matches backend List[FuelEntryResponse]); page/per_page
        // mirror the backend skip/limit.
        const all = await svc.listFuelEntriesByVehicle(vid)
        const perPage = Number(q.get('per_page') ?? 20)
        const page = Number(q.get('page') ?? 1)
        return all.slice((page - 1) * perPage, page * perPage) as unknown as T
      }
      if (method === 'GET' && s[3] === 'latest') {
        const e = await svc.latestFuelEntry(vid)
        if (!e) notFound('No fuel entries found for this vehicle')
        return e as T
      }
      if (method === 'GET' && s[3] === 'statistics')
        return svc.fuelStatistics(vid) as Promise<T>
      if (method === 'GET' && s[3] === 'consumption-history')
        return svc.consumptionHistory(vid) as Promise<T>
      if (method === 'GET' && s[3] === 'nearest-station') {
        const radius = Number(q.get('radius_m') ?? 250)
        // Mirrors the backend Query(ge=1, le=500) validation (422 outside)
        if (!(radius >= 1 && radius <= 500)) {
          throw new ApiError(422, 'radius_m must be between 1 and 500')
        }
        const st = await svc.nearestStation(
          vid,
          Number(q.get('lat')),
          Number(q.get('lon')),
          radius,
        )
        if (!st) notFound('No station within radius')
        return st as T
      }
    }
    if (method === 'GET' && s[1] === 'stations') {
      return svc.distinctStationNames(
        q.get('vehicle_id') ? Number(q.get('vehicle_id')) : undefined,
      ) as Promise<T>
    }
  }

  // ── Maintenances ──────────────────────────────────────────────────────
  if (s[0] === 'maintenances') {
    if (method === 'POST' && s.length === 1) return svc.createMaintenance(b) as Promise<T>
    if (s.length >= 2 && !isNaN(id(1))) {
      if (method === 'PUT' && s.length === 2) {
        const m = await svc.updateMaintenance(id(1), b)
        if (!m) notFound('Maintenance not found')
        return m as T
      }
      if (method === 'DELETE' && s.length === 2) {
        const ok = await svc.deleteMaintenance(id(1))
        if (!ok) notFound('Maintenance not found')
        return undefined as T
      }
    }
    if (s[1] === 'vehicle' && s.length >= 3) {
      const vid = id(2)
      if (method === 'GET' && s.length === 3)
        return svc.listMaintenances(vid) as Promise<T>
      if (method === 'GET' && s[3] === 'statistics')
        return svc.maintenanceStatistics(vid) as Promise<T>
    }
  }

  // ── FlexFuel ──────────────────────────────────────────────────────────
  if (s[0] === 'flexfuel') {
    if (s[1] === 'e10-prices') {
      if (method === 'GET' && s.length === 2) return svc.listE10Prices() as Promise<T>
      if (method === 'POST' && s.length === 2) return svc.createE10Price(b) as Promise<T>
      if (method === 'DELETE' && s.length === 3) {
        const ok = await svc.deleteE10Price(id(2))
        if (!ok) notFound('E10 price not found')
        return undefined as T
      }
    }
    if (s[1] === 'vehicles' && s[3] === 'conversion') {
      const vid = id(2)
      if (method === 'GET') {
        const c = await svc.getConversion(vid)
        if (!c) notFound("Conversion FlexFuel introuvable")
        return c as T
      }
      if (method === 'POST') return svc.createConversion(b) as Promise<T>
      if (method === 'PUT') {
        const c = await svc.updateConversion(vid, b)
        if (!c) notFound("Conversion FlexFuel introuvable")
        return c as T
      }
      if (method === 'DELETE') {
        const ok = await svc.deleteConversion(vid)
        if (!ok) notFound("Conversion FlexFuel introuvable")
        return undefined as T
      }
    }
    if (s[1] === 'vehicles' && s[3] === 'rentability') {
      const r = await svc.rentability(id(2))
      if (!r) notFound('No FlexFuel conversion for this vehicle')
      return r as T
    }
  }

  // ── Routing (OSRM direct in local mode) ───────────────────────────────
  if (s[0] === 'routing' && s[1] === 'matrix' && method === 'POST') {
    const payload = b as {
      origin: { latitude: number; longitude: number }
      destinations: { latitude: number; longitude: number }[]
    }
    if (!payload.destinations?.length) {
      return { legs: [], provider: 'osrm', cached: false } as T
    }
    return osrmMatrix(payload.origin, payload.destinations) as Promise<T>
  }

  return notFound(`Local route inconnue: ${method} ${rawPath}`)
}
