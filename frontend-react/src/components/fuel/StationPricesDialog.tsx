import { useState, useEffect } from 'react'
import { Fuel, MapPin, Loader2, ArrowUpDown, Navigation } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useNearbyStations, STATION_FUEL_OPTIONS } from '@/hooks/use-nearby-stations'
import { useGeolocation } from '@/hooks/use-geolocation'
import type { StationPrices } from '@/hooks/use-nearby-stations'

interface StationPricesDialogProps {
  open: boolean
  onClose: () => void
}

type SortMode = 'price' | 'distance'

export function StationPricesDialog({ open, onClose }: StationPricesDialogProps) {
  const [fuelKey, setFuelKey] = useState<keyof StationPrices>('e10')
  const [sortMode, setSortMode] = useState<SortMode>('price')
  const geo = useGeolocation()
  const { stations, loading, error, fetch, clear } = useNearbyStations()

  // Auto-request GPS when dialog opens
  useEffect(() => {
    if (open) {
      geo.capture()
    } else {
      geo.reset()
      clear()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Fetch stations when GPS is ready
  useEffect(() => {
    if (geo.status === 'success' && geo.latitude != null && geo.longitude != null) {
      fetch(geo.latitude, geo.longitude, fuelKey)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status, geo.latitude, geo.longitude, fuelKey])

  const sorted = [...stations].sort((a, b) => {
    if (sortMode === 'price') {
      const pa = a.prices[fuelKey] ?? Infinity
      const pb = b.prices[fuelKey] ?? Infinity
      return pa - pb
    }
    return a.distanceM - b.distanceM
  })

  const formatDist = (m: number) =>
    m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`

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

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={fuelKey} onValueChange={(v) => setFuelKey(v as keyof StationPrices)}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATION_FUEL_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortMode(sortMode === 'price' ? 'distance' : 'price')}
            className="h-9"
          >
            <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
            {sortMode === 'price' ? 'Tri: prix' : 'Tri: distance'}
          </Button>

          {geo.status === 'success' && geo.latitude != null && (
            <Badge variant="outline" className="h-9 gap-1 px-2 text-xs">
              <Navigation className="h-3 w-3" />
              GPS actif
            </Badge>
          )}
        </div>

        {/* GPS status */}
        {geo.status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Obtention de votre position…
          </div>
        )}
        {geo.status === 'error' && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{geo.error}</p>
            <Button variant="outline" size="sm" onClick={geo.capture}>
              <MapPin className="mr-1 h-3.5 w-3.5" />
              Réessayer
            </Button>
          </div>
        )}

        {/* Loading */}
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

        {/* Station list */}
        {!loading && sorted.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            <p className="mb-2 text-xs text-muted-foreground">
              {sorted.length} stations dans un rayon de 5 km — {fuelLabel}
            </p>
            <div className="space-y-1">
              {sorted.map((s, idx) => {
                const stationPrice = s.prices[fuelKey]
                const isCheapest = idx === 0 && stationPrice != null && sortMode === 'price'
                return (
                  <div
                    key={s.id}
                    className="flex items-start justify-between rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        {isCheapest && (
                          <Badge className="shrink-0 border-0 bg-green-100 px-1.5 text-xs text-green-700">
                            moins cher
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.address && `${s.address}, `}{s.cp} {s.city}
                      </p>
                      {/* Other prices inline */}
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
                      <p className="text-xs text-muted-foreground">{formatDist(s.distanceM)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!loading && !error && sorted.length === 0 && geo.status === 'success' && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucune station trouvée dans un rayon de 5 km.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
