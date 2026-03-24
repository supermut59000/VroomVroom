import { useEffect } from 'react'
import { MapPin, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useNearbyStations } from '@/hooks/use-nearby-stations'
import type { FuelType } from '@/types'
import { useState } from 'react'

interface NearbyStationsListProps {
  latitude: number
  longitude: number
  fuelType: FuelType
  onSelect: (stationName: string, location: string, pricePerLiter: number | null) => void
}

export function NearbyStationsList({
  latitude,
  longitude,
  fuelType,
  onSelect,
}: NearbyStationsListProps) {
  const [open, setOpen] = useState(true)
  const { stations, loading, error, fetch, clear } = useNearbyStations()

  useEffect(() => {
    fetch(latitude, longitude, fuelType)
    return () => clear()
  }, [latitude, longitude, fuelType, fetch, clear])

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
              {stations.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => {
                    onSelect(s.name, [s.name, s.address].filter(Boolean).join(', '), s.price)
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.name}</p>
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
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
