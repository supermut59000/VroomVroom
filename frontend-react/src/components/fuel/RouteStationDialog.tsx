import { useState, useRef, useEffect, useCallback } from 'react'
import { Route, Loader2, ChevronDown, ChevronUp, ExternalLink, Download, AlertCircle, Car } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Map, MapMarker, MarkerContent, MapControls, MapRoute } from '@/components/ui/map'
import { useVehicles, useVehicleStats } from '@/hooks/use-vehicles'
import type { MapRef } from '@/components/ui/map'

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface RouteStationDialogProps {
  open: boolean
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m} min`
}

function formatKm(m: number): string {
  return `${(m / 1000).toFixed(0)} km`
}

/**
 * Parse a Google Maps directions URL.
 * Extracts place names from the path and coordinates from the encoded data param.
 *
 * Works with long-form URLs like:
 *   google.com/maps/dir/Nieppe,+59850/Troyes,+10000/@.../data=...!1d2.83!2d50.70...!1d4.07!2d48.29...
 *
 * The data param encodes waypoint coords as pairs: !1d{lon}!2d{lat}
 */
function parseGoogleMapsUrl(url: string): { origin: RoutePoint; dest: RoutePoint } | null {
  try {
    // Extract place name segments from the path
    const pathMatch = url.match(/\/maps\/dir\/([^/@]+)\/([^/@]+)/)
    if (!pathMatch) return null

    const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, ' ')).replace(/,\s*$/, '').trim()
    const originLabel = decode(pathMatch[1])
    const destLabel = decode(pathMatch[2])

    // Extract coordinate pairs from the data param: !1d{lon}!2d{lat}
    const coordRe = /!1d([\d.-]+)!2d([\d.-]+)/g
    const coords: { lon: number; lat: number }[] = []
    let m: RegExpExecArray | null
    while ((m = coordRe.exec(url)) !== null) {
      coords.push({ lon: parseFloat(m[1]), lat: parseFloat(m[2]) })
    }

    if (coords.length < 2) return null

    return {
      origin: { lon: coords[0].lon, lat: coords[0].lat, label: originLabel },
      dest: { lon: coords[coords.length - 1].lon, lat: coords[coords.length - 1].lat, label: destLabel },
    }
  } catch {
    return null
  }
}

async function fetchOsrmRoute(
  origin: RoutePoint,
  dest: RoutePoint,
  excludeToll = false,
): Promise<OsrmRoute | null> {
  const exclude = excludeToll ? '&exclude=toll' : ''
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${dest.lon},${dest.lat}?geometries=geojson&overview=full${exclude}`
  try {
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
  } catch {
    return null
  }
}

/** Sample N evenly-spaced points from a polyline for Google Maps waypoint URLs. */
function samplePolyline(coords: [number, number][], n: number): [number, number][] {
  if (coords.length <= n) return coords
  const step = (coords.length - 1) / (n - 1)
  return Array.from({ length: n }, (_, i) => coords[Math.round(i * step)])
}

function toGpx(coords: [number, number][], name: string): string {
  const pts = coords.map(([lon, lat]) => `    <trkpt lat="${lat}" lon="${lon}"></trkpt>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="VroomVroom">
  <trk><name>${name}</name><trkseg>
${pts}
  </trkseg></trk>
</gpx>`
}

// ─── Collapsible section ─────────────────────────────────────────────────────

function Section({ title, badge, defaultOpen = true, children }: {
  title: string
  badge?: React.ReactNode
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
        <span className="flex items-center gap-2">{title}{badge}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t px-3 pb-3 pt-2">{children}</div>}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RouteStationDialog({ open, onClose }: RouteStationDialogProps) {
  const [gmapsUrl, setGmapsUrl] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [origin, setOrigin] = useState<RoutePoint | null>(null)
  const [dest, setDest] = useState<RoutePoint | null>(null)
  const [route, setRoute] = useState<OsrmRoute | null>(null)
  const [hasTolls, setHasTolls] = useState(false)
  const [tollFreeRoute, setTollFreeRoute] = useState<OsrmRoute | null>(null)

  const mapRef = useRef<MapRef | null>(null)
  const { data: vehicles = [] } = useVehicles()
  const { data: stats } = useVehicleStats(selectedVehicleId)

  const consumption = stats?.average_consumption ?? null   // L/100km
  const pricePerLiter = stats?.average_fuel_price ?? null  // €/L

  // Auto-select first vehicle
  useEffect(() => {
    if (vehicles.length > 0 && selectedVehicleId == null) {
      setSelectedVehicleId(vehicles[0].id)
    }
  }, [vehicles, selectedVehicleId])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setGmapsUrl('')
      setParseError(null)
      setFetchError(null)
      setRoute(null)
      setOrigin(null)
      setDest(null)
      setHasTolls(false)
      setTollFreeRoute(null)
      setLoading(false)
    }
  }, [open])

  // Fit map to route bounds
  useEffect(() => {
    if (!route || !mapRef.current) return
    const lons = route.coordinates.map(([lon]) => lon)
    const lats = route.coordinates.map(([, lat]) => lat)
    mapRef.current.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: 48, duration: 800 }
    )
  }, [route])

  const handleUrlInput = useCallback((val: string) => {
    setGmapsUrl(val)
    setParseError(null)
  }, [])

  const handleSearch = async () => {
    setParseError(null)
    setFetchError(null)

    const parsed = parseGoogleMapsUrl(gmapsUrl)
    if (!parsed) {
      setParseError("URL non reconnue. Copiez l'URL complète depuis Google Maps (format /maps/dir/…).")
      return
    }

    setOrigin(parsed.origin)
    setDest(parsed.dest)
    setRoute(null)
    setHasTolls(false)
    setTollFreeRoute(null)
    setLoading(true)

    try {
      const [normal, tollFree] = await Promise.all([
        fetchOsrmRoute(parsed.origin, parsed.dest, false),
        fetchOsrmRoute(parsed.origin, parsed.dest, true),
      ])

      if (!normal) {
        setFetchError("Impossible de calculer l'itinéraire via OSRM. Réessayez.")
        return
      }

      setRoute(normal)

      const distDiff = tollFree ? tollFree.distanceM - normal.distanceM : 0
      const detectedTolls = !!tollFree && distDiff > 500
      setHasTolls(detectedTolls)
      setTollFreeRoute(detectedTolls ? tollFree : null)
    } finally {
      setLoading(false)
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const distKm = route ? route.distanceM / 1000 : 0
  const fuelLiters = consumption ? (distKm * consumption) / 100 : null
  const fuelCost = fuelLiters && pricePerLiter ? fuelLiters * pricePerLiter : null

  const tollFreeExtraKm = tollFreeRoute
    ? (tollFreeRoute.distanceM - (route?.distanceM ?? 0)) / 1000
    : 0
  const tollFreeExtraFuelCost =
    consumption && pricePerLiter
      ? (tollFreeExtraKm * consumption / 100) * pricePerLiter
      : null

  const googleMapsExportUrl = route && origin && dest
    ? `https://www.google.com/maps/dir/${samplePolyline(route.coordinates, 8).map(([lon, lat]) => `${lat},${lon}`).join('/')}`
    : null

  const mapCenter: [number, number] = origin ? [origin.lon, origin.lat] : [2.35, 46.8]

  // ─── Render ───────────────────────────────────────────────────────────────

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

          {/* ── URL input ───────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-xs">URL Google Maps</Label>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Créez votre itinéraire sur{' '}
              <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" className="underline">
                Google Maps
              </a>
              , copiez l'URL complète de la page, et collez-la ici.
            </p>
            <Input
              value={gmapsUrl}
              onChange={(e) => handleUrlInput(e.target.value)}
              placeholder="https://www.google.com/maps/dir/Ville+A/Ville+B/…"
              className="h-9 text-xs font-mono"
            />
            {parseError && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />{parseError}
              </p>
            )}
          </div>

          {/* ── Vehicle selector ────────────────────────────────────────── */}
          {vehicles.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Véhicule</Label>
              <Select
                value={selectedVehicleId != null ? String(selectedVehicleId) : ''}
                onValueChange={(v) => setSelectedVehicleId(v ? Number(v) : null)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sélectionner un véhicule" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.brand} {v.model} {v.year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {stats && (
                <p className="text-[11px] text-muted-foreground flex gap-3">
                  {consumption != null && <span>{consumption.toFixed(1)} L/100km</span>}
                  {pricePerLiter != null && <span>moy. {pricePerLiter.toFixed(3)} €/L</span>}
                </p>
              )}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleSearch}
            disabled={!gmapsUrl.trim() || loading}
          >
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Calcul en cours…</>
              : <><Route className="mr-2 h-4 w-4" />Analyser l'itinéraire</>}
          </Button>

          {fetchError && (
            <p className="flex items-center gap-1 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />{fetchError}
            </p>
          )}

          {/* ── Map ─────────────────────────────────────────────────────── */}
          {route && (
            <div className="h-72 w-full overflow-hidden rounded-lg border">
              <Map ref={mapRef} center={mapCenter} zoom={6} className="h-full w-full">
                {/* Main route — blue */}
                <MapRoute
                  id="main-route"
                  coordinates={route.coordinates}
                  color="#3b82f6"
                  width={4}
                  opacity={0.9}
                />
                {/* Toll-free alternative — orange dashed */}
                {tollFreeRoute && (
                  <MapRoute
                    id="toll-free"
                    coordinates={tollFreeRoute.coordinates}
                    color="#f97316"
                    width={3}
                    opacity={0.75}
                    dashArray={[6, 4]}
                  />
                )}
                {/* Origin */}
                {origin && (
                  <MapMarker longitude={origin.lon} latitude={origin.lat}>
                    <MarkerContent>
                      <div className="h-4 w-4 rounded-full border-2 border-white bg-green-500 shadow-lg" />
                    </MarkerContent>
                  </MapMarker>
                )}
                {/* Destination */}
                {dest && (
                  <MapMarker longitude={dest.lon} latitude={dest.lat}>
                    <MarkerContent>
                      <div className="h-4 w-4 rounded-full border-2 border-white bg-red-500 shadow-lg" />
                    </MarkerContent>
                  </MapMarker>
                )}
                <MapControls showZoom position="bottom-right" />
              </Map>
            </div>
          )}

          {/* ── Results ─────────────────────────────────────────────────── */}
          {route && (
            <div className="space-y-3">

              {/* Route summary */}
              <Section title="Résumé du trajet">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-muted/40 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Distance</p>
                    <p className="text-xl font-bold">{formatKm(route.distanceM)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Durée</p>
                    <p className="text-xl font-bold">{formatDuration(route.durationS)}</p>
                  </div>
                  {fuelLiters != null && (
                    <div className="rounded-lg bg-muted/40 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Carburant</p>
                      <p className="text-xl font-bold">{fuelLiters.toFixed(1)} L</p>
                    </div>
                  )}
                  {fuelCost != null && (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Coût carburant</p>
                      <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{fuelCost.toFixed(0)} €</p>
                    </div>
                  )}
                </div>
                {(!consumption || !pricePerLiter) && (
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Car className="h-3 w-3" />
                    Sélectionnez un véhicule avec des pleins enregistrés pour estimer le coût.
                  </p>
                )}
              </Section>

              {/* Tolls */}
              <Section
                title="Péages"
                badge={hasTolls
                  ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">détectés</span>
                  : <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">aucun</span>}
              >
                {!hasTolls ? (
                  <p className="text-sm text-muted-foreground py-1">
                    Aucun péage détecté sur cet itinéraire.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground mb-1">Avec péages <span className="inline-block h-2 w-2 rounded-full bg-blue-500 align-middle" /></p>
                        <p className="font-semibold">{formatKm(route.distanceM)}</p>
                        <p className="text-xs text-muted-foreground">{formatDuration(route.durationS)}</p>
                        <p className="mt-1 text-sm font-medium">
                          Prix péages :{' '}
                          <span className="text-muted-foreground italic">données à venir</span>
                        </p>
                      </div>
                      {tollFreeRoute && (
                        <div className="rounded-lg border border-orange-300 p-3">
                          <p className="text-xs text-muted-foreground mb-1">Sans péages <span className="inline-block h-2 w-2 rounded-full bg-orange-400 align-middle" /></p>
                          <p className="font-semibold">{formatKm(tollFreeRoute.distanceM)}</p>
                          <p className="text-xs text-muted-foreground">{formatDuration(tollFreeRoute.durationS)}</p>
                          <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                            +{tollFreeExtraKm.toFixed(0)} km
                            {tollFreeExtraFuelCost != null && ` · +${tollFreeExtraFuelCost.toFixed(1)} € carburant`}
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Détection via OpenStreetMap. Les tarifs des péages seront intégrés prochainement.
                    </p>
                  </div>
                )}
              </Section>

              {/* Share / export */}
              <Section title="Exporter" defaultOpen={false}>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {googleMapsExportUrl && (
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <a href={googleMapsExportUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Ouvrir dans Google Maps
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      if (!route || !origin || !dest) return
                      const gpx = toGpx(route.coordinates, `${origin.label} → ${dest.label}`)
                      const blob = new Blob([gpx], { type: 'application/gpx+xml' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = 'itineraire.gpx'
                      a.click()
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Télécharger GPX
                  </Button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  GPX compatible OsmAnd, Waze et autres apps de navigation.
                </p>
              </Section>

            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
