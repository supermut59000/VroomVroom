import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Leaf } from 'lucide-react'
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
  useFlexfuelConversion,
  useCreateFlexfuelConversion,
  useUpdateFlexfuelConversion,
  useDeleteFlexfuelConversion,
} from '@/hooks/use-flexfuel'

const schema = z.object({
  conversion_date: z.string().min(1, 'Date requise'),
  kit_cost: z.coerce.number().positive('Coût requis'),
  overconsumption_pct: z.coerce.number().min(1).max(100),
  kit_brand: z.string().optional().or(z.literal('')),
  installer: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  target_ethanol_pct: z.coerce.number().min(0).max(100),
  ethanol_tolerance_pct: z.coerce.number().min(0).max(20),
})

type FormData = z.infer<typeof schema>

interface FlexfuelConversionDialogProps {
  vehicleId: number | null
  open: boolean
  onClose: () => void
}

export function FlexfuelConversionDialog({
  vehicleId,
  open,
  onClose,
}: FlexfuelConversionDialogProps) {
  const { data: existing } = useFlexfuelConversion(vehicleId)
  const createConversion = useCreateFlexfuelConversion()
  const updateConversion = useUpdateFlexfuelConversion(vehicleId ?? 0)
  const deleteConversion = useDeleteFlexfuelConversion(vehicleId ?? 0)

  const isEdit = !!existing

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    values: isEdit
      ? {
          conversion_date: existing.conversion_date,
          kit_cost: existing.kit_cost,
          overconsumption_pct: existing.overconsumption_pct,
          kit_brand: existing.kit_brand ?? '',
          installer: existing.installer ?? '',
          notes: existing.notes ?? '',
          target_ethanol_pct: existing.target_ethanol_pct,
          ethanol_tolerance_pct: existing.ethanol_tolerance_pct,
        }
      : {
          conversion_date: new Date().toISOString().split('T')[0],
          kit_cost: '' as unknown as number,
          overconsumption_pct: 20,
          kit_brand: '',
          installer: '',
          notes: '',
          target_ethanol_pct: 77,
          ethanol_tolerance_pct: 5,
        },
  })

  const onSubmit = async (data: FormData) => {
    if (!vehicleId) return
    try {
      if (isEdit) {
        await updateConversion.mutateAsync({
          conversion_date: data.conversion_date,
          kit_cost: data.kit_cost,
          overconsumption_pct: data.overconsumption_pct,
          kit_brand: data.kit_brand || null,
          installer: data.installer || null,
          notes: data.notes || null,
          target_ethanol_pct: data.target_ethanol_pct,
          ethanol_tolerance_pct: data.ethanol_tolerance_pct,
        })
        toast.success('Conversion mise à jour')
      } else {
        await createConversion.mutateAsync({
          vehicle_id: vehicleId,
          conversion_date: data.conversion_date,
          kit_cost: data.kit_cost,
          overconsumption_pct: data.overconsumption_pct,
          kit_brand: data.kit_brand || null,
          installer: data.installer || null,
          notes: data.notes || null,
          target_ethanol_pct: data.target_ethanol_pct,
          ethanol_tolerance_pct: data.ethanol_tolerance_pct,
        })
        toast.success('Conversion FlexFuel enregistrée')
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer la conversion FlexFuel ?')) return
    try {
      await deleteConversion.mutateAsync()
      toast.success('Conversion supprimée')
      onClose()
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-emerald-600" />
            {isEdit ? 'Modifier la conversion E85' : 'Ajouter une conversion E85'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="conv-date">Date de conversion *</Label>
              <Input id="conv-date" type="date" {...form.register('conversion_date')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conv-cost">Coût du kit (&euro;) *</Label>
              <Input id="conv-cost" type="number" step="0.01" {...form.register('kit_cost')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="conv-overcons">Surconsommation E85 (%)</Label>
            <Input id="conv-overcons" type="number" step="0.1" {...form.register('overconsumption_pct')} />
            <p className="text-xs text-muted-foreground">Par défaut 20%. L'E85 consomme environ 20% de plus que l'E10.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="conv-ethanol-target">Taux éthanol cible (%)</Label>
              <Input id="conv-ethanol-target" type="number" step="0.1" min="0" max="100" {...form.register('target_ethanol_pct')} />
              <p className="text-xs text-muted-foreground">Ex: 77% = 5L E10 + 40L E85 dans un réservoir 45L.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="conv-ethanol-tol">Tolérance (%)</Label>
              <Input id="conv-ethanol-tol" type="number" step="0.5" min="0" max="20" {...form.register('ethanol_tolerance_pct')} />
              <p className="text-xs text-muted-foreground">Écart accepté autour de la cible (±%).</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="conv-brand">Marque du boîtier</Label>
              <Input id="conv-brand" {...form.register('kit_brand')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conv-installer">Installateur</Label>
              <Input id="conv-installer" {...form.register('installer')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="conv-notes">Notes</Label>
            <Textarea id="conv-notes" {...form.register('notes')} rows={2} />
          </div>

          <DialogFooter className="gap-2">
            {isEdit && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteConversion.isPending}
              >
                Supprimer
              </Button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={createConversion.isPending || updateConversion.isPending}
            >
              {isEdit ? 'Mettre à jour' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
