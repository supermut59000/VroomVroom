import { useState } from 'react'
import { Car, Database } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateVehicle } from '@/hooks/use-vehicles'
import { FUEL_TYPES, FUEL_TYPE_LABELS } from '@/lib/constants'
import { saveModeConfig } from '@/lib/local/config'
import { setTutorialPending } from '@/lib/tutorial'
import type { FuelType } from '@/types'

interface ModeSetupProps {
  onDone: () => void
}

type Phase = 'welcome' | 'vehicle'

/**
 * Onboarding en 2 étapes :
 * 1. Bienvenue (une page, « C'est parti »)
 * 2. Création du véhicule (champs minimaux) — dès que c'est fait, l'app
 *    est directement utilisable, et le tutoriel à bulles démarre tout seul.
 * L'app part toujours en mode local (pas de serveur, pas de compte).
 */
export function ModeSetup({ onDone }: ModeSetupProps) {
  const [phase, setPhase] = useState<Phase>('welcome')
  const createVehicle = useCreateVehicle()

  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [fuelType, setFuelType] = useState<FuelType | ''>('essence')
  const [plate, setPlate] = useState('')
  const [odometer, setOdometer] = useState('')

  // Passer l'onboarding : l'app démarre en mode local, sans véhicule et
  // sans tutoriel (le guide reste relançable depuis les paramètres).
  const skip = () => {
    saveModeConfig({ mode: 'local' })
    onDone()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!brand.trim() || !model.trim() || !year || !fuelType || !plate.trim()) {
      toast.error('Remplis les champs obligatoires (*).')
      return
    }
    const yearNum = Number(year)
    if (!Number.isFinite(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
      toast.error('Année invalide.')
      return
    }
    // Le mode doit être en place AVANT la création : la couche api lit le
    // mode à chaque requête, et on est encore hors dashboard ici.
    saveModeConfig({ mode: 'local' })
    try {
      await createVehicle.mutateAsync({
        brand: brand.trim(),
        model: model.trim(),
        year: yearNum,
        fuel_type: fuelType,
        license_plate: plate.trim(),
        initial_odometer: odometer ? Number(odometer) : 0,
      })
      setTutorialPending()
      toast.success('Véhicule ajouté')
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible d’ajouter le véhicule.')
    }
  }

  if (phase === 'welcome') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-1 text-center">
            <Car className="mx-auto h-10 w-10 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">VroomVroom</h1>
            <p className="text-sm text-muted-foreground">
              Suivi de carburant, E85 et maintenance, pensé pour la pompe.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Comment ça marche</h2>
            <ul className="space-y-3 text-sm">
              <li className="flex gap-2">
                <span className="font-bold text-primary">1.</span>
                Ajoutez votre véhicule, puis chaque plein en 10 secondes
                (compteur, litres, prix).
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-primary">2.</span>
                Si votre voiture est convertie E85 : enregistrez la conversion
                pour débloquer l’écran « À la pompe », l’alerte froid et le
                suivi de rentabilité.
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-primary">3.</span>
                Besoin d’aide à tout moment ? Le guide complet est dans les
                paramètres (⚙️).
              </li>
            </ul>
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <Database className="h-4 w-4 shrink-0 text-primary" />
              Vos données restent sur ce téléphone : aucune inscription, export
              CSV à tout moment.
            </div>
            <Button type="button" className="w-full" onClick={() => setPhase('vehicle')}>
              C’est parti
            </Button>
            <button
              type="button"
              onClick={skip}
              className="w-full text-center text-xs text-muted-foreground underline"
            >
              Passer
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <Car className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Ajoute ton véhicule</h1>
          <p className="text-sm text-muted-foreground">
            Le minimum pour démarrer — tu complètes le reste plus tard.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ob-brand">Marque *</Label>
              <Input
                id="ob-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Renault"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-model">Modèle *</Label>
              <Input
                id="ob-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Clio"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ob-year">Année *</Label>
              <Input
                id="ob-year"
                type="number"
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2019"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-odometer">Compteur (km)</Label>
              <Input
                id="ob-odometer"
                type="number"
                inputMode="numeric"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder="45000"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Carburant *</Label>
            <Select value={fuelType} onValueChange={(v) => setFuelType(v as FuelType)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisis le carburant" />
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

          <div className="space-y-1.5">
            <Label htmlFor="ob-plate">Plaque *</Label>
            <Input
              id="ob-plate"
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="AB-123-CD"
              className="uppercase"
            />
          </div>

          <Button type="submit" className="w-full" disabled={createVehicle.isPending}>
            {createVehicle.isPending ? 'Ajout…' : 'Ajouter ma voiture'}
          </Button>
          <button
            type="button"
            onClick={skip}
            className="w-full text-center text-xs text-muted-foreground underline"
          >
            Passer pour plus tard
          </button>
        </form>

        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <Database className="h-4 w-4 shrink-0 text-primary" />
          Vos données restent sur ce téléphone : aucune inscription, export
          CSV à tout moment.
        </div>
      </div>
    </div>
  )
}
