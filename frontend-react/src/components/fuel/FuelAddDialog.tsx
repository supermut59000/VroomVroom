import { useEffect } from 'react'
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
} from '@/hooks/use-fuel-entries'
import { useFlexfuelConversion } from '@/hooks/use-flexfuel'
import { useGeolocation } from '@/hooks/use-geolocation'
import { useOffline } from '@/hooks/use-offline'
import { NearbyStationsList } from './NearbyStationsList'

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
  const { data: flexfuelConversion } = useFlexfuelConversion(vehicleId)
  const createFuelEntry = useCreateFuelEntry()
  const geo = useGeolocation()
  const { isOnline, addToQueue } = useOffline()

  // Vehicle has a FlexFuel conversion — show fuel type selector
  const isFlexfuel = !!flexfuelConversion

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

  // Auto-fill fuel_type from last fill for FlexFuel vehicles
  useEffect(() => {
    if (isFlexfuel && latestEntry) {
      const lastType = latestEntry.fuel_type
      if (lastType === 'e85' || lastType === 'essence') {
        form.setValue('fuel_type', lastType)
      }
    }
  }, [isFlexfuel, latestEntry, form])

  const liters = form.watch('liters')
  const pricePerLiter = form.watch('price_per_liter')
  const totalCost = liters && pricePerLiter ? (liters * pricePerLiter).toFixed(2) : '0.00'

  const onSubmit = async (data: FormData) => {
    if (!vehicleId) return

    // Check odometer
    if (latestEntry && data.odometer_reading < latestEntry.odometer_reading) {
      if (!confirm('Le compteur est inférieur au dernier relevé. Continuer ?')) return
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
      form.reset()
      geo.reset()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'ajout")
    }
  }

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fuel-date">Date *</Label>
              <Input id="fuel-date" type="date" {...form.register('fueling_date')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuel-odometer">
                Compteur (km) *
                {latestEntry && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (dernier: {latestEntry.odometer_reading.toLocaleString('fr-FR')})
                  </span>
                )}
              </Label>
              <Input id="fuel-odometer" type="number" {...form.register('odometer_reading')} />
            </div>
          </div>

          {isFlexfuel && (
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
                  <SelectItem value="e85">E85</SelectItem>
                  <SelectItem value="essence">Essence (E10)</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            <div className="flex gap-2">
              <Input id="fuel-location" {...form.register('location')} className="flex-1" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={geo.capture}
                disabled={geo.status === 'loading'}
                title="Capturer ma position GPS"
              >
                {geo.status === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MapPin className="h-4 w-4" />
                )}
              </Button>
            </div>
            {geo.status === 'success' && (
              <p className="text-xs text-green-600">
                Position capturée ({geo.latitude?.toFixed(5)}, {geo.longitude?.toFixed(5)})
              </p>
            )}
            {geo.status === 'error' && (
              <p className="text-xs text-destructive">{geo.error}</p>
            )}
          </div>

          {geo.status === 'success' && geo.latitude != null && geo.longitude != null && (
            <NearbyStationsList
              latitude={geo.latitude}
              longitude={geo.longitude}
              fuelType={form.watch('fuel_type')}
              onSelect={(stationName, location, price) => {
                form.setValue('station_name', stationName)
                form.setValue('location', location)
                if (price != null) form.setValue('price_per_liter', price)
              }}
            />
          )}

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
