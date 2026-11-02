import { Car, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveModeConfig } from '@/lib/local/config'

interface ModeSetupProps {
  onDone: () => void
}

/**
 * First launch: welcome + one-page intro.
 * The app always starts in local mode (no server, no account) — server mode
 * is a hidden advanced option, unlocked in Settings (10 taps on the version).
 */
export function ModeSetup({ onDone }: ModeSetupProps) {
  const start = () => {
    saveModeConfig({ mode: 'local' })
    onDone()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <Car className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">VroomVroom</h1>
          <p className="text-sm text-muted-foreground">
            Suivi de carburant, E85 et maintenance — pensé pour la pompe.
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
            Vos données restent sur ce téléphone — aucune inscription, export
            CSV à tout moment.
          </div>
          <Button type="button" className="w-full" onClick={start}>
            C’est parti
          </Button>
        </div>
      </div>
    </div>
  )
}
