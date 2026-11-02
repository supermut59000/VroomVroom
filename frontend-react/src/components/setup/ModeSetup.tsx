import { useState } from 'react'
import { Car, Server, Database, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveModeConfig } from '@/lib/local/config'

interface ModeSetupProps {
  onDone: () => void
}

/**
 * First launch: choose the data mode + a one-page intro.
 * Local is the default (no server, no account, data stays on the phone).
 * Server mode is the "advanced" option: paste API URL + key, test, done.
 */
export function ModeSetup({ onDone }: ModeSetupProps) {
  const [step, setStep] = useState<'mode' | 'intro'>('mode')
  const [serverOpen, setServerOpen] = useState(false)
  const [serverUrl, setServerUrl] = useState(
    'https://carmanagementapi.home.ouiouibaguette.fr/api/v1',
  )
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const chooseLocal = () => {
    saveModeConfig({ mode: 'local' })
    setStep('intro')
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const base = serverUrl.trim().replace(/\/$/, '')
      const res = await fetch(`${base}/vehicles/`, {
        headers: apiKey.trim() ? { 'X-API-Key': apiKey.trim() } : undefined,
      })
      if (res.status === 401 || res.status === 403) {
        setTestResult({ ok: false, msg: 'Clé API refusée (401/403)' })
      } else if (res.ok) {
        setTestResult({ ok: true, msg: 'Connexion réussie' })
      } else {
        setTestResult({ ok: false, msg: `Réponse inattendue (${res.status})` })
      }
    } catch {
      setTestResult({
        ok: false,
        msg: 'Connexion impossible — vérifiez l’URL et que l’API autorise ce navigateur (CORS : ajoutez https://localhost aux origines autorisées)',
      })
    } finally {
      setTesting(false)
    }
  }

  const chooseServer = () => {
    saveModeConfig({
      mode: 'server',
      serverUrl: serverUrl.trim().replace(/\/$/, ''),
      apiKey: apiKey.trim() || undefined,
    })
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

        {step === 'mode' ? (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Où sont stockées vos données ?</h2>

            {/* Local — default */}
            <button
              type="button"
              onClick={chooseLocal}
              className="w-full rounded-lg border-2 border-primary bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
            >
              <div className="flex items-center gap-2 font-medium">
                <Database className="h-5 w-5 text-primary" />
                Sur ce téléphone (recommandé)
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Aucune inscription, aucun serveur. Vos données restent dans l’app,
                exportables en CSV.
              </p>
            </button>

            {/* Server — advanced */}
            <div className="rounded-lg border p-4">
              <button
                type="button"
                onClick={() => setServerOpen((o) => !o)}
                className="flex w-full items-center justify-between text-left font-medium"
              >
                <span className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Mon propre serveur (avancé)
                </span>
                <span className="text-xs text-muted-foreground">
                  {serverOpen ? 'réduire' : 'déplier'}
                </span>
              </button>
              {serverOpen && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">URL de l’API</label>
                    <Input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Clé API (X-API-Key)</label>
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="facultatif si l’API est sans clé"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void testConnection()}
                      disabled={testing || !serverUrl.trim()}
                    >
                      {testing && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                      Tester la connexion
                    </Button>
                    {testResult && (
                      <span
                        className={`flex items-center gap-1 text-xs ${testResult.ok ? 'text-green-600' : 'text-destructive'}`}
                      >
                        {testResult.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {testResult.msg}
                      </span>
                    )}
                  </div>
                  <Button type="button" size="sm" className="w-full" onClick={chooseServer}>
                    Continuer avec mon serveur
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
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
                Vos données restent sur ce téléphone. Export CSV disponible
                à tout moment dans les détails du véhicule.
              </li>
            </ul>
            <Button type="button" className="w-full" onClick={onDone}>
              C’est parti
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
