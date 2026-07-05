import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { useVehicle, useUpdateVehicle } from '@/hooks/use-vehicles'
import { FUEL_TYPE_LABELS, FUEL_TYPES } from '@/lib/constants'
import type { FuelType } from '@/types'

const schema = z.object({
  brand: z.string().min(1, 'Marque requise').max(50),
  model: z.string().min(1, 'Modèle requis').max(50),
  year: z.coerce.number().min(1900).max(2030),
  license_plate: z.string().min(2, 'Plaque requise').max(20),
  fuel_type: z.enum(['essence', 'diesel', 'electrique', 'hybride', 'gpl', 'e85']),
  initial_odometer: z.coerce.number().min(0),
  tank_capacity: z.coerce.number().positive().optional().or(z.literal('')),
  acquisition_date: z.string().optional().or(z.literal('')),
  purchase_price: z.coerce.number().min(0).optional().or(z.literal('')),
  yearly_fixed_costs: z.coerce.number().min(0).optional().or(z.literal('')),
  insurance_unlimited: z.boolean().default(false),
  insurance_km_limit: z.coerce.number().min(0).optional().or(z.literal('')),
  insurance_km_annual_increase: z.coerce.number().min(0).optional().or(z.literal('')),
  insurance_km_start_date: z.string().optional().or(z.literal('')),
  description: z.string().max(1000).optional().or(z.literal('')),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof schema>

interface VehicleEditDialogProps {
  vehicleId: number | null
  onClose: () => void
}

export function VehicleEditDialog({ vehicleId, onClose }: VehicleEditDialogProps) {
  const { data: vehicle, isLoading } = useVehicle(vehicleId)
  const updateVehicle = useUpdateVehicle()

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
  })
  const insuranceUnlimited = useWatch({ control: form.control, name: 'insurance_unlimited' })

  useEffect(() => {
    if (vehicle) {
      form.reset({
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        license_plate: vehicle.license_plate,
        fuel_type: vehicle.fuel_type,
        initial_odometer: vehicle.initial_odometer,
        tank_capacity: vehicle.tank_capacity ?? '',
        acquisition_date: vehicle.acquisition_date ?? '',
        purchase_price: vehicle.purchase_price ?? '',
        yearly_fixed_costs: vehicle.yearly_fixed_costs ?? '',
        insurance_unlimited: vehicle.insurance_unlimited ?? false,
        insurance_km_limit: vehicle.insurance_km_limit ?? '',
        insurance_km_annual_increase: vehicle.insurance_km_annual_increase ?? '',
        insurance_km_start_date: vehicle.insurance_km_start_date ?? '',
        description: vehicle.description ?? '',
        is_active: vehicle.is_active,
      })
    }
  }, [vehicle, form])

  const onSubmit = async (data: FormData) => {
    if (!vehicleId) return
    try {
      await updateVehicle.mutateAsync({
        id: vehicleId,
        data: {
          brand: data.brand,
          model: data.model,
          year: data.year,
          license_plate: data.license_plate.toUpperCase(),
          fuel_type: data.fuel_type as FuelType,
          initial_odometer: data.initial_odometer,
          tank_capacity: data.tank_capacity ? Number(data.tank_capacity) : null,
          acquisition_date: data.acquisition_date || null,
          purchase_price: data.purchase_price ? Number(data.purchase_price) : null,
          yearly_fixed_costs: data.yearly_fixed_costs ? Number(data.yearly_fixed_costs) : null,
          insurance_unlimited: data.insurance_unlimited,
          insurance_km_limit: data.insurance_unlimited ? null : (data.insurance_km_limit ? Number(data.insurance_km_limit) : null),
          insurance_km_annual_increase: data.insurance_unlimited ? null : (data.insurance_km_annual_increase ? Number(data.insurance_km_annual_increase) : null),
          insurance_km_start_date: data.insurance_unlimited ? null : (data.insurance_km_start_date || null),
          description: data.description || null,
          is_active: data.is_active,
        },
      })
      toast.success('Véhicule mis à jour')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la mise à jour')
    }
  }

  const open = vehicleId !== null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le véhicule</DialogTitle>
        </DialogHeader>

        {isLoading || !vehicle ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-brand">Marque *</Label>
                <Input id="edit-brand" {...form.register('brand')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-model">Modèle *</Label>
                <Input id="edit-model" {...form.register('model')} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-year">Année *</Label>
                <Input id="edit-year" type="number" {...form.register('year')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-fuel_type">Carburant *</Label>
                <Select
                  value={form.watch('fuel_type')}
                  onValueChange={(v) => form.setValue('fuel_type', v as FormData['fuel_type'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUEL_TYPES.map((ft) => (
                      <SelectItem key={ft} value={ft}>
                        {FUEL_TYPE_LABELS[ft]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-license_plate">Plaque *</Label>
                <Input id="edit-license_plate" {...form.register('license_plate')} className="uppercase" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-initial_odometer">Compteur initial (km)</Label>
                <Input id="edit-initial_odometer" type="number" {...form.register('initial_odometer')} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-tank_capacity">Réservoir (L)</Label>
                <Input id="edit-tank_capacity" type="number" step="0.1" {...form.register('tank_capacity')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-acquisition_date">Date d'acquisition</Label>
                <Input id="edit-acquisition_date" type="date" {...form.register('acquisition_date')} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-purchase_price">Prix d'achat (&euro;)</Label>
                <Input id="edit-purchase_price" type="number" step="0.01" {...form.register('purchase_price')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-yearly_fixed_costs">Frais fixes (&euro;/an)</Label>
                <Input
                  id="edit-yearly_fixed_costs"
                  type="number"
                  step="0.01"
                  placeholder="assurance, CT..."
                  {...form.register('yearly_fixed_costs')}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-insurance_unlimited"
                  checked={insuranceUnlimited ?? false}
                  onCheckedChange={(v) => form.setValue('insurance_unlimited', v === true)}
                />
                <Label htmlFor="edit-insurance_unlimited" className="font-normal cursor-pointer">
                  Kilométrage illimité
                </Label>
              </div>
              {!insuranceUnlimited && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-insurance_km_limit">Limite km</Label>
                    <Input id="edit-insurance_km_limit" type="number" {...form.register('insurance_km_limit')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-insurance_annual">Augm. /an</Label>
                    <Input id="edit-insurance_annual" type="number" {...form.register('insurance_km_annual_increase')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-insurance_start">Début</Label>
                    <Input id="edit-insurance_start" type="date" {...form.register('insurance_km_start_date')} />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea id="edit-description" {...form.register('description')} rows={3} />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-is_active"
                {...form.register('is_active')}
                className="h-4 w-4 rounded border"
              />
              <Label htmlFor="edit-is_active">Véhicule actif</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" disabled={updateVehicle.isPending}>
                {updateVehicle.isPending ? 'Mise à jour...' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
