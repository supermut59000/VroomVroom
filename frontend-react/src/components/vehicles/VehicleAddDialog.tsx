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
import { useCreateVehicle } from '@/hooks/use-vehicles'
import { FUEL_TYPE_LABELS, FUEL_TYPES } from '@/lib/constants'

const schema = z.object({
  brand: z.string().min(1, 'Marque requise').max(50),
  model: z.string().min(1, 'Modèle requis').max(50),
  year: z.coerce.number().min(1900).max(2030),
  license_plate: z.string().min(2, 'Plaque requise').max(20),
  fuel_type: z.enum(['essence', 'diesel', 'electrique', 'hybride', 'gpl', 'e85']),
  initial_odometer: z.coerce.number().min(0).default(0),
  tank_capacity: z.coerce.number().positive().optional().or(z.literal('')),
  acquisition_date: z.string().optional().or(z.literal('')),
  purchase_price: z.coerce.number().min(0).optional().or(z.literal('')),
  yearly_fixed_costs: z.coerce.number().min(0).optional().or(z.literal('')),
  insurance_unlimited: z.boolean().default(false),
  insurance_km_limit: z.coerce.number().min(0).optional().or(z.literal('')),
  insurance_km_annual_increase: z.coerce.number().min(0).optional().or(z.literal('')),
  insurance_km_start_date: z.string().optional().or(z.literal('')),
  description: z.string().max(1000).optional().or(z.literal('')),
})

type FormData = z.infer<typeof schema>

interface VehicleAddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VehicleAddDialog({ open, onOpenChange }: VehicleAddDialogProps) {
  const createVehicle = useCreateVehicle()
  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      brand: '',
      model: '',
      year: new Date().getFullYear(),
      license_plate: '',
      fuel_type: 'essence',
      initial_odometer: 0,
      insurance_unlimited: false,
    },
  })
  const insuranceUnlimited = useWatch({ control: form.control, name: 'insurance_unlimited' })

  const onSubmit = async (data: FormData) => {
    try {
      await createVehicle.mutateAsync({
        brand: data.brand,
        model: data.model,
        year: data.year,
        license_plate: data.license_plate.toUpperCase(),
        fuel_type: data.fuel_type,
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
      })
      toast.success('Véhicule ajouté avec succès')
      form.reset()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la création')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un véhicule</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="brand">Marque *</Label>
              <Input id="brand" {...form.register('brand')} />
              {form.formState.errors.brand && (
                <p className="text-xs text-destructive">{form.formState.errors.brand.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Modèle *</Label>
              <Input id="model" {...form.register('model')} />
              {form.formState.errors.model && (
                <p className="text-xs text-destructive">{form.formState.errors.model.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year">Année *</Label>
              <Input id="year" type="number" {...form.register('year')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuel_type">Carburant *</Label>
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
              <Label htmlFor="license_plate">Plaque *</Label>
              <Input
                id="license_plate"
                {...form.register('license_plate')}
                className="uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initial_odometer">Compteur initial (km)</Label>
              <Input id="initial_odometer" type="number" {...form.register('initial_odometer')} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tank_capacity">Réservoir (L)</Label>
              <Input id="tank_capacity" type="number" step="0.1" {...form.register('tank_capacity')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acquisition_date">Date d'acquisition</Label>
              <Input id="acquisition_date" type="date" {...form.register('acquisition_date')} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purchase_price">Prix d'achat (&euro;)</Label>
              <Input id="purchase_price" type="number" step="0.01" {...form.register('purchase_price')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="yearly_fixed_costs">Frais fixes (&euro;/an)</Label>
              <Input
                id="yearly_fixed_costs"
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
                id="insurance_unlimited"
                checked={insuranceUnlimited}
                onCheckedChange={(v) => form.setValue('insurance_unlimited', v === true)}
              />
              <Label htmlFor="insurance_unlimited" className="font-normal cursor-pointer">
                Kilométrage illimité
              </Label>
            </div>
            {!insuranceUnlimited && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="insurance_km_limit">Limite km assurance</Label>
                  <Input id="insurance_km_limit" type="number" {...form.register('insurance_km_limit')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insurance_km_annual_increase">Augm. annuelle (km)</Label>
                  <Input
                    id="insurance_km_annual_increase"
                    type="number"
                    {...form.register('insurance_km_annual_increase')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insurance_km_start_date">Début suivi</Label>
                  <Input
                    id="insurance_km_start_date"
                    type="date"
                    {...form.register('insurance_km_start_date')}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...form.register('description')} rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={createVehicle.isPending}>
              {createVehicle.isPending ? 'Ajout...' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
