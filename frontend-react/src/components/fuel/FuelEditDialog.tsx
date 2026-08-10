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
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateFuelEntry, useStationSuggestions } from '@/hooks/use-fuel-entries'
import { useVehicle } from '@/hooks/use-vehicles'
import { useFlexfuelConversion } from '@/hooks/use-flexfuel'
import { useGeolocation } from '@/hooks/use-geolocation'
import { NearbyStationsList } from './NearbyStationsList'
import type { FuelEntry } from '@/types'

const schema = z.object({
  fueling_date: z.string().min(1),
  odometer_reading: z.coerce.number().int().min(0),
  liters: z.coerce.number().positive(),
  price_per_liter: z.coerce.number().positive(),
  fuel_type: z.enum(['essence', 'diesel', 'electrique', 'hybride', 'gpl', 'e85']),
  is_full_tank: z.boolean(),
  station_name: z.string().optional().or(z.literal('')),
  location: z.string().optional().or(z.literal('')),
})

type FormData = z.infer<typeof schema>

interface FuelEditDialogProps {
  entry: FuelEntry | null
  vehicleId: number
  onClose: () => void
}

export function FuelEditDialog({ entry, vehicleId, onClose }: FuelEditDialogProps) {
  const { data: vehicle } = useVehicle(vehicleId)
  const { data: flexfuelConversion } = useFlexfuelConversion(vehicleId)
  const isFlexfuel = !!flexfuelConversion
  const updateFuelEntry = useUpdateFuelEntry(vehicleId)
  const { data: stations } = useStationSuggestions(vehicleId)
  const geo = useGeolocation()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<FormData>({ resolver: zodResolver(schema) as any })

  useEffect(() => {
    if (entry) {
      form.reset({
        fueling_date: entry.fueling_date,
        odometer_reading: entry.odometer_reading,
        liters: entry.liters,
        price_per_liter: entry.price_per_liter,
        fuel_type: entry.fuel_type as FormData['fuel_type'],
        is_full_tank: entry.is_full_tank,
        station_name: entry.station_name ?? '',
        location: entry.location ?? '',
      })
      geo.reset()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry])

  const liters = form.watch('liters')
  const pricePerLiter = form.watch('price_per_liter')
  const totalCost = liters && pricePerLiter ? (liters * pricePerLiter).toFixed(2) : '0.00'

  const selectedFuelType = form.watch('fuel_type')
  const fuelTypeMismatch =
    !isFlexfuel &&
    vehicle?.fuel_type &&
    vehicle.fuel_type !== 'hybride' &&
    selectedFuelType &&
    selectedFuelType !== vehicle.fuel_type

  const onSubmit = async (data: FormData) => {
    if (!entry) return
    const allowOdometerDecrease = data.odometer_reading < entry.odometer_reading
    if (
      allowOdometerDecrease &&
      !confirm('Le compteur est inférieur au relevé enregistré. Confirmer cette correction ?')
    ) return

    try {
      await updateFuelEntry.mutateAsync({
        id: entry.id,
        allowOdometerDecrease,
        data: {
          fueling_date: data.fueling_date,
          odometer_reading: data.odometer_reading,
          liters: data.liters,
          price_per_liter: data.price_per_liter,
          fuel_type: data.fuel_type,
          is_full_tank: data.is_full_tank,
          station_name: data.station_name || null,
          location: data.location || null,
          latitude: geo.latitude ?? entry.latitude,
          longitude: geo.longitude ?? entry.longitude,
        },
      })
      toast.success('Plein mis à jour')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la mise à jour')
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le plein</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" {...form.register('fueling_date')} />
              </div>
              <div className="space-y-2">
                <Label>Compteur (km)</Label>
                <Input type="number" {...form.register('odometer_reading')} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Litres</Label>
                <Input type="number" step="0.01" {...form.register('liters')} />
              </div>
              <div className="space-y-2">
                <Label>Prix/L</Label>
                <Input type="number" step="0.001" {...form.register('price_per_liter')} />
              </div>
              <div className="space-y-2">
                <Label>Total</Label>
                <Input value={`${totalCost} €`} disabled className="font-medium" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Type de carburant</Label>
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

            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-full-tank"
                checked={form.watch('is_full_tank')}
                onCheckedChange={(checked) => form.setValue('is_full_tank', checked === true)}
              />
              <Label htmlFor="edit-full-tank" className="cursor-pointer">
                Plein complet
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Station</Label>
              <Input
                list="edit-station-suggestions"
                {...form.register('station_name')}
              />
              {stations && stations.length > 0 && (
                <datalist id="edit-station-suggestions">
                  {stations.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
            </div>

            <div className="space-y-2">
              <Label>Localisation</Label>
              <div className="flex gap-2">
                <Input {...form.register('location')} className="flex-1" />
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
                fuelType={selectedFuelType}
                onSelect={(stationName, location, price) => {
                  form.setValue('station_name', stationName)
                  form.setValue('location', location)
                  if (price != null) form.setValue('price_per_liter', price)
                }}
              />
            )}
          </div>

          <DialogFooter className="border-t pt-4 mt-4 shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={updateFuelEntry.isPending}>
              {updateFuelEntry.isPending ? 'Mise à jour...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
