import { useEffect, useRef } from 'react'
import { MapPin, Loader2, ChevronDown, ChevronUp, BookMarked, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useNearbyStations } from '@/hooks/use-nearby-stations'
import type { StationPrices } from '@/hooks/use-nearby-stations'
import { useFavoriteStations } from '@/hooks/use-favorite-stations'
import type { FuelType } from '@/types'
import { useState } from 'react'

interface HistoryEntry {
  latitude: number | null
  longitude: number | null
  station_name: string | null
}

interface NearbyStationsListProps {
  latitude: number
  longitude: number
  fuelType: FuelType
  /** Past fuel entries with GPS + station_name — used to override the raw API adresse */
  historyEntries?: HistoryEntry[]
  onSelect: (
    stationName: string,
    location: string,
    pricePerLiter: number | null,
    prices?: StationPrices,
  ) => void
  /** Auto-select the nearest station with a valid price */
  autoSelect?: boolean
}

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

export function NearbyStationsList({
  latitude,
  longitude,
  fuelType,
  historyEntries,
  onSelect,
  autoSelect = false,
}: NearbyStationsListProps) {
  const [open, setOpen] = useState(true)
  const { stations, loading, error, fetch, clear } = useNearbyStations()
  const { toggle: toggleFav, isFavorite } = useFavoriteStations()
  const hasAutoSelected = useRef(false)

  useEffect(() => {
    fetch(latitude, longitude, fuelType)
    return () => {
      clear()
      hasAutoSelected.current = false
    }
  }, [latitude, longitude, fuelType, fetch, clear])

  // Auto-select the nearest station with a valid price
  useEffect(() => {
    if (!autoSelect || loading || error || stations.length === 0 || hasAutoSelected.current) return

    const best = stations.reduce<(typeof stations)[number] | null>((best, s) => {
      if (s.price == null) return best
      if (best == null || s.distanceM < best.distanceM) return s
      return best
    }, null)

    if (best) {
      hasAutoSelected.current = true
      const knownName = historyEntries
        ?.find(
          (e) =>
            e.latitude != null &&
            e.longitude != null &&
            e.station_name &&
            haversineM(e.latitude, e.longitude, best.latitude, best.longitude) < 200,
        )
        ?.station_name ?? null
      const displayName = knownName ?? best.name
      onSelect(displayName, [displayName, best.address].filter(Boolean).join(', '), best.price, best.prices)
    }
  }, [autoSelect, loading, error, stations, historyEntries, onSelect])

  const formatDistance = (m: number) =>
    m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`

  return (
    <div className="rounded-md border bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          Stations proches
          {stations.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
              {stations.length}
            </Badge>
          )}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="border-t px-3 pb-2">
          {loading && (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Chargement des prix…
            </div>
          )}
          {error && (
            <p className="py-2 text-xs text-destructive">{error}</p>
          )}
          {!loading && !error && stations.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">
              Aucune station trouvée dans un rayon de 5 km.
            </p>
          )}
          {!loading && stations.length > 0 && (
            <div className="mt-1 max-h-48 space-y-1 overflow-y-auto">
              {[...stations]
                .sort((a, b) => {
                  const favA = isFavorite(a.id) ? 0 : 1
                  const favB = isFavorite(b.id) ? 0 : 1
                  if (favA !== favB) return favA - favB
                  return a.distanceM - b.distanceM
                })
                .map((s) => {
                const knownName = historyEntries
                  ?.find(
                    (e) =>
                      e.latitude != null &&
                      e.longitude != null &&
                      e.station_name &&
                      haversineM(e.latitude, e.longitude, s.latitude, s.longitude) < 200,
                  )
                  ?.station_name ?? null
                const displayName = knownName ?? s.name
                return (
                <div
                  key={s.id}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 ${isFavorite(s.id) ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}`}
                >
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-yellow-500 transition-colors mr-1.5"
                    onClick={(e) => { e.stopPropagation(); toggleFav({ id: s.id, name: displayName, lat: s.latitude, lon: s.longitude }) }}
                    title={isFavorite(s.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  >
                    <Star className={`h-3.5 w-3.5 ${isFavorite(s.id) ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                  </button>
                  <button
                    type="button"
                    className="flex flex-1 items-center justify-between text-left hover:bg-muted rounded-md px-1"
                    onClick={() => {
                      onSelect(displayName, [displayName, s.address].filter(Boolean).join(', '), s.price, s.prices)
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {knownName ? (
                          <span className="flex items-center gap-1">
                            <BookMarked className="h-3 w-3 shrink-0 text-primary" />
                            {knownName}
                          </span>
                        ) : s.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.address}
                      </p>
                    </div>
                    <div className="ml-2 shrink-0 text-right">
                      {s.price != null ? (
                        <p className="text-sm font-semibold text-primary">
                          {s.price.toFixed(3)} €/L
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">prix N/D</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDistance(s.distanceM)}
                      </p>
                    </div>
                  </button>
                </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
