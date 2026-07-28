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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useUpdateMaintenance } from '@/hooks/use-maintenances'
import { useMaintenanceTypeOptions } from '@/hooks/use-maintenances'
import type { Maintenance } from '@/types'

const schema = z.object({
  maintenance_date: z.string().min(1),
  maintenance_type: z.string().min(1),
  description: z.string().optional().or(z.literal('')),
  odometer_reading: z.coerce.number().int().min(0),
  cost: z.coerce.number().min(0),
  service_provider: z.string().optional().or(z.literal('')),
  location: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  next_maintenance_date: z.string().optional().or(z.literal('')),
  next_maintenance_odometer: z.coerce.number().int().min(0).optional().or(z.literal('')),
})

type FormData = z.infer<typeof schema>

interface MaintenanceEditDialogProps {
  entry: Maintenance | null
  vehicleId: number
  onClose: () => void
}

export function MaintenanceEditDialog({ entry, vehicleId, onClose }: MaintenanceEditDialogProps) {
  const updateMaintenance = useUpdateMaintenance(vehicleId)
  const typeOptions = useMaintenanceTypeOptions(vehicleId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<FormData>({ resolver: zodResolver(schema) as any })

  useEffect(() => {
    if (entry) {
      form.reset({
        maintenance_date: entry.maintenance_date,
        maintenance_type: entry.maintenance_type,
        description: entry.description ?? '',
        odometer_reading: entry.odometer_reading,
        cost: entry.cost,
        service_provider: entry.service_provider ?? '',
        location: entry.location ?? '',
        notes: entry.notes ?? '',
        next_maintenance_date: entry.next_maintenance_date ?? '',
        next_maintenance_odometer: entry.next_maintenance_odometer ?? '',
      })
    }
  }, [entry, form])

  const onSubmit = async (data: FormData) => {
    if (!entry) return
    try {
      await updateMaintenance.mutateAsync({
        id: entry.id,
        data: {
          maintenance_date: data.maintenance_date,
          maintenance_type: data.maintenance_type,
          description: data.description || null,
          odometer_reading: data.odometer_reading,
          cost: data.cost,
          service_provider: data.service_provider || null,
          location: data.location || null,
          notes: data.notes || null,
          next_maintenance_date: data.next_maintenance_date || null,
          next_maintenance_odometer: data.next_maintenance_odometer
            ? Number(data.next_maintenance_odometer)
            : null,
        },
      })
      toast.success('Maintenance mise à jour')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la mise à jour')
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier la maintenance</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" {...form.register('maintenance_date')} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Input
                list="maintenance-type-options-edit"
                {...form.register('maintenance_type')}
                placeholder="vidange, nettoyage…"
              />
              <datalist id="maintenance-type-options-edit">
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
              <Label>Compteur (km)</Label>
              <Input type="number" {...form.register('odometer_reading')} />
            </div>
            <div className="space-y-2">
              <Label>Coût (&euro;)</Label>
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
              <Label>Prochaine (date)</Label>
              <Input type="date" {...form.register('next_maintenance_date')} />
            </div>
            <div className="space-y-2">
              <Label>Prochaine (km)</Label>
              <Input type="number" {...form.register('next_maintenance_odometer')} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={updateMaintenance.isPending}>
              {updateMaintenance.isPending ? 'Mise à jour...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
