import { useState, useMemo } from 'react'
import { BarChart3, Pencil, Trash2, Fuel, Download } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { SwipeableCard } from '@/components/ui/swipeable-card'
import { useVehicle } from '@/hooks/use-vehicles'
import { useAllFuelEntries, useFuelStats, useDeleteFuelEntry } from '@/hooks/use-fuel-entries'
import { FUEL_TYPE_LABELS, FUEL_TYPE_COLORS } from '@/lib/constants'
import { exportFuelEntriesCSV } from '@/lib/csv'
import { FuelEditDialog } from './FuelEditDialog'
import { FuelCharts } from './FuelCharts'
import type { FuelEntry } from '@/types'

type SortKey = 'date-desc' | 'date-asc' | 'odometer-desc' | 'odometer-asc'

interface FuelViewDialogProps {
  vehicleId: number | null
  onClose: () => void
}

export function FuelViewDialog({ vehicleId, onClose }: FuelViewDialogProps) {
  const { data: vehicle } = useVehicle(vehicleId)
  const { data: entries } = useAllFuelEntries(vehicleId)
  const { data: fuelStats } = useFuelStats(vehicleId)
  const deleteFuelEntry = useDeleteFuelEntry(vehicleId ?? 0)

  const [sortKey, setSortKey] = useState<SortKey>('date-desc')
  const [perPage, setPerPage] = useState(20)
  const [page, setPage] = useState(1)
  const [editEntry, setEditEntry] = useState<FuelEntry | null>(null)
  const [chartsOpen, setChartsOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const sortedEntries = useMemo(() => {
    if (!entries) return []
    const sorted = [...entries]
    switch (sortKey) {
      case 'date-desc':
        sorted.sort((a, b) => b.fueling_date.localeCompare(a.fueling_date))
        break
      case 'date-asc':
        sorted.sort((a, b) => a.fueling_date.localeCompare(b.fueling_date))
        break
      case 'odometer-desc':
        sorted.sort((a, b) => b.odometer_reading - a.odometer_reading)
        break
      case 'odometer-asc':
        sorted.sort((a, b) => a.odometer_reading - b.odometer_reading)
        break
    }
    return sorted
  }, [entries, sortKey])

  const totalPages = Math.ceil(sortedEntries.length / perPage)
  const paginatedEntries = perPage === -1
    ? sortedEntries
    : sortedEntries.slice((page - 1) * perPage, page * perPage)

  const handleDelete = async (id: number) => {
    try {
      await deleteFuelEntry.mutateAsync(id)
      toast.success('Plein supprimé')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  const open = vehicleId !== null

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl px-3 sm:px-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fuel className="h-5 w-5" />
              Historique carburant
            </DialogTitle>
            {vehicle && (
              <p className="text-sm text-muted-foreground">
                {vehicle.brand} {vehicle.model} — {vehicle.license_plate}
              </p>
            )}
          </DialogHeader>

          {/* Stats cards */}
          {fuelStats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Pleins</p>
                  <p className="text-lg font-bold">{fuelStats.total_entries}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total litres</p>
                  <p className="text-lg font-bold">{fuelStats.total_liters.toFixed(1)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Coût total</p>
                  <p className="text-lg font-bold">{fuelStats.total_cost.toFixed(0)} &euro;</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Prix moyen</p>
                  <p className="text-lg font-bold">{fuelStats.average_price_per_liter.toFixed(3)} &euro;</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Toolbar */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <Select value={sortKey} onValueChange={(v) => { setSortKey(v as SortKey); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Date (récent)</SelectItem>
                <SelectItem value="date-asc">Date (ancien)</SelectItem>
                <SelectItem value="odometer-desc">Compteur (haut)</SelectItem>
                <SelectItem value="odometer-asc">Compteur (bas)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
                <SelectItem value="100">100 / page</SelectItem>
                <SelectItem value="-1">Tout</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={() => setChartsOpen(true)}>
              <BarChart3 className="mr-2 h-4 w-4" />
              Graphiques
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => entries && vehicle && exportFuelEntriesCSV(entries, vehicle)}
              disabled={!entries || entries.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </div>

          <Separator />

          {/* Entries list */}
          <div className="space-y-2">
            {paginatedEntries.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">Aucun plein enregistré</p>
            )}
            {paginatedEntries.map((entry) => (
              <SwipeableCard
                key={entry.id}
                onSwipeRight={() => setEditEntry(entry)}
                onSwipeLeft={() => setPendingDeleteId(entry.id)}
              >
                <Card className={!entry.is_full_tank ? 'border-l-4 border-l-yellow-400' : ''}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {new Date(entry.fueling_date).toLocaleDateString('fr-FR')}
                        </span>
                        {!entry.is_full_tank && (
                          <Badge variant="outline" className="text-xs">Partiel</Badge>
                        )}
                        <Badge className={`${FUEL_TYPE_COLORS[entry.fuel_type].bg} ${FUEL_TYPE_COLORS[entry.fuel_type].text} border-0 text-xs`}>
                          {FUEL_TYPE_LABELS[entry.fuel_type]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                        <span>{entry.liters.toFixed(2)} L</span>
                        <span>{entry.price_per_liter.toFixed(3)} &euro;/L</span>
                        <span>{entry.odometer_reading.toLocaleString('fr-FR')} km</span>
                        {entry.station_name && <span>{entry.station_name}</span>}
                      </div>
                      <p className="text-sm font-semibold">
                        {(entry.liters * entry.price_per_liter).toFixed(2)} &euro;
                      </p>
                    </div>
                    {/* Desktop-only action buttons */}
                    <div className="hidden gap-1 sm:flex">
                      <Button variant="ghost" size="icon" onClick={() => setEditEntry(entry)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPendingDeleteId(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </SwipeableCard>
            ))}
          </div>

          {/* Pagination */}
          {perPage !== -1 && totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Précédent
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} / {totalPages} ({sortedEntries.length} entrées)
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation (triggered by swipe or button click) */}
      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce plein ?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const entry = entries?.find((e) => e.id === pendingDeleteId)
                return entry
                  ? `Plein du ${new Date(entry.fueling_date).toLocaleDateString('fr-FR')} — ${entry.liters} L`
                  : ''
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteId) handleDelete(pendingDeleteId)
                setPendingDeleteId(null)
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog */}
      {vehicleId && (
        <FuelEditDialog
          entry={editEntry}
          vehicleId={vehicleId}
          onClose={() => setEditEntry(null)}
        />
      )}

      {/* Charts dialog */}
      {vehicleId && chartsOpen && (
        <FuelCharts
          vehicleId={vehicleId}
          open={chartsOpen}
          onClose={() => setChartsOpen(false)}
        />
      )}
    </>
  )
}
