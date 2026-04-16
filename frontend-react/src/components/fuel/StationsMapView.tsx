import { useEffect, useMemo, useRef, useState } from 'react'
import { Fuel } from 'lucide-react'
import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerLabel,
  MapPopup,
  MapClusterLayer,
  type MapRef,
  type MapViewport,
} from '@/components/ui/map'
import type { LngLatLike } from 'maplibre-gl'
import type {
  BBox,
  NearbyStation,
  StationPrices,
} from '@/hooks/use-nearby-stations'
import { STATION_FUEL_OPTIONS } from '@/hooks/use-nearby-stations'

interface ViewportParams {
  center: [number, number]
  zoom: number
  bbox: BBox
}

interface StationsMapViewProps {
  stations: NearbyStation[]
  /** Initial map center (user GPS) */
  center: { latitude: number; longitude: number } | null
  /** Fuel type currently selected — drives the price shown on marker labels */
  fuelKey: keyof StationPrices
  /** Callback fired (debounced) when the user pans/zooms. Parent can use this
   *  to trigger a wider refetch. */
  onViewportChange?: (params: ViewportParams) => void
  className?: string
}

const CLUSTER_MAX_ZOOM = 13
const INDIVIDUAL_MARKER_MIN_ZOOM = 12
const VIEWPORT_DEBOUNCE_MS = 600
const DEFAULT_FRANCE_CENTER: [number, number] = [2.5, 46.5]
const DEFAULT_FRANCE_ZOOM = 5

function formatUpdate(iso: string | null): string {
  if (!iso) return 'N/D'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'N/D'
  return d.toLocaleDateString('fr-FR')
}

export function StationsMapView({
  stations,
  center,
  fuelKey,
  onViewportChange,
  className,
}: StationsMapViewProps) {
  const mapRef = useRef<MapRef | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [zoom, setZoom] = useState<number>(center ? 12 : DEFAULT_FRANCE_ZOOM)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const onViewportChangeRef = useRef(onViewportChange)
  onViewportChangeRef.current = onViewportChange

  // Freeze initial center/zoom so we use uncontrolled mode (Map is
  // controlled only when both `viewport` and `onViewportChange` are provided,
  // which would snap the map back after each pan/zoom). Subsequent centering
  // on GPS updates is handled imperatively via flyTo below.
  const [initialCenter] = useState<LngLatLike>(() =>
    center ? [center.longitude, center.latitude] : DEFAULT_FRANCE_CENTER,
  )
  const [initialZoom] = useState<number>(() => (center ? 12 : DEFAULT_FRANCE_ZOOM))

  // When GPS becomes available after the map is initialized, recenter
  const lastCenterRef = useRef<string | null>(null)
  useEffect(() => {
    if (!mapRef.current || !center) return
    const key = `${center.latitude},${center.longitude}`
    if (lastCenterRef.current === key) return
    lastCenterRef.current = key
    mapRef.current.flyTo({
      center: [center.longitude, center.latitude],
      zoom: 12,
      duration: 800,
    })
  }, [center])

  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: stations.map((s) => ({
        type: 'Feature' as const,
        properties: { id: s.id },
        geometry: {
          type: 'Point' as const,
          coordinates: [s.longitude, s.latitude] as [number, number],
        },
      })),
    }),
    [stations],
  )

  const selectedStation = useMemo(
    () => stations.find((s) => s.id === selectedId) ?? null,
    [stations, selectedId],
  )

  // Clear selection if the underlying station list changes and the selected
  // id is no longer present
  useEffect(() => {
    if (selectedId && !stations.some((s) => s.id === selectedId)) {
      setSelectedId(null)
    }
  }, [stations, selectedId])

  const handleViewportChange = (v: MapViewport) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setZoom(v.zoom)
      if (!onViewportChangeRef.current) return
      const map = mapRef.current
      if (!map) return
      const bounds = map.getBounds()
      onViewportChangeRef.current?.({
        center: v.center,
        zoom: v.zoom,
        bbox: {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
      })
    }, VIEWPORT_DEBOUNCE_MS)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const showIndividualMarkers = zoom >= INDIVIDUAL_MARKER_MIN_ZOOM

  return (
    <div className={className}>
      <Map
        ref={mapRef}
        center={initialCenter}
        zoom={initialZoom}
        onViewportChange={handleViewportChange}
      >
        <MapControls showLocate />

        {/* Clustering: native MapLibre GeoJSON clusters. Unclustered points
            are rendered transparent so that our DOM MapMarkers below are the
            only visible individual markers. */}
        <MapClusterLayer
          data={geojson}
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
          clusterRadius={60}
          pointColor="transparent"
        />

        {/* Individual station markers with the selected fuel price label */}
        {showIndividualMarkers &&
          stations.map((s) => {
            const price = s.prices[fuelKey]
            return (
              <MapMarker
                key={s.id}
                longitude={s.longitude}
                latitude={s.latitude}
                onClick={() => setSelectedId(s.id)}
              >
                <MarkerContent>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary shadow-md hover:scale-110 transition-transform">
                    <Fuel className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                </MarkerContent>
                {price != null && (
                  <MarkerLabel position="bottom">
                    <span className="rounded-sm bg-background/90 px-1 py-0.5 shadow-sm">
                      {price.toFixed(3)} €
                    </span>
                  </MarkerLabel>
                )}
              </MapMarker>
            )
          })}

        {/* Popup for the selected station — all fuel types + last update */}
        {selectedStation && (
          <MapPopup
            longitude={selectedStation.longitude}
            latitude={selectedStation.latitude}
            onClose={() => setSelectedId(null)}
            closeButton
            className="min-w-[220px]"
          >
            <div className="space-y-2">
              <div>
                <p className="text-sm font-semibold leading-tight">
                  {selectedStation.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedStation.address}
                </p>
              </div>
              <div className="space-y-0.5 border-t pt-1.5">
                {STATION_FUEL_OPTIONS.map((opt) => {
                  const p = selectedStation.prices[opt.key]
                  if (p == null) return null
                  const updated = selectedStation.updates[opt.key]
                  const isCurrent = opt.key === fuelKey
                  return (
                    <div
                      key={opt.key}
                      className={`flex items-baseline justify-between gap-3 text-xs ${
                        isCurrent ? 'font-semibold' : ''
                      }`}
                    >
                      <span>{opt.label.split(' ')[0]}</span>
                      <span className="flex items-baseline gap-1">
                        <span>{p.toFixed(3)} €/L</span>
                        <span className="text-[10px] text-muted-foreground">
                          màj {formatUpdate(updated)}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </MapPopup>
        )}
      </Map>
    </div>
  )
}
