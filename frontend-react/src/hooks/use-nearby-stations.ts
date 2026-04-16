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

/** Last-update timestamp per fuel type (ISO string from the API) */
export interface StationUpdates {
  e10: string | null
  sp95: string | null
  sp98: string | null
  diesel: string | null
  e85: string | null
  gpl: string | null
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
  /** Last-update timestamps per fuel type */
  updates: StationUpdates
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

export interface BBox {
  west: number
  south: number
  east: number
  north: number
}

const API_BASE =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records'

const SELECT_FIELDS = [
  'id', 'adresse', 'ville', 'cp',
  'e10_prix', 'sp95_prix', 'sp98_prix', 'gazole_prix', 'e85_prix', 'gplc_prix',
  'e10_maj', 'sp95_maj', 'sp98_maj', 'gazole_maj', 'e85_maj', 'gplc_maj',
  'geom',
].join(',')

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

function resolvePriceKey(fuelType?: FuelType | keyof StationPrices): keyof StationPrices | null {
  if (fuelType == null) return null
  if (fuelType in FUEL_API_FIELD) {
    return FUEL_API_FIELD[fuelType as FuelType] ?? null
  }
  return fuelType as keyof StationPrices
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRecord(r: any, centerLat: number, centerLon: number, priceKey: keyof StationPrices | null): NearbyStation | null {
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

  const updates: StationUpdates = {
    e10: r.e10_maj ?? null,
    sp95: r.sp95_maj ?? null,
    sp98: r.sp98_maj ?? null,
    diesel: r.gazole_maj ?? null,
    e85: r.e85_maj ?? null,
    gpl: r.gplc_maj ?? null,
  }

  return {
    id: String(r.id ?? `${stationLat},${stationLon}`),
    name: r.adresse ?? 'Station',
    address: [r.cp, r.ville].filter(Boolean).join(' '),
    city: r.ville ?? '',
    cp: r.cp ?? '',
    latitude: stationLat,
    longitude: stationLon,
    price: priceKey ? prices[priceKey] : null,
    prices,
    updates,
    distanceM: haversineM(centerLat, centerLon, stationLat, stationLon),
  }
}

interface UseNearbyStationsReturn {
  stations: NearbyStation[]
  loading: boolean
  error: string | null
  fetch: (lat: number, lon: number, fuelType?: FuelType | keyof StationPrices, radiusKm?: number) => Promise<void>
  fetchBBox: (bbox: BBox, centerLat: number, centerLon: number, fuelType?: FuelType | keyof StationPrices, limit?: number) => Promise<void>
  clear: () => void
}

export function useNearbyStations(): UseNearbyStationsReturn {
  const [stations, setStations] = useState<NearbyStation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runQuery = useCallback(async (
    where: string,
    centerLat: number,
    centerLon: number,
    priceKey: keyof StationPrices | null,
    limit: number,
  ) => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      where,
      select: SELECT_FIELDS,
      limit: String(limit),
    })

    try {
      const res = await window.fetch(`${API_BASE}?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: { results: any[] } = await res.json()

      const parsed = data.results
        .map((r) => parseRecord(r, centerLat, centerLon, priceKey))
        .filter((s): s is NearbyStation => s !== null)

      setStations(parsed)
    } catch {
      setError('Impossible de charger les prix des stations')
      setStations([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetch = useCallback(async (
    lat: number,
    lon: number,
    fuelType?: FuelType | keyof StationPrices,
    radiusKm: number = 5,
  ) => {
    const priceKey = resolvePriceKey(fuelType)
    const where = `within_distance(geom, geom'POINT(${lon} ${lat})', ${radiusKm}km)`
    await runQuery(where, lat, lon, priceKey, 100)
  }, [runQuery])

  const fetchBBox = useCallback(async (
    bbox: BBox,
    _centerLat: number,
    _centerLon: number,
    fuelType?: FuelType | keyof StationPrices,
    limit: number = 100,
  ) => {
    const priceKey = resolvePriceKey(fuelType)
    // ODS QL doesn't support arbitrary polygon intersects on geo_point_2d,
    // but `within_distance` is reliable — convert the bbox to an enclosing
    // circle (center + radius to the farthest corner).
    const { west, south, east, north } = bbox
    const bboxCenterLat = (south + north) / 2
    const bboxCenterLon = (west + east) / 2
    const radiusM = haversineM(bboxCenterLat, bboxCenterLon, north, east)
    const radiusKm = Math.max(1, Math.ceil(radiusM / 1000))
    const where = `within_distance(geom, geom'POINT(${bboxCenterLon} ${bboxCenterLat})', ${radiusKm}km)`
    await runQuery(where, bboxCenterLat, bboxCenterLon, priceKey, limit)
  }, [runQuery])

  const clear = useCallback(() => {
    setStations([])
    setError(null)
  }, [])

  return { stations, loading, error, fetch, fetchBBox, clear }
}
