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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useVehicle } from '@/hooks/use-vehicles'
import { useCreateMaintenance, useMaintenanceTypeOptions } from '@/hooks/use-maintenances'
import { useOffline } from '@/hooks/use-offline'
import { ApiError } from '@/lib/api'

const schema = z.object({
  maintenance_date: z.string().min(1, 'Date requise'),
  maintenance_type: z.string().min(1, 'Type requis'),
  description: z.string().optional().or(z.literal('')),
  odometer_reading: z.coerce.number().int().min(0, 'Compteur requis'),
  cost: z.coerce.number().min(0, 'Coût requis'),
  service_provider: z.string().optional().or(z.literal('')),
  location: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  next_maintenance_date: z.string().optional().or(z.literal('')),
  next_maintenance_odometer: z.coerce.number().int().min(0).optional().or(z.literal('')),
})

type FormData = z.infer<typeof schema>

interface MaintenanceAddDialogProps {
  vehicleId: number | null
  onClose: () => void
}

export function MaintenanceAddDialog({ vehicleId, onClose }: MaintenanceAddDialogProps) {
  const { data: vehicle } = useVehicle(vehicleId)
  const { addToQueue } = useOffline()
  const createMaintenance = useCreateMaintenance()
  const typeOptions = useMaintenanceTypeOptions(vehicleId)

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      maintenance_date: new Date().toISOString().split('T')[0],
      maintenance_type: 'Vidange',
      description: '',
      odometer_reading: '' as unknown as number,
      cost: '' as unknown as number,
      service_provider: '',
      location: '',
      notes: '',
      next_maintenance_date: '',
    },
  })

  const onSubmit = async (data: FormData) => {
    if (!vehicleId) return
    const payload = {
      vehicle_id: vehicleId,
      maintenance_type: data.maintenance_type,
      description: data.description || null,
      odometer_reading: data.odometer_reading,
      cost: data.cost,
      service_provider: data.service_provider || null,
      location: data.location || null,
      maintenance_date: data.maintenance_date,
      notes: data.notes || null,
      next_maintenance_date: data.next_maintenance_date || null,
      next_maintenance_odometer: data.next_maintenance_odometer
        ? Number(data.next_maintenance_odometer)
        : null,
    }
    try {
      await createMaintenance.mutateAsync(payload)
      toast.success('Maintenance ajoutée')
      form.reset()
      onClose()
    } catch (e) {
      // ApiError = server rejected — show why. Anything else = server
      // unreachable: queue it so an offline add isn't lost.
      if (e instanceof ApiError) {
        toast.error(e.message)
      } else {
        addToQueue({ kind: 'maintenance-create', data: payload })
        toast.info('Serveur injoignable — maintenance mise en file d\'attente, synchronisation automatique')
        form.reset()
        onClose()
      }
    }
  }

  const open = vehicleId !== null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une maintenance</DialogTitle>
          {vehicle && (
            <p className="text-sm text-muted-foreground">
              {vehicle.brand} {vehicle.model} — {vehicle.license_plate}
            </p>
          )}
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" {...form.register('maintenance_date')} />
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              <Input
                list="maintenance-type-options"
                {...form.register('maintenance_type')}
                placeholder="vidange, nettoyage…"
              />
              <datalist id="maintenance-type-options">
                {typeOptions.map((mt) => (
                  <option key={mt} value={mt} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea {...form.register('description')} rows={2} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Compteur (km) *</Label>
              <Input type="number" {...form.register('odometer_reading')} />
            </div>
            <div className="space-y-2">
              <Label>Coût (&euro;) *</Label>
              <Input type="number" step="0.01" {...form.register('cost')} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prestataire</Label>
              <Input {...form.register('service_provider')} />
            </div>
            <div className="space-y-2">
              <Label>Lieu</Label>
              <Input {...form.register('location')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea {...form.register('notes')} rows={2} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prochaine maintenance (date)</Label>
              <Input type="date" {...form.register('next_maintenance_date')} />
            </div>
            <div className="space-y-2">
              <Label>Prochaine maintenance (km)</Label>
              <Input type="number" {...form.register('next_maintenance_odometer')} />
            </div>
          </div>

          </div>

          <DialogFooter className="border-t pt-4 mt-4 shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={createMaintenance.isPending}>
              {createMaintenance.isPending ? 'Ajout...' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
