import { useState, useMemo } from 'react'
import { Filter, RotateCcw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useAllFuelEntries, useConsumptionHistory } from '@/hooks/use-fuel-entries'
import { useMaintenances } from '@/hooks/use-maintenances'
import { useVehicle } from '@/hooks/use-vehicles'
import { useFlexfuelConversion, useFlexfuelRentability } from '@/hooks/use-flexfuel'
import { ConsumptionChart } from '@/components/charts/ConsumptionChart'
import { PriceChart } from '@/components/charts/PriceChart'
import { StationsMap } from '@/components/charts/StationsMap'
import { EthanolHistoryChart } from '@/components/charts/EthanolHistoryChart'
import { MonthlyCostChart } from '@/components/charts/MonthlyCostChart'
import { DistanceChart } from '@/components/charts/DistanceChart'
import { RangeChart } from '@/components/charts/RangeChart'
import { OdometerChart } from '@/components/charts/OdometerChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ErrorBoundary } from '@/components/ErrorBoundary'

interface FuelChartsProps {
  vehicleId: number
  open: boolean
  onClose: () => void
}

export function FuelCharts({ vehicleId, open, onClose }: FuelChartsProps) {
  const { data: vehicle } = useVehicle(vehicleId)
  const { data: allEntries } = useAllFuelEntries(vehicleId)
  const { data: consumptionHistory } = useConsumptionHistory(vehicleId)
  const { data: maintenances } = useMaintenances(vehicleId)
  const { data: flexfuelConversion } = useFlexfuelConversion(vehicleId)
  const { data: rentability } = useFlexfuelRentability(
    flexfuelConversion ? vehicleId : null,
  )

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const filteredEntries = useMemo(() => {
    if (!allEntries) return []
    let filtered = [...allEntries]
    if (startDate) {
      filtered = filtered.filter((e) => e.fueling_date >= startDate)
    }
    if (endDate) {
      filtered = filtered.filter((e) => e.fueling_date <= endDate)
    }
    return filtered.sort((a, b) => {
      const dateDiff = a.fueling_date.localeCompare(b.fueling_date)
      if (dateDiff !== 0) return dateDiff
      const odoDiff = a.odometer_reading - b.odometer_reading
      if (odoDiff !== 0) return odoDiff
      return a.id - b.id
    })
  }, [allEntries, startDate, endDate])

  const filteredConsumptionData = useMemo(() => {
    if (!consumptionHistory) return []
    let data = [...consumptionHistory.data_points]
    if (startDate) {
      data = data.filter((d) => d.date >= startDate)
    }
    if (endDate) {
      data = data.filter((d) => d.date <= endDate)
    }
    return data
  }, [consumptionHistory, startDate, endDate])

  const filteredMaintenances = useMemo(() => {
    if (!maintenances) return []
    let filtered = [...maintenances]
    if (startDate) {
      filtered = filtered.filter((m) => m.maintenance_date >= startDate)
    }
    if (endDate) {
      filtered = filtered.filter((m) => m.maintenance_date <= endDate)
    }
    return filtered
  }, [maintenances, startDate, endDate])

  const resetFilters = () => {
    setStartDate('')
    setEndDate('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl px-3 sm:px-6">
        <DialogHeader>
          <DialogTitle>
            Graphiques
            {vehicle && ` — ${vehicle.brand} ${vehicle.model}`}
          </DialogTitle>
        </DialogHeader>

        {/* Date filters */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Début</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fin</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetFilters}>
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
            {(startDate || endDate) && (
              <span className="text-xs text-muted-foreground">
                <Filter className="mr-1 inline h-3 w-3" />
                {filteredEntries.length} entrées filtrées
              </span>
            )}
          </div>
        </div>

        <Separator />

        <div className="space-y-6">
          <ErrorBoundary>
            <ConsumptionChart
              dataPoints={filteredConsumptionData}
              splitByFuelType={!!flexfuelConversion}
            />
          </ErrorBoundary>
          <ErrorBoundary>
            <PriceChart entries={filteredEntries} splitByFuelType={!!flexfuelConversion} />
          </ErrorBoundary>
          <ErrorBoundary><MonthlyCostChart entries={filteredEntries} maintenances={filteredMaintenances} /></ErrorBoundary>
          <ErrorBoundary><DistanceChart entries={filteredEntries} /></ErrorBoundary>
          {vehicle && (
            <ErrorBoundary>
              <RangeChart dataPoints={filteredConsumptionData} tankCapacity={vehicle.tank_capacity} />
            </ErrorBoundary>
          )}
          {vehicle && allEntries && !vehicle.insurance_unlimited && vehicle.insurance_km_limit != null && (
            <ErrorBoundary><OdometerChart vehicle={vehicle} entries={allEntries} /></ErrorBoundary>
          )}
          <ErrorBoundary><StationsMap entries={filteredEntries} /></ErrorBoundary>

          {/* FlexFuel E85 */}
          {flexfuelConversion && vehicle && allEntries && (
            <>
              <Separator />
              <ErrorBoundary>
                <EthanolHistoryChart
                  conversion={flexfuelConversion}
                  vehicle={vehicle}
                  entries={allEntries}
                />
              </ErrorBoundary>
            </>
          )}
          {rentability && (
            <>
              <Separator />
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">🌿 Rentabilité E85</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-md bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Économie totale</p>
                      <p className="text-lg font-bold text-emerald-600">
                        {Math.round(rentability.total_savings).toLocaleString('fr-FR')} €
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Coût du kit</p>
                      <p className="text-lg font-bold">
                        {Math.round(rentability.kit_cost).toLocaleString('fr-FR')} €
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground">
                        {rentability.break_even_reached ? 'Rentabilisé le' : 'Reste à amortir'}
                      </p>
                      <p className="text-lg font-bold">
                        {rentability.break_even_reached && rentability.break_even_date
                          ? new Date(rentability.break_even_date).toLocaleDateString('fr-FR')
                          : `${Math.max(0, Math.round(rentability.kit_cost - rentability.total_savings)).toLocaleString('fr-FR')} €`}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Moy. /mois</p>
                      <p className="text-lg font-bold">
                        {rentability.monthly_average_savings
                          ? `${Math.round(rentability.monthly_average_savings).toLocaleString('fr-FR')} €`
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">{rentability.total_e85_fills} pleins E85</Badge>
                    <Badge variant="outline">Surconsommation {rentability.overconsumption_pct}%</Badge>
                    {rentability.break_even_reached ? (
                      <Badge className="border-0 bg-emerald-100 text-emerald-700">Rentabilisé</Badge>
                    ) : (
                      <Badge className="border-0 bg-orange-100 text-orange-700">
                        En cours d'amortissement
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
