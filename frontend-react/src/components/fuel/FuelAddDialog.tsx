import { useEffect, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { MapPin, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useVehicle } from '@/hooks/use-vehicles'
import {
  useCreateFuelEntry,
  useLatestFuelEntry,
  useStationSuggestions,
  useAllFuelEntries,
} from '@/hooks/use-fuel-entries'
import {
  useFlexfuelConversion,
  useCreateE10ReferencePrice,
  useE10ReferencePrices,
} from '@/hooks/use-flexfuel'
import { useGeolocation } from '@/hooks/use-geolocation'
import { useOffline } from '@/hooks/use-offline'
import { ApiError } from '@/lib/api'
import { NearbyStationsList } from './NearbyStationsList'
import type { StationPrices } from '@/hooks/use-nearby-stations'

const schema = z.object({
  fueling_date: z.string().min(1, 'Date requise'),
  odometer_reading: z.coerce.number().int().min(0, 'Compteur requis'),
  liters: z.coerce.number().positive('Quantité requise'),
  price_per_liter: z.coerce.number().positive('Prix requis'),
  fuel_type: z.enum(['essence', 'diesel', 'electrique', 'hybride', 'gpl', 'e85']),
  is_full_tank: z.boolean(),
  station_name: z.string().optional().or(z.literal('')),
  location: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
})

type FormData = z.infer<typeof schema>

interface FuelAddDialogProps {
  vehicleId: number | null
  onClose: () => void
}

export function FuelAddDialog({ vehicleId, onClose }: FuelAddDialogProps) {
  const { data: vehicle } = useVehicle(vehicleId)
  const { data: latestEntry } = useLatestFuelEntry(vehicleId)
  const { data: stations } = useStationSuggestions(vehicleId)
  const { data: allEntries } = useAllFuelEntries(vehicleId)
  const { data: flexfuelConversion } = useFlexfuelConversion(vehicleId)
  const createFuelEntry = useCreateFuelEntry()
  const geo = useGeolocation()
  const { isOnline, addToQueue } = useOffline()

  const isFlexfuel = !!flexfuelConversion
  const createE10Price = useCreateE10ReferencePrice()
  const { data: e10Prices } = useE10ReferencePrices(isFlexfuel)
  // E10 price of the station picked in NearbyStationsList — auto-recorded as a
  // global E10 reference on E85 fills so the rentability calc stays fed.
  const stationE10PriceRef = useRef<number | null>(null)

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      fueling_date: new Date().toISOString().split('T')[0],
      odometer_reading: '' as unknown as number,
      liters: '' as unknown as number,
      price_per_liter: '' as unknown as number,
      fuel_type: 'essence',
      is_full_tank: true,
      station_name: '',
      location: '',
      notes: '',
    },
  })

  // Auto-fill fuel_type from last fill
  useEffect(() => {
    if (latestEntry?.fuel_type) {
      form.setValue('fuel_type', latestEntry.fuel_type as FormData['fuel_type'])
    } else if (vehicle?.fuel_type) {
      form.setValue('fuel_type', vehicle.fuel_type as FormData['fuel_type'])
    }
  }, [latestEntry, vehicle, form])

  const liters = form.watch('liters')
  const pricePerLiter = form.watch('price_per_liter')
  const totalCost = liters && pricePerLiter ? (liters * pricePerLiter).toFixed(2) : '0.00'

  const selectedFuelType = form.watch('fuel_type')
  // Hybrids legitimately fill with essence/diesel, so no warning for them.
  const fuelTypeMismatch =
    !isFlexfuel &&
    vehicle?.fuel_type &&
    vehicle.fuel_type !== 'hybride' &&
    selectedFuelType &&
    selectedFuelType !== vehicle.fuel_type

  const onSubmit = async (data: FormData) => {
    if (!vehicleId) return

    // Check odometer — a confirmed lower reading (backfill, odometer swap)
    // must actually reach the backend as allow_odometer_decrease, otherwise
    // the confirm is a lie and the create 422s anyway.
    let allowOdometerDecrease = false
    if (latestEntry && data.odometer_reading < latestEntry.odometer_reading) {
      if (!confirm('Le compteur est inférieur au dernier relevé. Continuer ?')) return
      allowOdometerDecrease = true
    }
    if (latestEntry && data.odometer_reading === latestEntry.odometer_reading) {
      if (!confirm('Le compteur est identique au dernier relevé. Continuer ?')) return
    }

    const payload = {
      vehicle_id: vehicleId,
      fuel_type: isFlexfuel ? data.fuel_type : (vehicle?.fuel_type ?? data.fuel_type),
      liters: data.liters,
      price_per_liter: data.price_per_liter,
      odometer_reading: data.odometer_reading,
      fueling_date: data.fueling_date,
      is_full_tank: data.is_full_tank,
      station_name: data.station_name || null,
      location: data.location || null,
      latitude: geo.latitude,
      longitude: geo.longitude,
      notes: data.notes || null,
      client_request_id: crypto.randomUUID(),
      allowOdometerDecrease,
    }

    if (!isOnline) {
      addToQueue(payload)
      toast.info('Plein enregistré hors-ligne — sera synchronisé au retour de la connexion')
      form.reset()
      geo.reset()
      onClose()
      return
    }

    try {
      await createFuelEntry.mutateAsync(payload)
      toast.success('Plein ajouté avec succès')

      // Best-effort E10 reference auto-capture (one per date, E85 fills only).
      // e10Prices must be LOADED to dedup — while undefined, skip rather than
      // risk inserting a duplicate for the same date.
      const e10Price = stationE10PriceRef.current
      if (
        isFlexfuel &&
        data.fuel_type === 'e85' &&
        e10Price != null &&
        e10Prices != null &&
        !e10Prices.some((p) => p.reference_date === data.fueling_date)
      ) {
        try {
          await createE10Price.mutateAsync({
            reference_date: data.fueling_date,
            price_per_liter: e10Price,
            notes: `Auto — ${data.station_name || 'station proche'}`,
          })
          toast.info(`Prix E10 de référence enregistré : ${e10Price.toFixed(3)} €/L`)
        } catch {
          // reference price is a bonus, never block the fill
        }
      }

      stationE10PriceRef.current = null
      form.reset()
      geo.reset()
      onClose()
    } catch (e) {
      // ApiError = the server received and rejected the entry — show why.
      // Anything else (timeout, DNS, connection refused) = server unreachable
      // even though navigator.onLine is true (LTE up, homelab down): queue it
      // instead of losing the fill.
      if (e instanceof ApiError) {
        toast.error(e.message)
      } else {
        addToQueue(payload)
        toast.info('Serveur injoignable — plein mis en file d\'attente, synchronisation automatique')
        form.reset()
        geo.reset()
        onClose()
      }
    }
  }

  const handleStationSelect = useCallback(
    (stationName: string, location: string, price: number | null, prices?: StationPrices) => {
      form.setValue('station_name', stationName)
      form.setValue('location', location)
      if (price != null) form.setValue('price_per_liter', price)
      stationE10PriceRef.current = prices?.e10 ?? null
    },
    [form],
  )

  const open = vehicleId !== null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un plein</DialogTitle>
          {vehicle && (
            <p className="text-sm text-muted-foreground">
              {vehicle.brand} {vehicle.model} ({vehicle.year}) — {vehicle.license_plate}
            </p>
          )}
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">

          {/* Row 1: date + odometer + GPS button */}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <div className="space-y-2">
              <Label htmlFor="fuel-date">Date *</Label>
              <Input id="fuel-date" type="date" {...form.register('fueling_date')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuel-odometer">
                Compteur *
                {latestEntry && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({latestEntry.odometer_reading.toLocaleString('fr-FR')})
                  </span>
                )}
              </Label>
              <Input id="fuel-odometer" type="number" {...form.register('odometer_reading')} />
            </div>
            <Button
              type="button"
              variant={geo.status === 'success' ? 'default' : 'outline'}
              size="icon"
              onClick={geo.capture}
              disabled={geo.status === 'loading'}
              title="Capturer ma position GPS"
              aria-label="Capturer ma position GPS"
            >
              {geo.status === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
            </Button>
          </div>
          {geo.status === 'error' && (
            <p className="text-xs text-destructive">{geo.error}</p>
          )}

          {/* Nearby stations list (appears after GPS capture) */}
          {geo.status === 'success' && geo.latitude != null && geo.longitude != null && (
            <NearbyStationsList
              latitude={geo.latitude}
              longitude={geo.longitude}
              fuelType={form.watch('fuel_type')}
              historyEntries={allEntries?.filter(
                (e) => e.latitude != null && e.longitude != null && e.station_name,
              )}
              autoSelect
              onSelect={handleStationSelect}
            />
          )}

          {/* Fuel type — always shown, pre-filled from last fill */}
          <div className="space-y-2">
            <Label>Type de carburant *</Label>
            <Select
              value={form.watch('fuel_type')}
              onValueChange={(v) => form.setValue('fuel_type', v as FormData['fuel_type'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isFlexfuel ? (
                  <>
                    <SelectItem value="e85">E85</SelectItem>
                    <SelectItem value="essence">Essence (E10)</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="essence">Essence</SelectItem>
                    <SelectItem value="diesel">Diesel</SelectItem>
                    <SelectItem value="gpl">GPL</SelectItem>
                    <SelectItem value="electrique">Électrique</SelectItem>
                    <SelectItem value="hybride">Hybride</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {fuelTypeMismatch && (
            <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-400">
              ⚠ Le type sélectionné ({selectedFuelType}) diffère du carburant enregistré du véhicule ({vehicle?.fuel_type}).
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fuel-liters">Litres *</Label>
              <Input id="fuel-liters" type="number" step="0.01" {...form.register('liters')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuel-price">Prix/L (&euro;) *</Label>
              <Input id="fuel-price" type="number" step="0.001" {...form.register('price_per_liter')} />
            </div>
            <div className="space-y-2">
              <Label>Total</Label>
              <Input value={`${totalCost} €`} disabled className="font-medium" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="fuel-full-tank"
              checked={form.watch('is_full_tank')}
              onCheckedChange={(checked) => form.setValue('is_full_tank', checked === true)}
            />
            <Label htmlFor="fuel-full-tank" className="cursor-pointer">
              Plein complet
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fuel-station">Station</Label>
            <Input
              id="fuel-station"
              list="station-suggestions"
              {...form.register('station_name')}
            />
            {stations && stations.length > 0 && (
              <datalist id="station-suggestions">
                {stations.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="fuel-location">Localisation</Label>
            <Input id="fuel-location" {...form.register('location')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fuel-notes">Notes</Label>
            <Textarea id="fuel-notes" {...form.register('notes')} rows={2} />
          </div>

          </div>

          <DialogFooter className="border-t pt-4 mt-4 shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={createFuelEntry.isPending}>
              {createFuelEntry.isPending ? 'Ajout...' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
