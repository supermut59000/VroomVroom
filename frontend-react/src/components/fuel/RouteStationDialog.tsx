import { useState, useRef, useCallback } from 'react'
import { Route, MapPin, Loader2, Navigation, BookMarked } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useGeolocation } from '@/hooks/use-geolocation'
import { useGlobalStationHistory } from '@/hooks/use-fuel-entries'
import { STATION_FUEL_OPTIONS } from '@/hooks/use-nearby-stations'
import type { StationPrices, NearbyStation } from '@/hooks/use-nearby-stations'

interface Commune {
  nom: string
  codesPostaux: string[]
  centre: { type: string; coordinates: [number, number] } // [lon, lat]
}

interface RoutePoint {
  lat: number
  lon: number
  label: string
}

interface RouteStationDialogProps {
  open: boolean
  onClose: () => void
}

const GEO_API = 'https://geo.api.gouv.fr/communes'
const STATION_API =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records'

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

/** Perpendicular distance from point P to segment A→B (flat approximation). */
function perpendicularDistanceM(
  pLat: number, pLon: number,
  aLat: number, aLon: number,
  bLat: number, bLon: number,
): { perpM: number; t: number } {
  const R = 6371000
  const toRad = (d: number) => d * Math.PI / 180
  const avgLat = toRad((aLat + bLat) / 2)

  const ax = toRad(aLon) * Math.cos(avgLat) * R
  const ay = toRad(aLat) * R
  const bx = toRad(bLon) * Math.cos(avgLat) * R
  const by = toRad(bLat) * R
  const px = toRad(pLon) * Math.cos(avgLat) * R
  const py = toRad(pLat) * R

  const dx = bx - ax; const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return { perpM: haversineM(pLat, pLon, aLat, aLon), t: 0 }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const projX = ax + t * dx; const projY = ay + t * dy
  return { perpM: Math.sqrt((px - projX) ** 2 + (py - projY) ** 2), t }
}

function parsePrice(raw: unknown): number | null {
  if (raw == null) return null
  const n = Number(raw)
  return isNaN(n) ? null : n
}

function communeLabel(c: Commune): string {
  const cp = c.codesPostaux[0] ?? ''
  return cp ? `${c.nom} (${cp})` : c.nom
}

interface RouteStation extends NearbyStation {
  detourM: number
  perpM: number
}

export function RouteStationDialog({ open, onClose }: RouteStationDialogProps) {
  const [fuelKey, setFuelKey] = useState<keyof StationPrices>('e85')
  const [maxDetourKm, setMaxDetourKm] = useState(20)
  const [origin, setOrigin] = useState<RoutePoint | null>(null)
  const [dest, setDest] = useState<RoutePoint | null>(null)
  const [originInput, setOriginInput] = useState('')
  const [destInput, setDestInput] = useState('')
  const [originSuggestions, setOriginSuggestions] = useState<Commune[]>([])
  const [destSuggestions, setDestSuggestions] = useState<Commune[]>([])
  const [stations, setStations] = useState<RouteStation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const originTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const destTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geo = useGeolocation()
  const { data: stationHistory = [] } = useGlobalStationHistory()

  // Debounced commune search
  const searchCommunes = useCallback(async (q: string, setSugg: (s: Commune[]) => void) => {
    if (q.length < 2) { setSugg([]); return }
    const param = /^\d+$/.test(q) ? `codePostal=${encodeURIComponent(q)}` : `nom=${encodeURIComponent(q)}`
    try {
      const res = await fetch(`${GEO_API}?${param}&boost=population&limit=6&fields=nom,codesPostaux,centre`)
      if (res.ok) setSugg(await res.json())
    } catch { /* ignore */ }
  }, [])

  const handleOriginInput = (val: string) => {
    setOriginInput(val)
    const match = originSuggestions.find((c) => communeLabel(c) === val)
    if (match) {
      const [lon, lat] = match.centre.coordinates
      setOrigin({ lat, lon, label: communeLabel(match) })
    }
    if (originTimer.current) clearTimeout(originTimer.current)
    originTimer.current = setTimeout(() => searchCommunes(val, setOriginSuggestions), 300)
  }

  const handleDestInput = (val: string) => {
    setDestInput(val)
    const match = destSuggestions.find((c) => communeLabel(c) === val)
    if (match) {
      const [lon, lat] = match.centre.coordinates
      setDest({ lat, lon, label: communeLabel(match) })
    }
    if (destTimer.current) clearTimeout(destTimer.current)
    destTimer.current = setTimeout(() => searchCommunes(val, setDestSuggestions), 300)
  }

  // Capture GPS when button clicked, then set origin once available
  const handleGpsCapture = () => {
    geo.capture()
  }

  // Watch geo for result
  if (geo.status === 'success' && geo.latitude != null && geo.longitude != null && !origin) {
    setOrigin({ lat: geo.latitude, lon: geo.longitude, label: 'Position GPS' })
    setOriginInput('Position GPS')
  }

  const searchStations = async () => {
    if (!origin || !dest) return
    setLoading(true)
    setError(null)
    setStations([])

    try {
      const directM = haversineM(origin.lat, origin.lon, dest.lat, dest.lon)
      const midLat = (origin.lat + dest.lat) / 2
      const midLon = (origin.lon + dest.lon) / 2
      const radiusKm = Math.ceil(directM / 2000 + maxDetourKm + 10)

      const select = [
        'id', 'adresse', 'ville', 'cp',
        'e10_prix', 'sp95_prix', 'sp98_prix', 'gazole_prix', 'e85_prix', 'gplc_prix',
        'geom',
      ].join(',')
      const params = new URLSearchParams({
        where: `within_distance(geom, geom'POINT(${midLon} ${midLat})', ${radiusKm}km)`,
        select,
        limit: '100',
      })
      const res = await fetch(`${STATION_API}?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: { results: any[] } = await res.json()

      const parsed: RouteStation[] = data.results
        .flatMap((r) => {
          const sLat = r.geom?.lat ?? r.geom?.latitude ?? null
          const sLon = r.geom?.lon ?? r.geom?.longitude ?? null
          if (sLat == null || sLon == null) return []

          const { perpM, t } = perpendicularDistanceM(
            sLat, sLon, origin.lat, origin.lon, dest.lat, dest.lon
          )
          if (perpM > maxDetourKm * 1000) return []
          if (t < 0 || t > 1) return [] // outside A→B segment

          const detourM =
            haversineM(origin.lat, origin.lon, sLat, sLon) +
            haversineM(sLat, sLon, dest.lat, dest.lon) -
            directM

          const prices: StationPrices = {
            e10: parsePrice(r.e10_prix),
            sp95: parsePrice(r.sp95_prix),
            sp98: parsePrice(r.sp98_prix),
            diesel: parsePrice(r.gazole_prix),
            e85: parsePrice(r.e85_prix),
            gpl: parsePrice(r.gplc_prix),
          }
          const price = prices[fuelKey]

          // Known name override: haversine < 200m match
          const historyMatch = stationHistory.find(
            (h) => h.latitude != null && h.longitude != null &&
              haversineM(sLat, sLon, h.latitude!, h.longitude!) < 200
          )

          return [{
            id: String(r.id ?? Math.random()),
            name: historyMatch?.station_name ?? r.adresse ?? 'Station',
            address: [r.cp, r.ville].filter(Boolean).join(' '),
            city: r.ville ?? '',
            cp: r.cp ?? '',
            latitude: sLat,
            longitude: sLon,
            price,
            prices,
            distanceM: haversineM(origin.lat, origin.lon, sLat, sLon),
            detourM,
            perpM,
            _knownName: !!historyMatch,
          } as RouteStation & { _knownName?: boolean }]
        })
        .filter((s) => s.price != null)
        .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))

      setStations(parsed as RouteStation[])
    } catch {
      setError('Impossible de charger les stations')
    } finally {
      setLoading(false)
    }
  }

  const cheapest = stations[0]

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5" />
            Station la moins chère sur l'itinéraire
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Origin */}
          <div className="space-y-1">
            <Label className="text-xs">Départ</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  list="route-origin-suggestions"
                  value={originInput}
                  onChange={(e) => handleOriginInput(e.target.value)}
                  placeholder="Ville de départ…"
                  className="h-9"
                />
                <datalist id="route-origin-suggestions">
                  {originSuggestions.map((c) => (
                    <option key={c.nom + c.codesPostaux[0]} value={communeLabel(c)} />
                  ))}
                </datalist>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGpsCapture}
                title="Utiliser ma position"
                className="shrink-0"
              >
                <Navigation className="h-4 w-4" />
              </Button>
            </div>
            {origin && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />{origin.label}
              </p>
            )}
          </div>

          {/* Destination */}
          <div className="space-y-1">
            <Label className="text-xs">Destination</Label>
            <Input
              list="route-dest-suggestions"
              value={destInput}
              onChange={(e) => handleDestInput(e.target.value)}
              placeholder="Ville d'arrivée…"
              className="h-9"
            />
            <datalist id="route-dest-suggestions">
              {destSuggestions.map((c) => (
                <option key={c.nom + c.codesPostaux[0]} value={communeLabel(c)} />
              ))}
            </datalist>
            {dest && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />{dest.label}
              </p>
            )}
          </div>

          {/* Fuel type + detour */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Carburant</Label>
              <Select value={fuelKey} onValueChange={(v) => setFuelKey(v as keyof StationPrices)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATION_FUEL_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-36 space-y-1">
              <Label className="text-xs">Détour max (km)</Label>
              <Select
                value={String(maxDetourKm)}
                onValueChange={(v) => setMaxDetourKm(Number(v))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 20, 30, 50].map((v) => (
                    <SelectItem key={v} value={String(v)}>{v} km</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={searchStations}
            disabled={!origin || !dest || loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Route className="mr-2 h-4 w-4" />}
            Chercher
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Results */}
          {stations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {stations.length} station{stations.length > 1 ? 's' : ''} trouvée{stations.length > 1 ? 's' : ''}
              </p>
              {stations.map((s, i) => {
                const isCheapest = i === 0
                const detourKm = (s.detourM / 1000).toFixed(1)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const knownName = (s as any)._knownName as boolean | undefined
                return (
                  <div
                    key={s.id}
                    className={`rounded-lg border p-3 ${isCheapest ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          {knownName && <BookMarked className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          <p className="truncate text-sm font-medium">{s.name}</p>
                          {isCheapest && (
                            <Badge variant="secondary" className="shrink-0 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs">
                              moins cher
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{s.address}</p>
                        <p className="text-xs text-muted-foreground">
                          Détour : +{detourKm} km
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold">{s.price?.toFixed(3)} €/L</p>
                        {cheapest && i > 0 && cheapest.price != null && s.price != null && (
                          <p className="text-xs text-muted-foreground">
                            +{((s.price - cheapest.price) * 100).toFixed(1)} c/L
                          </p>
                        )}
                      </div>
                    </div>
                    {/* Other prices */}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {(Object.entries(s.prices) as [keyof StationPrices, number | null][])
                        .filter(([k, v]) => k !== fuelKey && v != null)
                        .map(([k, v]) => (
                          <span key={k} className="text-xs text-muted-foreground">
                            {k.toUpperCase()} {v!.toFixed(3)}
                          </span>
                        ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!loading && stations.length === 0 && origin && dest && !error && (
            <p className="text-center text-sm text-muted-foreground py-4">
              Aucune station trouvée sur cet itinéraire. Essayez d'augmenter le détour max.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
