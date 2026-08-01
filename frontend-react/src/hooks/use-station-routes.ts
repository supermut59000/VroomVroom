import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { RouteLeg, RouteMatrix } from '@/types'

export interface RoutePoint {
  latitude: number
  longitude: number
}

export interface RoutableStation extends RoutePoint {
  id: string
}

/** Same rounding the backend uses for its cache key (~11 m). */
const KEY_PRECISION = 4

const roundKey = (p: RoutePoint) =>
  `${p.latitude.toFixed(KEY_PRECISION)},${p.longitude.toFixed(KEY_PRECISION)}`

/**
 * Road distance and driving time from `origin` to every station.
 *
 * Straight-line distance badly misrepresents reality wherever a mountain, a
 * river or a motorway junction sits between the two points — a station 8 km
 * away as the crow flies can be an hour's drive. The backend caches per
 * origin/destination pair, so changing fuel type or radius costs nothing.
 *
 * Returns an empty map (not an error) when routing is unavailable; callers
 * fall back to the straight-line distance they already have.
 */
export function useStationRoutes(origin: RoutePoint | null, stations: RoutableStation[]) {
  // Order-independent: re-sorting the list by price must not refetch.
  const stationKey = stations.map((s) => roundKey(s)).sort().join('|')
  const originKey = origin ? roundKey(origin) : ''

  const query = useQuery({
    queryKey: ['stationRoutes', originKey, stationKey],
    queryFn: async () => {
      const res = await api.post<RouteMatrix>('/routing/matrix', {
        origin: { latitude: origin!.latitude, longitude: origin!.longitude },
        destinations: stations.map((s) => ({
          latitude: s.latitude,
          longitude: s.longitude,
        })),
      })
      // legs come back in the order the destinations were sent
      const byId = new Map<string, RouteLeg>()
      stations.forEach((s, i) => {
        const leg = res.legs[i]
        if (leg?.distance_m != null && leg.duration_s != null) byId.set(s.id, leg)
      })
      return byId
    },
    enabled: origin !== null && stations.length > 0,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    // A routing outage degrades to straight-line distance; hammering the
    // provider with retries doesn't make the road any shorter.
    retry: false,
  })

  return {
    routes: query.data ?? new Map<string, RouteLeg>(),
    loading: query.isFetching,
    unavailable: query.isError,
  }
}

export function formatDrivingTime(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
}

export function formatRoadDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}
