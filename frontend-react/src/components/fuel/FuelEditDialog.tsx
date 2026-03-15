import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useUpdateFuelEntry } from '@/hooks/use-fuel-entries'
import { useVehicle } from '@/hooks/use-vehicles'
import type { FuelEntry } from '@/types'

const schema = z.object({
  fueling_date: z.string().min(1),
  odometer_reading: z.coerce.number().int().min(0),
  liters: z.coerce.number().positive(),
  price_per_liter: z.coerce.number().positive(),
  is_full_tank: z.boolean(),
})

type FormData = z.infer<typeof schema>

interface FuelEditDialogProps {
  entry: FuelEntry | null
  vehicleId: number
  onClose: () => void
}

export function FuelEditDialog({ entry, vehicleId, onClose }: FuelEditDialogProps) {
  const { data: vehicle } = useVehicle(vehicleId)
  const updateFuelEntry = useUpdateFuelEntry(vehicleId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<FormData>({ resolver: zodResolver(schema) as any })

  useEffect(() => {
    if (entry) {
      form.reset({
        fueling_date: entry.fueling_date,
        odometer_reading: entry.odometer_reading,
        liters: entry.liters,
        price_per_liter: entry.price_per_liter,
        is_full_tank: entry.is_full_tank,
      })
    }
  }, [entry, form])

  const liters = form.watch('liters')
  const pricePerLiter = form.watch('price_per_liter')
  const totalCost = liters && pricePerLiter ? (liters * pricePerLiter).toFixed(2) : '0.00'

  const onSubmit = async (data: FormData) => {
    if (!entry) return
    try {
      await updateFuelEntry.mutateAsync({
        id: entry.id,
        data: {
          fueling_date: data.fueling_date,
          odometer_reading: data.odometer_reading,
          liters: data.liters,
          price_per_liter: data.price_per_liter,
          fuel_type: vehicle?.fuel_type ?? entry.fuel_type,
          is_full_tank: data.is_full_tank,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le plein</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

          <DialogFooter>
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
