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
import { FlexfuelRentabilityChart } from '@/components/charts/FlexfuelRentabilityChart'
import { MonthlyCostChart } from '@/components/charts/MonthlyCostChart'
import { DistanceChart } from '@/components/charts/DistanceChart'
import { InsuranceKmChart } from '@/components/charts/InsuranceKmChart'

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
    return filtered.sort((a, b) => a.fueling_date.localeCompare(b.fueling_date))
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
          <ConsumptionChart dataPoints={filteredConsumptionData} />
          <PriceChart entries={filteredEntries} />
          <MonthlyCostChart entries={filteredEntries} maintenances={filteredMaintenances} />
          <DistanceChart entries={filteredEntries} />
          {vehicle && allEntries && (
            <InsuranceKmChart vehicle={vehicle} entries={allEntries} />
          )}
          <StationsMap entries={filteredEntries} />

          {/* FlexFuel E85 Rentability */}
          {rentability && (
            <>
              <Separator />
              <FlexfuelRentabilityChart data={rentability} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
