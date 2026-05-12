import { useState, useRef, useCallback, useEffect } from 'react'
import { Route, MapPin, Loader2, Navigation, BookMarked, ExternalLink, Download, ChevronDown, ChevronUp } from 'lucide-react'
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
import { Map, MapMarker, MarkerContent, MarkerPopup, MapControls, MapRoute } from '@/components/ui/map'
import { useGeolocation } from '@/hooks/use-geolocation'
import { useGlobalStationHistory } from '@/hooks/use-fuel-entries'
import { useVehicles, useVehicleStats } from '@/hooks/use-vehicles'
import { STATION_FUEL_OPTIONS } from '@/hooks/use-nearby-stations'
import type { StationPrices, NearbyStation } from '@/hooks/use-nearby-stations'
import type { MapRef } from '@/components/ui/map'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Commune {
  nom: string
  codesPostaux: string[]
  centre: { type: string; coordinates: [number, number] }
}

interface RoutePoint {
  lat: number
  lon: number
  label: string
}

interface OsrmRoute {
  coordinates: [number, number][] // [lon, lat]
  distanceM: number
  durationS: number
}

interface RouteStation extends NearbyStation {
  detourM: number
}

interface TollInfo {
  normalRoute: OsrmRoute
  tollFreeRoute: OsrmRoute | null
  hasTolls: boolean
}

interface RouteStationDialogProps {
  open: boolean
  onClose: () => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GEO_API = 'https://geo.api.gouv.fr/communes'
const STATION_API =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records'
const OSRM_API = 'https://router.project-osrm.org/route/v1/driving'

// ─── Geo helpers ─────────────────────────────────────────────────────────────

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

/** Min distance from point to any segment of a polyline. */
function distToPolylineM(
  pLat: number, pLon: number,
  coords: [number, number][], // [lon, lat]
): number {
  const R = 6371000
  const toRad = (d: number) => d * Math.PI / 180
  let minDist = Infinity

  for (let i = 0; i < coords.length - 1; i++) {
    const [aLon, aLat] = coords[i]
    const [bLon, bLat] = coords[i + 1]
    const avgLat = toRad((aLat + bLat) / 2)

    const ax = toRad(aLon) * Math.cos(avgLat) * R
    const ay = toRad(aLat) * R
    const bx = toRad(bLon) * Math.cos(avgLat) * R
    const by = toRad(bLat) * R
    const px = toRad(pLon) * Math.cos(avgLat) * R
    const py = toRad(pLat) * R

    const dx = bx - ax; const dy = by - ay
    const len2 = dx * dx + dy * dy

    let dist: number
    if (len2 === 0) {
      dist = haversineM(pLat, pLon, aLat, aLon)
    } else {
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
      const projX = ax + t * dx; const projY = ay + t * dy
      dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
    }
    if (dist < minDist) minDist = dist
  }
  return minDist
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

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m} min`
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(0)} km`
}

/** Try to extract origin/destination from a google.com/maps/dir/... URL */
function parseGoogleMapsUrl(url: string): { origin: string; dest: string } | null {
  try {
    const match = url.match(/maps\.google\.[a-z.]+\/maps\/dir\/([^/]+)\/([^/?]+)/)
      ?? url.match(/google\.[a-z.]+\/maps\/dir\/([^/]+)\/([^/?]+)/)
    if (!match) return null
    const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '))
    return { origin: decode(match[1]), dest: decode(match[2]) }
  } catch {
    return null
  }
}

/** Sample N evenly-spaced points from a polyline for Google Maps waypoints. */
function samplePolyline(coords: [number, number][], n: number): [number, number][] {
  if (coords.length <= n) return coords
  const step = (coords.length - 1) / (n - 1)
  return Array.from({ length: n }, (_, i) => coords[Math.round(i * step)])
}

/** Export route as GPX string. */
function toGpx(coords: [number, number][], name: string): string {
  const pts = coords.map(([lon, lat]) => `    <trkpt lat="${lat}" lon="${lon}"></trkpt>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="VroomVroom">
  <trk><name>${name}</name><trkseg>
${pts}
  </trkseg></trk>
</gpx>`
}

// ─── OSRM fetch ──────────────────────────────────────────────────────────────

async function fetchOsrmRoute(
  origin: RoutePoint,
  dest: RoutePoint,
  excludeToll = false,
): Promise<OsrmRoute | null> {
  const exclude = excludeToll ? '&exclude=toll' : ''
  const url = `${OSRM_API}/${origin.lon},${origin.lat};${dest.lon},${dest.lat}?geometries=geojson&overview=full${exclude}`
  const res = await fetch(url)
  if (!res.ok) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json()
  const route = data.routes?.[0]
  if (!route) return null
  return {
    coordinates: route.geometry.coordinates as [number, number][],
    distanceM: route.distance,
    durationS: route.duration,
  }
}

// ─── Collapsible section ─────────────────────────────────────────────────────

function Section({ title, defaultOpen = true, children }: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium"
        onClick={() => setOpen((o) => !o)}
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t px-3 pb-3 pt-2">{children}</div>}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function RouteStationDialog({ open, onClose }: RouteStationDialogProps) {
  const [fuelKey, setFuelKey] = useState<keyof StationPrices>('sp95')
  const [maxDetourKm, setMaxDetourKm] = useState(20)
  const [origin, setOrigin] = useState<RoutePoint | null>(null)
  const [dest, setDest] = useState<RoutePoint | null>(null)
  const [originInput, setOriginInput] = useState('')
  const [destInput, setDestInput] = useState('')
  const [originSuggestions, setOriginSuggestions] = useState<Commune[]>([])
  const [destSuggestions, setDestSuggestions] = useState<Commune[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null)
  const [gmapsUrl, setGmapsUrl] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [route, setRoute] = useState<OsrmRoute | null>(null)
  const [tollInfo, setTollInfo] = useState<TollInfo | null>(null)
  const [stations, setStations] = useState<RouteStation[]>([])

  const originTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const destTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mapRef = useRef<MapRef | null>(null)
  const geo = useGeolocation()
  const { data: stationHistory = [] } = useGlobalStationHistory()
  const { data: vehicles = [] } = useVehicles()
  const { data: vehicleStats } = useVehicleStats(selectedVehicleId)

  const avgConsumption = vehicleStats?.average_consumption ?? 7 // L/100km fallback

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setRoute(null)
      setTollInfo(null)
      setStations([])
      setError(null)
      setLoading(false)
    }
  }, [open])

  // Fit map to route bounds after route loads
  useEffect(() => {
    if (!route || !mapRef.current) return
    const map = mapRef.current
    const lons = route.coordinates.map(([lon]) => lon)
    const lats = route.coordinates.map(([, lat]) => lat)
    map.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: 40, duration: 800 }
    )
  }, [route])

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

  const handleGpsCapture = () => geo.capture()

  // Apply GPS result to origin
  useEffect(() => {
    if (geo.status === 'success' && geo.latitude != null && geo.longitude != null && !origin) {
      setOrigin({ lat: geo.latitude, lon: geo.longitude, label: 'Position GPS' })
      setOriginInput('Position GPS')
    }
  }, [geo.status, geo.latitude, geo.longitude, origin])

  // Parse Google Maps URL
  const handleGmapsUrl = (val: string) => {
    setGmapsUrl(val)
    const parsed = parseGoogleMapsUrl(val)
    if (parsed) {
      setOriginInput(parsed.origin)
      setDestInput(parsed.dest)
      // Trigger commune search for both
      searchCommunes(parsed.origin, setOriginSuggestions)
      searchCommunes(parsed.dest, setDestSuggestions)
    }
  }

  const canSearch = !!origin && !!dest && !loading

  const handleSearch = async () => {
    if (!origin || !dest) return
    setLoading(true)
    setError(null)
    setRoute(null)
    setTollInfo(null)
    setStations([])

    try {
      // 1. Fetch normal route + toll-free route in parallel
      const [normalRoute, tollFreeRoute] = await Promise.all([
        fetchOsrmRoute(origin, dest, false),
        fetchOsrmRoute(origin, dest, true),
      ])

      if (!normalRoute) throw new Error("Impossible de calculer l'itinéraire")
      setRoute(normalRoute)

      const distDiff = tollFreeRoute
        ? tollFreeRoute.distanceM - normalRoute.distanceM
        : 0
      const hasTolls = !!tollFreeRoute && distDiff > 500 // >500m longer means normal route uses tolls

      setTollInfo({
        normalRoute,
        tollFreeRoute: hasTolls ? tollFreeRoute : null,
        hasTolls,
      })

      // 2. Fetch stations around the route bounding box
      const lons = normalRoute.coordinates.map(([lon]) => lon)
      const lats = normalRoute.coordinates.map(([, lat]) => lat)
      const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
      const midLon = (Math.min(...lons) + Math.max(...lons)) / 2
      const radiusKm = Math.ceil(normalRoute.distanceM / 2000 + maxDetourKm + 10)

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

          // Filter by distance to actual OSRM polyline
          const perpM = distToPolylineM(sLat, sLon, normalRoute.coordinates)
          if (perpM > maxDetourKm * 1000) return []

          const directM = haversineM(origin.lat, origin.lon, dest.lat, dest.lon)
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
          if (price == null) return []

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
            _knownName: !!historyMatch,
          } as RouteStation & { _knownName?: boolean }]
        })
        .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))

      setStations(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }

  // ─── Derived values ─────────────────────────────────────────────────────────

  const cheapest = stations[0] ?? null

  // Toll bypass extra cost = (extra km) × (consumption / 100) × (cheapest fuel price)
  const tollBypassCostPerLiter = cheapest?.price ?? 1.8
  const tollBypassExtraKm = tollInfo?.tollFreeRoute
    ? (tollInfo.tollFreeRoute.distanceM - tollInfo.normalRoute.distanceM) / 1000
    : 0
  const tollBypassFuelCost = (tollBypassExtraKm * avgConsumption / 100) * tollBypassCostPerLiter

  // Google Maps waypoint URL
  const googleMapsUrl = (() => {
    if (!route || !origin || !dest) return null
    const waypoints = samplePolyline(route.coordinates, 8)
      .map(([lon, lat]) => `${lat},${lon}`)
      .join('/')
    return `https://www.google.com/maps/dir/${waypoints}`
  })()

  const handleGpxDownload = () => {
    if (!route || !origin || !dest) return
    const gpx = toGpx(route.coordinates, `${origin.label} → ${dest.label}`)
    const blob = new Blob([gpx], { type: 'application/gpx+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'itineraire.gpx'
    a.click()
  }

  const mapCenter: [number, number] = origin
    ? [origin.lon, origin.lat]
    : [2.3522, 46.8]

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl px-3 sm:px-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5" />
            Planificateur de trajet
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Input form ─────────────────────────────────────────────── */}

          {/* Google Maps URL import */}
          <div className="space-y-1">
            <Label className="text-xs">Importer depuis Google Maps (optionnel)</Label>
            <Input
              value={gmapsUrl}
              onChange={(e) => handleGmapsUrl(e.target.value)}
              placeholder="https://www.google.com/maps/dir/Paris/Lyon"
              className="h-9 text-xs"
            />
          </div>

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
                disabled={geo.status === 'loading'}
              >
                {geo.status === 'loading'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Navigation className="h-4 w-4" />}
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

          {/* Vehicle + fuel + detour */}
          <div className="grid grid-cols-3 gap-2">
            {vehicles.length > 0 && (
              <div className="col-span-3 sm:col-span-1 space-y-1">
                <Label className="text-xs">Véhicule</Label>
                <Select
                  value={selectedVehicleId != null ? String(selectedVehicleId) : ''}
                  onValueChange={(v) => setSelectedVehicleId(v ? Number(v) : null)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.brand} {v.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
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
            <div className="space-y-1">
              <Label className="text-xs">Détour max</Label>
              <Select value={String(maxDetourKm)} onValueChange={(v) => setMaxDetourKm(Number(v))}>
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

          <Button className="w-full" onClick={handleSearch} disabled={!canSearch}>
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Calcul en cours…</>
              : <><Route className="mr-2 h-4 w-4" />Calculer l'itinéraire</>}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* ── Map ────────────────────────────────────────────────────── */}
          {route && (
            <div className="h-72 w-full overflow-hidden rounded-lg border">
              <Map
                ref={mapRef}
                center={mapCenter}
                zoom={5}
                className="h-full w-full"
              >
                {/* Route polyline */}
                <MapRoute
                  id="main-route"
                  coordinates={route.coordinates}
                  color="#3b82f6"
                  width={4}
                  opacity={0.85}
                />

                {/* Toll-free alternative */}
                {tollInfo?.tollFreeRoute && (
                  <MapRoute
                    id="toll-free-route"
                    coordinates={tollInfo.tollFreeRoute.coordinates}
                    color="#f97316"
                    width={3}
                    opacity={0.7}
                    dashArray={[6, 4]}
                  />
                )}

                {/* Origin marker */}
                {origin && (
                  <MapMarker longitude={origin.lon} latitude={origin.lat}>
                    <MarkerContent>
                      <div className="h-4 w-4 rounded-full border-2 border-white bg-green-500 shadow-lg" />
                    </MarkerContent>
                  </MapMarker>
                )}

                {/* Destination marker */}
                {dest && (
                  <MapMarker longitude={dest.lon} latitude={dest.lat}>
                    <MarkerContent>
                      <div className="h-4 w-4 rounded-full border-2 border-white bg-red-500 shadow-lg" />
                    </MarkerContent>
                  </MapMarker>
                )}

                {/* Station markers */}
                {stations.slice(0, 10).map((s, i) => (
                  <MapMarker key={s.id} longitude={s.longitude} latitude={s.latitude}>
                    <MarkerContent>
                      <div className={`h-3 w-3 rounded-full border-2 border-white shadow ${i === 0 ? 'bg-green-500' : 'bg-slate-400'}`} />
                    </MarkerContent>
                    <MarkerPopup>
                      <p className="font-medium text-xs">{s.name}</p>
                      <p className="text-xs">{s.price?.toFixed(3)} €/L</p>
                      {i === 0 && <Badge className="mt-1 h-4 px-1 text-[10px] bg-green-100 text-green-700">moins cher</Badge>}
                    </MarkerPopup>
                  </MapMarker>
                ))}

                <MapControls showZoom position="bottom-right" />
              </Map>
            </div>
          )}

          {/* ── Results ────────────────────────────────────────────────── */}
          {route && (
            <div className="space-y-3">
              {/* Route summary */}
              <Section title="Résumé du trajet">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Distance</p>
                    <p className="text-lg font-bold">{formatDistance(route.distanceM)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Durée estimée</p>
                    <p className="text-lg font-bold">{formatDuration(route.durationS)}</p>
                  </div>
                  {avgConsumption && cheapest?.price && (
                    <div className="text-center col-span-2 sm:col-span-1">
                      <p className="text-xs text-muted-foreground">Coût carburant estimé</p>
                      <p className="text-lg font-bold">
                        {((route.distanceM / 1000) * avgConsumption / 100 * cheapest.price).toFixed(0)} €
                      </p>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Itinéraire calculé via OpenStreetMap (OSRM) — peut légèrement différer de Google Maps.
                </p>
              </Section>

              {/* Cheapest station */}
              <Section title={`Stations sur le trajet (${stations.length})`} defaultOpen={stations.length > 0}>
                {stations.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Aucune station trouvée. Essayez d'augmenter le détour max.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stations.map((s, i) => {
                      const isCheapest = i === 0
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const knownName = (s as any)._knownName as boolean | undefined
                      return (
                        <div
                          key={s.id}
                          className={`rounded-lg border p-3 ${isCheapest ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1 flex-wrap">
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
                                Détour : +{(s.detourM / 1000).toFixed(1)} km
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
              </Section>

              {/* Toll section */}
              <Section title="Péages" defaultOpen={!!tollInfo?.hasTolls}>
                {!tollInfo?.hasTolls ? (
                  <p className="text-sm text-muted-foreground py-1">
                    Aucun péage détecté sur cet itinéraire.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground mb-1">Itinéraire direct (avec péages)</p>
                        <p className="font-semibold text-sm">{formatDistance(tollInfo.normalRoute.distanceM)}</p>
                        <p className="text-xs text-muted-foreground">{formatDuration(tollInfo.normalRoute.durationS)}</p>
                      </div>
                      {tollInfo.tollFreeRoute && (
                        <div className="rounded-lg border border-orange-400 p-3">
                          <p className="text-xs text-muted-foreground mb-1">Sans péage (orange pointillé)</p>
                          <p className="font-semibold text-sm">{formatDistance(tollInfo.tollFreeRoute.distanceM)}</p>
                          <p className="text-xs text-muted-foreground">{formatDuration(tollInfo.tollFreeRoute.durationS)}</p>
                          <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                            +{(tollBypassExtraKm).toFixed(0)} km · +{tollBypassFuelCost.toFixed(1)} € carburant
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Coût des péages non disponible (données OpenStreetMap). Comparez avec autoroute-eco.fr pour les tarifs exacts.
                    </p>
                  </div>
                )}
              </Section>

              {/* Share */}
              <Section title="Partager l'itinéraire" defaultOpen={false}>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {googleMapsUrl && (
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Ouvrir dans Google Maps
                      </a>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="flex-1" onClick={handleGpxDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Télécharger GPX
                  </Button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Google Maps : des points intermédiaires forcent le même tracé. GPX : compatible OsmAnd, Waze, etc.
                </p>
              </Section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
