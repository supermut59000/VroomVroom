import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Fuel,
  MapPin,
  Loader2,
  Navigation,
  BookMarked,
  Star,
  List,
  Map as MapIcon,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useNearbyStations, STATION_FUEL_OPTIONS } from '@/hooks/use-nearby-stations'
import { useGeolocation } from '@/hooks/use-geolocation'
import { useGlobalStationHistory } from '@/hooks/use-fuel-entries'
import { useFavoriteStations } from '@/hooks/use-favorite-stations'
import {
  useStationRoutes,
  formatDrivingTime,
  formatRoadDistance,
} from '@/hooks/use-station-routes'
import { cheapestPrice, compareStations } from '@/lib/station-sort'
import type { StationSortKeys, StationSortMode } from '@/lib/station-sort'
import { StationsMapView } from './StationsMapView'
import type { MappedStation } from './StationsMapView'
import type { StationPrices } from '@/hooks/use-nearby-stations'

interface Commune {
  nom: string
  codesPostaux: string[]
  centre: { type: string; coordinates: [number, number] } // [lon, lat]
}

interface SearchOrigin {
  lat: number
  lon: number
  label: string
  mode: 'gps' | 'city'
}

interface StationPricesDialogProps {
  open: boolean
  onClose: () => void
}

type SortMode = StationSortMode
type ViewMode = 'list' | 'map'

const SORT_LABELS: Record<SortMode, string> = {
  price: 'Prix',
  distance: 'Distance',
  time: 'Temps de trajet',
}

const GEO_API = 'https://geo.api.gouv.fr/communes'

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

function communeLabel(c: Commune): string {
  const cp = c.codesPostaux[0] ?? ''
  return cp ? `${c.nom} (${cp})` : c.nom
}

export function StationPricesDialog({ open, onClose }: StationPricesDialogProps) {
  const [fuelKey, setFuelKey] = useState<keyof StationPrices>('e10')
  const [sortMode, setSortMode] = useState<SortMode>('price')
  const [view, setView] = useState<ViewMode>('list')
  const [radiusKm, setRadiusKm] = useState(5)
  const [origin, setOrigin] = useState<SearchOrigin | null>(null)
  const [cityInput, setCityInput] = useState('')
  const [suggestions, setSuggestions] = useState<Commune[]>([])
  const [cityLoading, setCityLoading] = useState(false)
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const geo = useGeolocation()
  const { stations, loading, error, fetch: fetchStations, clear } = useNearbyStations()
  const { data: stationHistory = [] } = useGlobalStationHistory()
  const { toggle: toggleFav, isFavorite } = useFavoriteStations()

  // Reset on open/close
  useEffect(() => {
    if (open) {
      geo.capture()
    } else {
      geo.reset()
      clear()
      setOrigin(null)
      setCityInput('')
      setSuggestions([])
      setView('list')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // GPS → origin (only if not in city mode)
  useEffect(() => {
    if (
      geo.status === 'success' &&
      geo.latitude != null &&
      geo.longitude != null &&
      origin?.mode !== 'city'
    ) {
      setOrigin({ lat: geo.latitude, lon: geo.longitude, label: 'GPS', mode: 'gps' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status, geo.latitude, geo.longitude])

  // Fetch stations whenever origin / fuelKey / radiusKm changes
  useEffect(() => {
    if (origin != null) {
      fetchStations(origin.lat, origin.lon, fuelKey, radiusKm)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, fuelKey, radiusKm])

  // Autocomplete from geo.api.gouv.fr
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    setCityLoading(true)
    try {
      const isPostal = /^\d+$/.test(q)
      const params = new URLSearchParams()
      if (isPostal) {
        params.set('codePostal', q)
      } else {
        params.set('nom', q)
        params.set('boost', 'population')
      }
      params.set('fields', 'nom,codesPostaux,centre')
      params.set('limit', '8')
      const res = await window.fetch(`${GEO_API}?${params}`)
      if (!res.ok) throw new Error()
      const data: Commune[] = await res.json()
      setSuggestions(data)
    } catch {
      setSuggestions([])
    } finally {
      setCityLoading(false)
    }
  }, [])

  const handleCityInput = (value: string) => {
    setCityInput(value)

    // If the typed value exactly matches a datalist option, use those coords
    const match = suggestions.find((c) => communeLabel(c) === value)
    if (match) {
      const [lon, lat] = match.centre.coordinates
      setOrigin({ lat, lon, label: communeLabel(match), mode: 'city' })
      return
    }

    // Clear city origin when user edits the field freely
    if (origin?.mode === 'city') setOrigin(null)

    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    suggestTimer.current = setTimeout(() => fetchSuggestions(value), 300)
  }

  // Road distance/time to each station. Straight-line distance is a poor guide
  // wherever a mountain or a river sits in between.
  const routeTargets = useMemo(
    () => stations.map((s) => ({ id: s.id, latitude: s.latitude, longitude: s.longitude })),
    [stations],
  )
  const { routes, loading: routesLoading, unavailable: routesUnavailable } = useStationRoutes(
    origin ? { latitude: origin.lat, longitude: origin.lon } : null,
    routeTargets,
  )

  const sortKeys = (s: (typeof stations)[number]): StationSortKeys => ({
    isFavorite: isFavorite(s.id),
    price: s.prices[fuelKey],
    distanceM: s.distanceM,
    durationS: routes.get(s.id)?.duration_s ?? null,
  })

  const sorted = [...stations].sort((a, b) =>
    compareStations(sortKeys(a), sortKeys(b), sortMode),
  )

  // The cheapest station is the one with the lowest price — not the first row.
  // Favourites float to the top of every sort, so row 0 is regularly something
  // more expensive.
  const minPrice = cheapestPrice(stations.map((s) => ({ price: s.prices[fuelKey] })))

  const formatDist = (m: number) =>
    m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`

  const mappedStations = useMemo<MappedStation[]>(
    () =>
      sorted.map((s) => {
        const knownName = stationHistory.find(
          (e) => haversineM(e.latitude, e.longitude, s.latitude, s.longitude) < 200,
        )?.station_name ?? null
        return {
          id: s.id,
          name: knownName ?? s.name,
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          price: s.prices[fuelKey],
          isCheapest: minPrice != null && s.prices[fuelKey] === minPrice,
          isFavorite: isFavorite(s.id),
          crowFliesM: s.distanceM,
          route: routes.get(s.id),
        }
      }),
    // `sorted` is rebuilt each render from these same inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stations, sortMode, fuelKey, minPrice, routes, stationHistory, isFavorite],
  )

  const fuelLabel = STATION_FUEL_OPTIONS.find((o) => o.key === fuelKey)?.label ?? fuelKey

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fuel className="h-5 w-5 text-primary" />
            Prix des stations proches
          </DialogTitle>
        </DialogHeader>

        {/* City search bar — native datalist, same pattern as station name in FuelAddDialog */}
        <div className="relative flex items-center">
          <MapPin className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 pr-8"
            placeholder="Ville ou code postal…"
            list="commune-suggestions"
            value={cityInput}
            onChange={(e) => handleCityInput(e.target.value)}
          />
          {cityLoading && (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          <datalist id="commune-suggestions">
            {suggestions.map((c) => (
              <option key={c.nom + (c.codesPostaux[0] ?? '')} value={communeLabel(c)} />
            ))}
          </datalist>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={fuelKey} onValueChange={(v) => setFuelKey(v as keyof StationPrices)}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Essence</SelectLabel>
                {STATION_FUEL_OPTIONS.filter((o) => ['e10', 'sp95', 'sp98'].includes(o.key)).map((o) => (
                  <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Autres</SelectLabel>
                {STATION_FUEL_OPTIONS.filter((o) => !['e10', 'sp95', 'sp98'].includes(o.key)).map((o) => (
                  <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select value={String(radiusKm)} onValueChange={(v) => setRadiusKm(Number(v))}>
            <SelectTrigger className="h-9 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2, 5, 10, 20, 50].map((r) => (
                <SelectItem key={r} value={String(r)}>{r} km</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  Tri&nbsp;: {SORT_LABELS[mode].toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {origin != null && (
            <Badge variant="outline" className="h-9 gap-1 px-2 text-xs">
              {origin.mode === 'gps' ? (
                <Navigation className="h-3 w-3" />
              ) : (
                <MapPin className="h-3 w-3" />
              )}
              {origin.mode === 'gps' ? 'GPS actif' : origin.label}
            </Badge>
          )}
        </div>

        {/* GPS status */}
        {geo.status === 'loading' && origin == null && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Obtention de votre position…
          </div>
        )}
        {geo.status === 'error' && origin?.mode !== 'city' && (
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">
              GPS indisponible — recherchez une ville ci-dessus.
            </p>
            <Button variant="outline" size="sm" onClick={geo.capture}>
              <Navigation className="mr-1 h-3.5 w-3.5" />
              Réessayer
            </Button>
          </div>
        )}

        {/* Liste / Carte */}
        {!loading && sorted.length > 0 && (
          <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
            {([
              ['list', 'Liste', List],
              ['map', 'Carte', MapIcon],
            ] as const).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`flex items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-sm font-medium transition-colors ${
                  view === mode
                    ? 'bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Loading stations */}
        {loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement des prix…
          </div>
        )}

        {/* Error from API */}
        {!loading && error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Map view */}
        {!loading && view === 'map' && sorted.length > 0 && origin != null && (
          <div className="flex-1 overflow-y-auto">
            <StationsMapView
              origin={{ lat: origin.lat, lon: origin.lon, label: origin.mode === 'gps' ? 'Votre position' : origin.label }}
              stations={mappedStations}
            />
          </div>
        )}

        {/* Station list */}
        {!loading && view === 'list' && sorted.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            <p className="mb-2 text-xs text-muted-foreground">
              {sorted.length} stations dans un rayon de {radiusKm} km — {fuelLabel}
              {routesLoading && ' — calcul des temps de trajet…'}
              {routesUnavailable && ' — temps de trajet indisponibles'}
            </p>
            <div className="space-y-1">
              {sorted.map((s) => {
                const stationPrice = s.prices[fuelKey]
                const isCheapest = minPrice != null && stationPrice === minPrice
                const knownName = stationHistory.find(
                  (e) => haversineM(e.latitude, e.longitude, s.latitude, s.longitude) < 200,
                )?.station_name ?? null
                const displayName = knownName ?? s.name
                const route = routes.get(s.id)
                return (
                  <div
                    key={s.id}
                    className={`flex items-start justify-between rounded-md border px-3 py-2 ${isFavorite(s.id) ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => toggleFav({ id: s.id, name: displayName, lat: s.latitude, lon: s.longitude })}
                          className="shrink-0 text-muted-foreground hover:text-yellow-500 transition-colors"
                          title={isFavorite(s.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                        >
                          <Star className={`h-3.5 w-3.5 ${isFavorite(s.id) ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                        </button>
                        <p className="truncate text-sm font-medium">
                          {knownName ? (
                            <span className="flex items-center gap-1">
                              <BookMarked className="h-3 w-3 shrink-0 text-primary" />
                              {knownName}
                            </span>
                          ) : displayName}
                        </p>
                        {isCheapest && (
                          <Badge className="shrink-0 border-0 bg-green-100 px-1.5 text-xs text-green-700">
                            moins cher
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.address}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                        {STATION_FUEL_OPTIONS.filter((o) => o.key !== fuelKey).map((o) => {
                          const p = s.prices[o.key]
                          if (p == null) return null
                          return (
                            <span key={o.key} className="text-xs text-muted-foreground">
                              {o.label.split(' ')[0]}: {p.toFixed(3)} €
                            </span>
                          )
                        })}
                      </div>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      {stationPrice != null ? (
                        <p className={`text-base font-bold ${isCheapest ? 'text-green-600' : 'text-foreground'}`}>
                          {stationPrice.toFixed(3)} €/L
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">N/D</p>
                      )}
                      {route?.distance_m != null && route.duration_s != null ? (
                        <p className="text-xs text-muted-foreground">
                          {formatRoadDistance(route.distance_m)} · {formatDrivingTime(route.duration_s)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {formatDist(s.distanceM)}
                          <span className="block text-[10px]">à vol d'oiseau</span>
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!loading && !error && sorted.length === 0 && origin != null && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucune station trouvée dans un rayon de {radiusKm} km.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
