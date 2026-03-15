import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Map,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  MarkerTooltip,
  MapControls,
} from '@/components/ui/map'
import type { FuelEntry } from '@/types'

interface StationsMapProps {
  entries: FuelEntry[]
}

/** Haversine distance in meters between two GPS points */
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface StationCluster {
  latitude: number
  longitude: number
  latestEntry: FuelEntry
  entryCount: number
}

export function StationsMap({ entries }: StationsMapProps) {
  const clusters = useMemo(() => {
    const withCoords = entries.filter((e) => e.latitude != null && e.longitude != null)
    const result: StationCluster[] = []

    for (const entry of withCoords) {
      const lat = entry.latitude!
      const lon = entry.longitude!

      // Find an existing cluster within 50m
      const nearby = result.find(
        (c) => distanceMeters(c.latitude, c.longitude, lat, lon) <= 50
      )

      if (nearby) {
        // Update average position
        const total = nearby.entryCount + 1
        nearby.latitude = (nearby.latitude * nearby.entryCount + lat) / total
        nearby.longitude = (nearby.longitude * nearby.entryCount + lon) / total
        nearby.entryCount = total
        // Keep the most recent entry
        if (new Date(entry.fueling_date) > new Date(nearby.latestEntry.fueling_date)) {
          nearby.latestEntry = entry
        }
      } else {
        result.push({
          latitude: lat,
          longitude: lon,
          latestEntry: entry,
          entryCount: 1,
        })
      }
    }

    return result
  }, [entries])

  // Center on France by default
  const FRANCE_CENTER: [number, number] = [2.5, 46.5]
  const FRANCE_ZOOM = 4

  if (clusters.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Carte des stations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Aucune entrée avec coordonnées GPS.
            Utilisez le bouton GPS lors de l'ajout d'un plein pour capturer votre position.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Carte des stations ({clusters.length} station
          {clusters.length > 1 ? 's' : ''})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-hidden rounded-b-xl">
        <div className="h-[320px] md:h-[400px]">
          <Map
            center={FRANCE_CENTER}
            zoom={FRANCE_ZOOM}
          >
            <MapControls />
            {clusters.map((cluster: StationCluster) => {
              const entry = cluster.latestEntry
              return (
                <MapMarker
                  key={entry.id}
                  longitude={cluster.longitude}
                  latitude={cluster.latitude}
                >
                  <MarkerContent>
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-primary shadow-lg">
                      <span className="text-xs text-primary-foreground">&#9981;</span>
                    </div>
                  </MarkerContent>
                  <MarkerTooltip>
                    {entry.station_name || 'Station'}
                  </MarkerTooltip>
                  <MarkerPopup>
                    <div className="space-y-1 min-w-[180px]">
                      <p className="font-semibold text-foreground">
                        {entry.station_name || 'Station'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.fueling_date).toLocaleDateString('fr-FR')} (dernier plein)
                      </p>
                      <p className="text-xs">
                        {entry.liters} L &mdash; {entry.price_per_liter} &euro;/L
                      </p>
                      <p className="text-sm font-medium">
                        {(entry.liters * entry.price_per_liter).toFixed(2)} &euro;
                      </p>
                      {cluster.entryCount > 1 && (
                        <p className="text-xs text-muted-foreground">
                          {cluster.entryCount} passages
                        </p>
                      )}
                    </div>
                  </MarkerPopup>
                </MapMarker>
              )
            })}
          </Map>
        </div>
      </CardContent>
    </Card>
  )
}
