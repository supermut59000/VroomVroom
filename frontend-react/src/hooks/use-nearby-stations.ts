import { useState, useCallback } from 'react'
import type { FuelType } from '@/types'

export interface StationPrices {
  e10: number | null
  sp95: number | null
  sp98: number | null
  diesel: number | null
  e85: number | null
  gpl: number | null
}

export interface NearbyStation {
  id: string
  name: string
  address: string
  city: string
  cp: string
  latitude: number
  longitude: number
  /** Price for the queried fuel type (used in FuelAddDialog context) */
  price: number | null
  /** All available prices */
  prices: StationPrices
  distanceM: number
}

/** Map our app FuelType to the API price field */
export const FUEL_API_FIELD: Partial<Record<FuelType, keyof StationPrices>> = {
  essence: 'e10',
  diesel: 'diesel',
  e85: 'e85',
  gpl: 'gpl',
}

/** All selectable fuel types for the standalone price search */
export const STATION_FUEL_OPTIONS: { label: string; key: keyof StationPrices }[] = [
  { label: 'E10 (Sans-plomb)', key: 'e10' },
  { label: 'SP95', key: 'sp95' },
  { label: 'SP98', key: 'sp98' },
  { label: 'Gazole (Diesel)', key: 'diesel' },
  { label: 'E85', key: 'e85' },
  { label: 'GPL', key: 'gpl' },
]

const API_BASE =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records'

/** Opendatasoft's per-request ceiling. */
const PAGE_SIZE = 100
/** Enough for a 50 km radius anywhere in France; also the routing cap. */
const MAX_STATIONS = 300

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function parsePrice(raw: unknown): number | null {
  if (raw == null) return null
  const n = Number(raw)
  return isNaN(n) ? null : n
}

interface UseNearbyStationsReturn {
  stations: NearbyStation[]
  loading: boolean
  error: string | null
  fetch: (lat: number, lon: number, fuelType?: FuelType | keyof StationPrices, radiusKm?: number) => Promise<void>
  clear: () => void
}

export function useNearbyStations(): UseNearbyStationsReturn {
  const [stations, setStations] = useState<NearbyStation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async (
    lat: number,
    lon: number,
    fuelType?: FuelType | keyof StationPrices,
    radiusKm: number = 5,
  ) => {
    setLoading(true)
    setError(null)

    // Resolve which price field to use as the primary `price`
    const priceKey: keyof StationPrices | null =
      fuelType == null
        ? null
        : fuelType in FUEL_API_FIELD
        ? (FUEL_API_FIELD[fuelType as FuelType] ?? null)
        : (fuelType as keyof StationPrices)

    const select = [
      'id', 'adresse', 'ville', 'cp',
      'e10_prix', 'sp95_prix', 'sp98_prix', 'gazole_prix', 'e85_prix', 'gplc_prix',
      'geom',
    ].join(',')

    try {
      // The API caps a page at 100 and returns rows in arbitrary order — not
      // by distance. Fetching one page of 25 meant sorting a *random* subset:
      // a 50 km search around Nieppe holds 288 stations. Page through instead.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = []
      for (let offset = 0; offset < MAX_STATIONS; offset += PAGE_SIZE) {
        const params = new URLSearchParams({
          where: `within_distance(geom, geom'POINT(${lon} ${lat})', ${radiusKm}km)`,
          select,
          limit: String(Math.min(PAGE_SIZE, MAX_STATIONS - offset)),
          offset: String(offset),
        })
        const res = await window.fetch(`${API_BASE}?${params.toString()}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const page: { results: unknown[]; total_count?: number } = await res.json()
        rows.push(...page.results)
        if (page.results.length < PAGE_SIZE) break
      }

      const parsed: NearbyStation[] = rows
        .map((r) => {
          const stationLat = r.geom?.lat ?? r.geom?.latitude ?? null
          const stationLon = r.geom?.lon ?? r.geom?.longitude ?? null
          if (stationLat == null || stationLon == null) return null

          const prices: StationPrices = {
            e10: parsePrice(r.e10_prix),
            sp95: parsePrice(r.sp95_prix),
            sp98: parsePrice(r.sp98_prix),
            diesel: parsePrice(r.gazole_prix),
            e85: parsePrice(r.e85_prix),
            gpl: parsePrice(r.gplc_prix),
          }

          const price = priceKey ? prices[priceKey] : null

          return {
            id: String(r.id ?? Math.random()),
            name: r.adresse ?? 'Station',
            address: [r.cp, r.ville].filter(Boolean).join(' '),
            city: r.ville ?? '',
            cp: r.cp ?? '',
            latitude: stationLat,
            longitude: stationLon,
            price,
            prices,
            distanceM: haversineM(lat, lon, stationLat, stationLon),
          } as NearbyStation
        })
        .filter((s): s is NearbyStation => s !== null)

      setStations(parsed)
    } catch {
      setError('Impossible de charger les prix des stations')
      setStations([])
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setStations([])
    setError(null)
  }, [])

  return { stations, loading, error, fetch, clear }
}
