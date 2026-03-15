import { useState, useMemo } from 'react'
import { Wrench, Pencil, Trash2, Plus, Download } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { useMaintenances, useDeleteMaintenance } from '@/hooks/use-maintenances'
import { getMaintenanceLabel } from '@/lib/constants'
import { exportMaintenancesCSV } from '@/lib/csv'
import { MaintenanceAddDialog } from './MaintenanceAddDialog'
import { MaintenanceEditDialog } from './MaintenanceEditDialog'
import type { Maintenance } from '@/types'

type SortKey = 'date-desc' | 'date-asc' | 'cost-desc' | 'cost-asc'

interface MaintenanceViewDialogProps {
  vehicleId: number | null
  onClose: () => void
}

export function MaintenanceViewDialog({ vehicleId, onClose }: MaintenanceViewDialogProps) {
  const { data: vehicle } = useVehicle(vehicleId)
  const { data: entries } = useMaintenances(vehicleId)
  const deleteMaintenance = useDeleteMaintenance(vehicleId ?? 0)

  const [sortKey, setSortKey] = useState<SortKey>('date-desc')
  const [editEntry, setEditEntry] = useState<Maintenance | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  const sortedEntries = useMemo(() => {
    if (!entries) return []
    const sorted = [...entries]
    switch (sortKey) {
      case 'date-desc':
        sorted.sort((a, b) => b.maintenance_date.localeCompare(a.maintenance_date))
        break
      case 'date-asc':
        sorted.sort((a, b) => a.maintenance_date.localeCompare(b.maintenance_date))
        break
      case 'cost-desc':
        sorted.sort((a, b) => b.cost - a.cost)
        break
      case 'cost-asc':
        sorted.sort((a, b) => a.cost - b.cost)
        break
    }
    return sorted
  }, [entries, sortKey])

  // Stats
  const stats = useMemo(() => {
    if (!entries || entries.length === 0) return null
    const totalCost = entries.reduce((s, e) => s + e.cost, 0)
    const avgCost = totalCost / entries.length
    const lastDate = entries
      .map((e) => e.maintenance_date)
      .sort()
      .pop()
    return {
      count: entries.length,
      totalCost,
      avgCost,
      lastDate,
    }
  }, [entries])

  // Cost breakdown by year
  const costBreakdown = useMemo(() => {
    if (!entries) return []
    const byYear = new Map<string, Map<string, number>>()
    for (const e of entries) {
      const year = e.maintenance_date.slice(0, 4)
      const month = e.maintenance_date.slice(0, 7)
      if (!byYear.has(year)) byYear.set(year, new Map())
      const yearMap = byYear.get(year)!
      yearMap.set(month, (yearMap.get(month) || 0) + e.cost)
    }
    return Array.from(byYear.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, months]) => ({
        year,
        total: Array.from(months.values()).reduce((s, c) => s + c, 0),
        months: Array.from(months.entries())
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([month, cost]) => ({ month, cost })),
      }))
  }, [entries])

  const handleDelete = async (id: number) => {
    try {
      await deleteMaintenance.mutateAsync(id)
      toast.success('Maintenance supprimée')
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
              <Wrench className="h-5 w-5" />
              Historique maintenance
            </DialogTitle>
            {vehicle && (
              <p className="text-sm text-muted-foreground">
                {vehicle.brand} {vehicle.model} — {vehicle.license_plate}
              </p>
            )}
          </DialogHeader>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Entrées</p>
                  <p className="text-lg font-bold">{stats.count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Coût total</p>
                  <p className="text-lg font-bold">{stats.totalCost.toFixed(0)} &euro;</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Coût moyen</p>
                  <p className="text-lg font-bold">{stats.avgCost.toFixed(0)} &euro;</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Dernière</p>
                  <p className="text-lg font-bold">
                    {stats.lastDate ? new Date(stats.lastDate).toLocaleDateString('fr-FR') : '—'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Cost breakdown */}
          {costBreakdown.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">Coûts par année</h4>
              {costBreakdown.map(({ year, total, months }) => (
                <div key={year} className="rounded-md bg-muted/50 p-3">
                  <div className="flex justify-between text-sm font-medium">
                    <span>{year}</span>
                    <span>{total.toFixed(2)} &euro;</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                    {months.map(({ month, cost }) => (
                      <span key={month}>
                        {new Date(month + '-01').toLocaleDateString('fr-FR', { month: 'short' })}:{' '}
                        {cost.toFixed(0)}&euro;
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Separator />

          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Date (récent)</SelectItem>
                <SelectItem value="date-asc">Date (ancien)</SelectItem>
                <SelectItem value="cost-desc">Coût (haut)</SelectItem>
                <SelectItem value="cost-asc">Coût (bas)</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => entries && vehicle && exportMaintenancesCSV(entries, vehicle)}
              disabled={!entries || entries.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </div>

          {/* Entries list */}
          <div className="space-y-2">
            {sortedEntries.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">
                Aucune maintenance enregistrée
              </p>
            )}
            {sortedEntries.map((entry) => (
              <SwipeableCard
                key={entry.id}
                onSwipeRight={() => setEditEntry(entry)}
                onSwipeLeft={() => setPendingDeleteId(entry.id)}
              >
                <Card>
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {new Date(entry.maintenance_date).toLocaleDateString('fr-FR')}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getMaintenanceLabel(entry.maintenance_type)}
                        </Badge>
                      </div>
                      {entry.description && (
                        <p className="text-xs text-muted-foreground">{entry.description}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                        <span>{entry.odometer_reading.toLocaleString('fr-FR')} km</span>
                        {entry.service_provider && <span>{entry.service_provider}</span>}
                      </div>
                      <p className="text-sm font-semibold">{entry.cost.toFixed(2)} &euro;</p>
                      {(entry.next_maintenance_date || entry.next_maintenance_odometer) && (
                        <p className="text-xs text-muted-foreground">
                          Prochaine:{' '}
                          {entry.next_maintenance_date &&
                            new Date(entry.next_maintenance_date).toLocaleDateString('fr-FR')}
                          {entry.next_maintenance_date && entry.next_maintenance_odometer && ' / '}
                          {entry.next_maintenance_odometer &&
                            `${entry.next_maintenance_odometer.toLocaleString('fr-FR')} km`}
                        </p>
                      )}
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

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Fermer
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation (triggered by swipe or button click) */}
      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette maintenance ?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const entry = entries?.find((e) => e.id === pendingDeleteId)
                return entry
                  ? `${getMaintenanceLabel(entry.maintenance_type)} du ${new Date(entry.maintenance_date).toLocaleDateString('fr-FR')} — ${entry.cost.toFixed(2)} €`
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
        <MaintenanceEditDialog
          entry={editEntry}
          vehicleId={vehicleId}
          onClose={() => setEditEntry(null)}
        />
      )}

      {/* Add dialog from within view */}
      {addOpen && vehicleId && (
        <MaintenanceAddDialog
          vehicleId={vehicleId}
          onClose={() => setAddOpen(false)}
        />
      )}
    </>
  )
}
