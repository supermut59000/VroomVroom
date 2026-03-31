import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { useVehicle, useVehicleStats } from '@/hooks/use-vehicles'
import { useFuelStats } from '@/hooks/use-fuel-entries'
import { useMaintenanceStats } from '@/hooks/use-maintenances'

interface CostOfOwnershipSectionProps {
  vehicleId: number
}

// Use CSS custom properties so colors adapt to light/dark theme automatically.
// The values reference Tailwind/shadcn CSS vars defined in index.css.
const COLORS = {
  purchase: 'var(--color-chart-purchase, hsl(220 8.9% 46.1%))',
  fuel: 'var(--color-chart-fuel, hsl(217 91% 60%))',
  maintenance: 'var(--color-chart-maintenance, hsl(25 95% 53%))',
}

export function CostOfOwnershipSection({ vehicleId }: CostOfOwnershipSectionProps) {
  const { data: vehicle } = useVehicle(vehicleId)
  const { data: stats } = useVehicleStats(vehicleId)
  const { data: fuelStats } = useFuelStats(vehicleId)
  const { data: maintenanceStats } = useMaintenanceStats(vehicleId)

  const metrics = useMemo(() => {
    if (!vehicle || !stats) return null

    const purchasePrice = vehicle.purchase_price ?? 0
    const fuelCost = fuelStats?.total_cost ?? 0
    const maintenanceCost = maintenanceStats?.total_cost ?? 0
    const totalCost = purchasePrice + fuelCost + maintenanceCost

    if (totalCost === 0) return null

    // Months owned
    const acquisitionDate = vehicle.acquisition_date
      ? new Date(vehicle.acquisition_date)
      : new Date(vehicle.created_at)
    const now = new Date()
    const monthsOwned = Math.max(
      1,
      (now.getFullYear() - acquisitionDate.getFullYear()) * 12 +
        (now.getMonth() - acquisitionDate.getMonth()),
    )

    const totalDistance = stats.total_distance || 0
    const costPerMonth = (fuelCost + maintenanceCost) / monthsOwned
    const allInCostPerKm = totalDistance > 0 ? totalCost / totalDistance : null
    const projectedYearly = costPerMonth * 12

    const fuelPct = totalCost > 0 ? (fuelCost / totalCost) * 100 : 0
    const maintenancePct = totalCost > 0 ? (maintenanceCost / totalCost) * 100 : 0
    const purchasePct = totalCost > 0 ? (purchasePrice / totalCost) * 100 : 0

    return {
      totalCost,
      purchasePrice,
      fuelCost,
      maintenanceCost,
      monthsOwned,
      costPerMonth,
      allInCostPerKm,
      projectedYearly,
      fuelPct,
      maintenancePct,
      purchasePct,
      totalDistance,
    }
  }, [vehicle, stats, fuelStats, maintenanceStats])

  if (!metrics) return null

  const chartData = [
    { name: 'Achat', value: metrics.purchasePrice, color: COLORS.purchase },
    { name: 'Carburant', value: metrics.fuelCost, color: COLORS.fuel },
    { name: 'Maintenance', value: metrics.maintenanceCost, color: COLORS.maintenance },
  ].filter((d) => d.value > 0)

  return (
    <section>
      <h4 className="mb-3 text-sm font-semibold text-muted-foreground">Coût de possession</h4>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-muted/50 p-3 text-center">
          <p className="text-xs text-muted-foreground">Coût total</p>
          <p className="text-lg font-bold">
            {metrics.totalCost.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} &euro;
          </p>
        </div>
        <div className="rounded-md bg-muted/50 p-3 text-center">
          <p className="text-xs text-muted-foreground">Coût / mois</p>
          <p className="text-lg font-bold">{metrics.costPerMonth.toFixed(0)} &euro;</p>
        </div>
        <div className="rounded-md bg-muted/50 p-3 text-center">
          <p className="text-xs text-muted-foreground">Coût / km (tout inclus)</p>
          <p className="text-lg font-bold">
            {metrics.allInCostPerKm != null ? `${metrics.allInCostPerKm.toFixed(2)} €` : '—'}
          </p>
        </div>
        <div className="rounded-md bg-muted/50 p-3 text-center">
          <p className="text-xs text-muted-foreground">Projection annuelle</p>
          <p className="text-lg font-bold">
            {metrics.projectedYearly.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} &euro;
          </p>
        </div>
      </div>

      {/* Donut chart */}
      {chartData.length > 1 && (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) =>
                  `${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
                }
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Breakdown */}
      <div className="mt-3 space-y-1 text-sm">
        {metrics.purchasePrice > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Achat</span>
            <span>
              {metrics.purchasePrice.toLocaleString('fr-FR')} &euro; ({metrics.purchasePct.toFixed(0)}
              %)
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Carburant</span>
          <span>
            {metrics.fuelCost.toFixed(0)} &euro; ({metrics.fuelPct.toFixed(0)}%)
          </span>
        </div>
        {metrics.maintenanceCost > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Maintenance</span>
            <span>
              {metrics.maintenanceCost.toFixed(0)} &euro; ({metrics.maintenancePct.toFixed(0)}%)
            </span>
          </div>
        )}
      </div>

      {/* Context */}
      <p className="mt-2 text-xs text-muted-foreground">
        Basé sur {metrics.monthsOwned} mois de possession
        {metrics.totalDistance > 0 &&
          ` et ${metrics.totalDistance.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} km parcourus`}
      </p>
    </section>
  )
}
