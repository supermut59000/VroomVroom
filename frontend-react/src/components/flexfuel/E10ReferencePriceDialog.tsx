import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2, DollarSign } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  useE10ReferencePrices,
  useCreateE10ReferencePrice,
  useDeleteE10ReferencePrice,
} from '@/hooks/use-flexfuel'

interface E10ReferencePriceDialogProps {
  open: boolean
  onClose: () => void
}

export function E10ReferencePriceDialog({
  open,
  onClose,
}: E10ReferencePriceDialogProps) {
  const { data: prices } = useE10ReferencePrices()
  const createPrice = useCreateE10ReferencePrice()
  const deletePrice = useDeleteE10ReferencePrice()

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [price, setPrice] = useState('')

  const handleAdd = async () => {
    if (!date || !price) return
    const priceNum = parseFloat(price)
    if (isNaN(priceNum) || priceNum <= 0) {
      toast.error('Prix invalide')
      return
    }
    try {
      await createPrice.mutateAsync({
        reference_date: date,
        price_per_liter: priceNum,
      })
      toast.success('Prix E10 enregistré')
      setPrice('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deletePrice.mutateAsync(id)
      toast.success('Prix supprimé')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Prix de référence E10
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Enregistrez le prix E10 observé pour calculer vos économies E85.
          </p>
        </DialogHeader>

        {/* Add form */}
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Prix/L (&euro;)</Label>
            <Input
              type="number"
              step="0.001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="1.659"
              className="h-9"
            />
          </div>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={createPrice.isPending || !price}
          >
            Ajouter
          </Button>
        </div>

        <Separator />

        {/* Price list */}
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {(!prices || prices.length === 0) && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aucun prix enregistré
            </p>
          )}
          {prices?.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50"
            >
              <span className="text-sm">
                {new Date(p.reference_date).toLocaleDateString('fr-FR')}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {p.price_per_liter.toFixed(3)} &euro;/L
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(p.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
