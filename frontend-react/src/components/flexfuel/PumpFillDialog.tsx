import { useState, useEffect, useMemo } from 'react'
import { Droplets, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useVehicle } from '@/hooks/use-vehicles'
import { useAllFuelEntries, useCreateFuelEntry } from '@/hooks/use-fuel-entries'
import { useFlexfuelConversion, useE10ReferencePrices } from '@/hooks/use-flexfuel'
import { useGeolocation } from '@/hooks/use-geolocation'
import { NearbyStationsList } from '@/components/fuel/NearbyStationsList'
import {
  computeAvgConsumption,
  computeTankState,
  computeWinterRec,
  e85EthanolFraction,
} from '@/lib/blend-math'
import type { DilutantType } from '@/lib/blend-math'
import { buildBlendPayloads } from '@/lib/pump-fill'
import { t } from '@/lib/i18n'

interface PumpFillDialogProps {
  vehicleId: number | null
  onClose: () => void
}

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * « À la pompe » — the one-hand flow at the pump: tank state (no input,
 * computed from real fills), what to pour (existing winter recommendation),
 * record in one tap (Partiel diluant + Plein E85 at the same stop).
 * Replaces nothing — BlendCalculatorDialog stays as the reference view.
 */
export function PumpFillDialog({ vehicleId, onClose }: PumpFillDialogProps) {
  const { data: vehicle } = useVehicle(vehicleId)
  const { data: entries } = useAllFuelEntries(vehicleId)
  const { data: conversion } = useFlexfuelConversion(vehicleId)
  const { data: e10Prices = [] } = useE10ReferencePrices(vehicleId != null)
  const createFuelEntry = useCreateFuelEntry()
  const geo = useGeolocation()

  const [odoInput, setOdoInput] = useState('')
  const [dilutantType, setDilutantType] = useState<DilutantType>('e10')
  const [gpsLat, setGpsLat] = useState<number | null>(null)
  const [gpsLon, setGpsLon] = useState<number | null>(null)
  const [stationName, setStationName] = useState('')
  const [stationLocation, setStationLocation] = useState('')
  const [e85PriceInput, setE85PriceInput] = useState('')
  const [dilPriceInput, setDilPriceInput] = useState('')
  const [e85LitersInput, setE85LitersInput] = useState('')
  const [dilLitersInput, setDilLitersInput] = useState('')
  const [defaultsApplied, setDefaultsApplied] = useState(false)
  const [touched, setTouched] = useState({ e85: false, dil: false })

  const tankCapacity = vehicle?.tank_capacity ?? null
  const conversionDate = conversion?.conversion_date ?? null
  const target = conversion?.target_ethanol_pct ?? 77
  const tolerance = conversion?.ethanol_tolerance_pct ?? 5

  // Same derivation as BlendCalculator (fill-to-fill tank state, remaining
  // estimate at the current odometer).
  const avgConsumption = useMemo(
    () => (entries && conversionDate ? computeAvgConsumption(entries, conversionDate) : null),
    [entries, conversionDate],
  )
  const tankState = useMemo(
    () =>
      entries && conversionDate && tankCapacity != null
        ? computeTankState(entries, conversionDate, tankCapacity)
        : null,
    [entries, conversionDate, tankCapacity],
  )

  const inputOdo = odoInput !== '' ? Number(odoInput) : (tankState?.lastOdo ?? 0)
  const { remainingLiters, currentEthanolPct } = useMemo(() => {
    if (!tankState || !avgConsumption || tankCapacity == null) {
      return { remainingLiters: 0, currentEthanolPct: 0 }
    }
    const distance = Math.max(0, inputOdo - tankState.lastOdo)
    const consumed = (distance * avgConsumption) / 100
    const remaining = Math.min(Math.max(0, tankState.litersInTank - consumed), tankCapacity)
    const ethFraction =
      tankState.litersInTank > 0 ? tankState.ethanolLiters / tankState.litersInTank : 0
    return { remainingLiters: remaining, currentEthanolPct: ethFraction * 100 }
  }, [tankState, avgConsumption, inputOdo, tankCapacity])

  const e85EthFraction = e85EthanolFraction()
  const dilutantEthFraction = dilutantType === 'e10' ? 0.1 : 0.05
  const dilutantLabel = dilutantType === 'e10' ? 'E10' : 'SP98'

  const winterRec = useMemo(
    () =>
      entries && conversionDate && tankCapacity != null
        ? computeWinterRec(
            remainingLiters,
            (currentEthanolPct / 100) * remainingLiters,
            tankCapacity,
            target,
            tolerance,
            dilutantEthFraction,
            avgConsumption ?? 8,
            inputOdo,
            e85EthFraction,
          )
        : null,
    [entries, conversionDate, tankCapacity, remainingLiters, currentEthanolPct, target, tolerance, dilutantEthFraction, avgConsumption, inputOdo, e85EthFraction],
  )

  // One-shot defaults (odo + prices) once the data arrives — never clobber user edits.
  useEffect(() => {
    if (defaultsApplied || !winterRec || !entries) return
    setDefaultsApplied(true)
    const lastE85 = [...entries]
      .filter((e) => e.fuel_type === 'e85')
      .sort((a, b) => b.fueling_date.localeCompare(a.fueling_date))[0]
    if (lastE85) setE85PriceInput(String(lastE85.price_per_liter))
    const ref =
      e10Prices.find((p) => p.reference_date === todayStr()) ??
      [...e10Prices].sort((a, b) => b.reference_date.localeCompare(a.reference_date))[0]
    if (ref) setDilPriceInput(String(ref.price_per_liter))
    setOdoInput(String(Math.round(inputOdo)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsApplied, winterRec, entries, e10Prices])

  // Liters track the recommendation (e.g. after an odometer change) until the
  // user edits them.
  useEffect(() => {
    if (!winterRec) return
    if (winterRec.type === 'blend') {
      if (!touched.dil) setDilLitersInput(winterRec.dilutantLiters.toFixed(1))
      if (!touched.e85) setE85LitersInput(winterRec.e85Liters.toFixed(1))
    } else if (winterRec.type === 'pure_e85' && !touched.e85) {
      setE85LitersInput(winterRec.e85Liters.toFixed(1))
    }
  }, [winterRec, touched])

  // GPS → station list
  useEffect(() => {
    if (geo.status === 'success' && geo.latitude != null && geo.longitude != null) {
      setGpsLat(geo.latitude)
      setGpsLon(geo.longitude)
    }
  }, [geo.status, geo.latitude, geo.longitude])

  const fillsSinceConversion = useMemo(
    () => (entries && conversionDate ? entries.filter((e) => e.fueling_date >= conversionDate) : []),
    [entries, conversionDate],
  )

  const handleRecord = async () => {
    if (!winterRec || winterRec.type === 'tank_full') return
    const e85Price = Number(e85PriceInput)
    const e85Liters = Number(e85LitersInput)
    const dilLiters = winterRec.type === 'blend' ? Number(dilLitersInput) : 0
    const dilPrice = winterRec.type === 'blend' ? Number(dilPriceInput) : 0
    if (!Number.isFinite(e85Price) || e85Price <= 0) {
      toast.error(t.pump.pricesRequired)
      return
    }
    if (!Number.isFinite(e85Liters) || e85Liters <= 0) return
    if (dilLiters > 0 && (!Number.isFinite(dilPrice) || dilPrice <= 0)) {
      toast.error(t.pump.pricesRequired)
      return
    }
    const form = {
      vehicleId: vehicleId!,
      date: todayStr(),
      odometer: inputOdo,
      dilutantType,
      dilutantLiters: dilLiters,
      e85Liters,
      dilutantPrice: dilPrice,
      e85Price,
      stationName: stationName || null,
      location: stationLocation || null,
      latitude: gpsLat,
      longitude: gpsLon,
    }
    const payloads = buildBlendPayloads(winterRec, form)
    if (payloads.length === 0) return
    try {
      for (const p of payloads) {
        await createFuelEntry.mutateAsync(p)
      }
      toast.success(t.pump.success)
      onClose()
    } catch {
      toast.error(t.pump.error)
    }
  }

  const open = vehicleId !== null
  const showOnboarding =
    tankState != null && tankState.litersInTank === 0 && fillsSinceConversion.length === 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-emerald-600" />
            {t.pump.title}
            {vehicle && (
              <span className="text-sm font-normal text-muted-foreground">
                · {vehicle.brand} {vehicle.model}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {!conversion ? (
          <p className="py-4 text-sm text-muted-foreground">{t.pump.noConversion}</p>
        ) : !vehicle || !entries ? (
          <p className="py-4 text-sm text-muted-foreground">Chargement…</p>
        ) : tankCapacity == null ? (
          <p className="py-4 text-sm text-muted-foreground">{t.pump.noTankCapacity}</p>
        ) : showOnboarding ? (
          <p className="py-4 text-sm text-muted-foreground">{t.pump.noFullFill}</p>
        ) : (
          <div className="space-y-4">
            {/* Tank — no input, computed from real fills */}
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t.pump.tank}</p>
              <p className="text-lg font-semibold">
                {remainingLiters.toFixed(1)} L · {currentEthanolPct.toFixed(0)} % d'éthanol
              </p>
            </div>

            {/* Recommendation — existing winter logic */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t.pump.recommendation}</p>
              {winterRec?.type === 'tank_full' && (
                <p className="rounded-md border p-3 text-sm">{t.pump.tankFull}</p>
              )}
              {winterRec?.type === 'pure_e85' && (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                    {t.pump.pureE85.replace('{liters}', winterRec.e85Liters.toFixed(1))}
                  </p>
                  {winterRec.kmSafe !== null && winterRec.kmRelative !== null && (
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                      {t.pump.pureE85Safe
                        .replace('{odo}', winterRec.kmSafe.toLocaleString('fr-FR'))
                        .replace('{rel}', winterRec.kmRelative.toLocaleString('fr-FR'))}
                    </p>
                  )}
                </div>
              )}
              {winterRec?.type === 'blend' && (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                    {t.pump.blend
                      .replace('{liters}', winterRec.dilutantLiters.toFixed(1))
                      .replace('{label}', dilutantLabel)
                      .replace('{e85}', winterRec.e85Liters.toFixed(1))}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                    {t.pump.result
                      .replace('{pct}', winterRec.resultPct.toFixed(1))
                      .replace('{target}', String(target))
                      .replace('{tol}', String(tolerance))}
                  </p>
                </div>
              )}
            </div>

            {/* Record form */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-sm font-medium">{t.pump.odometer}</span>
                  <Input
                    type="number"
                    value={odoInput}
                    onChange={(e) => setOdoInput(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-medium">{t.pump.e85Price}</span>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={e85PriceInput}
                    onChange={(e) => setE85PriceInput(e.target.value)}
                  />
                </div>
              </div>

              {winterRec?.type === 'blend' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-sm font-medium">{t.pump.dilutantType}</span>
                    <Select value={dilutantType} onValueChange={(v) => setDilutantType(v as DilutantType)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="e10">E10</SelectItem>
                        <SelectItem value="sp98">SP98</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm font-medium">
                      {t.pump.dilutantPrice.replace('{label}', dilutantLabel)}
                    </span>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      value={dilPriceInput}
                      onChange={(e) => setDilPriceInput(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className={`grid gap-3 ${winterRec?.type === 'blend' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div className="space-y-1">
                  <span className="text-sm font-medium">E85 (L)</span>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={e85LitersInput}
                    onChange={(e) => {
                      setTouched((t) => ({ ...t, e85: true }))
                      setE85LitersInput(e.target.value)
                    }}
                  />
                </div>
                {winterRec?.type === 'blend' && (
                  <div className="space-y-1">
                    <span className="text-sm font-medium">{dilutantLabel} (L)</span>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={dilLitersInput}
                      onChange={(e) => {
                        setTouched((t) => ({ ...t, dil: true }))
                        setDilLitersInput(e.target.value)
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Button type="button" variant="outline" size="sm" onClick={() => geo.capture()}>
                  {t.fuel.captureGps}
                </Button>
                {gpsLat != null && gpsLon != null && (
                  <NearbyStationsList
                    latitude={gpsLat}
                    longitude={gpsLon}
                    fuelType="e85"
                    onSelect={(name, loc) => {
                      setStationName(name)
                      setStationLocation(loc)
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void handleRecord()}
            disabled={createFuelEntry.isPending || winterRec?.type === 'tank_full'}
          >
            {createFuelEntry.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t.pump.record}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
