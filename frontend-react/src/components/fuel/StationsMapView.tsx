import { useEffect, useMemo } from 'react'
import { Navigation } from 'lucide-react'
import { Map, MapMarker, MarkerContent, MarkerLabel, MarkerPopup, MapControls, useMap } from '@/components/ui/map'
import { formatDrivingTime, formatRoadDistance } from '@/hooks/use-station-routes'
import type { RouteLeg } from '@/types'

export interface MappedStation {
  id: string
  name: string
  address: string
  latitude: number
  longitude: number
  price: number | null
  isCheapest: boolean
  isFavorite: boolean
  crowFliesM: number
  route: RouteLeg | undefined
}

interface StationsMapViewProps {
  origin: { lat: number; lon: number; label: string }
  stations: MappedStation[]
}

type Bounds = [[number, number], [number, number]]

/**
 * MapLibre only reads `bounds` at construction, so refit imperatively whenever
 * the search origin or the station set changes.
 */
function FitBounds({ bounds }: { bounds: Bounds }) {
  const { map } = useMap()
  const key = bounds.flat().join(',')

  useEffect(() => {
    if (!map) return
    map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 400 })
    // bounds is rebuilt every render; `key` is its stable value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])

  return null
}

export function StationsMapView({ origin, stations }: StationsMapViewProps) {
  const bounds = useMemo<Bounds>(() => {
    const lons = [origin.lon, ...stations.map((s) => s.longitude)]
    const lats = [origin.lat, ...stations.map((s) => s.latitude)]
    // A lone origin would collapse the box to a point and zoom to the max.
    const pad = stations.length === 0 ? 0.02 : 0
    return [
      [Math.min(...lons) - pad, Math.min(...lats) - pad],
      [Math.max(...lons) + pad, Math.max(...lats) + pad],
    ]
  }, [origin, stations])

  return (
    // MapLibre reads its container size at init, and a percentage height
    // inside this dialog's flex chain resolves to 0 — use a definite height,
    // same as the StationsMap chart does.
    <div className="h-[360px] overflow-hidden rounded-md border sm:h-[440px]">
      <Map center={[origin.lon, origin.lat]} zoom={11}>
        <MapControls />
        <FitBounds bounds={bounds} />

        <MapMarker longitude={origin.lon} latitude={origin.lat}>
          <MarkerContent>
            <div className="h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 shadow-md ring-4 ring-blue-500/25" />
          </MarkerContent>
          <MarkerPopup>
            <p className="text-sm font-medium">{origin.label}</p>
          </MarkerPopup>
        </MapMarker>

        {stations.map((s) => (
          <MapMarker key={s.id} longitude={s.longitude} latitude={s.latitude}>
            <MarkerContent>
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow-lg ${
                  s.isCheapest ? 'bg-green-600' : s.isFavorite ? 'bg-yellow-500' : 'bg-primary'
                }`}
              >
                <span className="text-xs text-white">&#9981;</span>
              </div>
            </MarkerContent>
            {s.price != null && (
              <MarkerLabel className="text-[11px] font-semibold">
                {s.price.toFixed(3)}
              </MarkerLabel>
            )}
            <MarkerPopup>
              <div className="min-w-[190px] space-y-1">
                <p className="text-sm font-semibold text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.address}</p>
                {s.price != null && (
                  <p className="text-sm font-bold text-primary">{s.price.toFixed(3)} &euro;/L</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {s.route?.distance_m != null && s.route.duration_s != null
                    ? `${formatRoadDistance(s.route.distance_m)} par la route · ${formatDrivingTime(s.route.duration_s)}`
                    : `${formatRoadDistance(s.crowFliesM)} à vol d'oiseau`}
                </p>
                <a
                  className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-primary hover:underline"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation className="h-3 w-3" />
                  Y aller
                </a>
              </div>
            </MarkerPopup>
          </MapMarker>
        ))}
      </Map>
    </div>
  )
}
