import { useRef, useState } from 'react'
import {
  Server,
  Database,
  Loader2,
  CheckCircle2,
  XCircle,
  HeartHandshake,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  loadModeConfig,
  saveModeConfig,
  clearModeConfig,
} from '@/lib/local/config'

// Donation link (Google Play in-app billing or PayPal/Ko-fi) — fill in when
// the donation option is actually live; the panel then shows the link.
const DONATION_URL = ''
const APP_VERSION = '1.0.0'
const UNLOCK_KEY = 'vv_server_unlocked'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

const GUIDE: { title: string; text: string }[] = [
  {
    title: 'Véhicules',
    text: 'Le bouton + en haut à droite ajoute une voiture : compteur initial et capacité du réservoir servent aux calculs.',
  },
  {
    title: 'Pleins',
    text: 'Le bouton flottant en bas à droite : compteur, litres, prix. La conso L/100 se calcule automatiquement (méthode plein-à-plein).',
  },
  {
    title: 'E85',
    text: 'Dans les détails du véhicule, enregistrez la conversion (coût du kit, date) pour débloquer « À la pompe », l’alerte froid et la rentabilité.',
  },
  {
    title: 'À la pompe',
    text: 'Bouton vert gouttelettes sur la carte d’un véhicule converti : le mélange E10/E85 recommandé est déduit de votre dernier plein, les deux entrées sont enregistrées d’un coup.',
  },
  {
    title: 'Stations',
    text: 'Icône pompe en haut : prix officiels autour de vous, filtre « Avec E85 », recherche par ville.',
  },
  {
    title: 'Export',
    text: 'Dans les détails du véhicule : export CSV de tous vos pleins. Pensez-y pour sauvegarder vos données locales.',
  },
]

/** Settings: data mode, app guide, support/donation, about.
 * Server mode is hidden until unlocked (10 rapid taps on the version line). */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [cfg] = useState(() => loadModeConfig())
  const [unlocked, setUnlocked] = useState(
    () => cfg?.mode === 'server' || localStorage.getItem(UNLOCK_KEY) === '1',
  )
  const [guideOpen, setGuideOpen] = useState(false)
  const [donateOpen, setDonateOpen] = useState(false)
  const taps = useRef(0)
  const tapTimer = useRef<number | null>(null)

  const [serverUrl, setServerUrl] = useState(cfg?.serverUrl ?? '')
  const [apiKey, setApiKey] = useState(cfg?.apiKey ?? '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  if (!cfg) return null

  const onVersionTap = () => {
    taps.current += 1
    if (tapTimer.current) window.clearTimeout(tapTimer.current)
    tapTimer.current = window.setTimeout(() => {
      taps.current = 0
    }, 1500)
    if (taps.current >= 10) {
      taps.current = 0
      setUnlocked(true)
      localStorage.setItem(UNLOCK_KEY, '1')
      toast.success('Mode serveur déverrouillé')
    }
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
        msg: 'Connexion impossible (URL ou CORS, l’API doit autoriser ce navigateur)',
      })
    } finally {
      setTesting(false)
    }
  }

  const saveServer = () => {
    if (!serverUrl.trim()) {
      toast.error('Renseignez l’URL de l’API')
      return
    }
    saveModeConfig({
      mode: 'server',
      serverUrl: serverUrl.trim().replace(/\/$/, ''),
      apiKey: apiKey.trim() || undefined,
    })
    toast.success('Réglages enregistrés')
    // Full reload: the transport is re-selected and all queries refetch.
    window.location.reload()
  }

  const resetMode = () => {
    clearModeConfig()
    window.location.reload()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Paramètres</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Data mode */}
          <section>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              {cfg.mode === 'local' ? (
                <Database className="h-4 w-4 text-primary" />
              ) : (
                <Server className="h-4 w-4 text-primary" />
              )}
              Mode des données
            </h3>
            <p className="text-sm text-muted-foreground">
              {cfg.mode === 'local'
                ? 'Les données sont stockées sur ce téléphone (IndexedDB).'
                : `Connecté à : ${cfg.serverUrl}`}
            </p>

            {unlocked && (
              <div className="mt-2 space-y-2 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Serveur (avancé)
                </p>
                <div className="space-y-1">
                  <label className="text-sm font-medium">URL de l’API</label>
                  <Input
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="https://…/api/v1"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Clé API (X-API-Key)</label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="laisser vide si sans clé"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void testConnection()}
                    disabled={testing || !serverUrl.trim()}
                  >
                    {testing && (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    )}
                    Tester la connexion
                  </Button>
                  {testResult && (
                    <span
                      className={`flex items-center gap-1 text-xs ${
                        testResult.ok ? 'text-green-600' : 'text-destructive'
                      }`}
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
                <Button type="button" size="sm" onClick={saveServer}>
                  Passer en mode serveur
                </Button>
              </div>
            )}
          </section>

          {/* Guide */}
          <section className="border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => setGuideOpen((o) => !o)}
            >
              {guideOpen ? '▲' : '▼'} Guide de l’app
            </Button>
            {guideOpen && (
              <ul className="mt-2 space-y-2">
                {GUIDE.map((item) => (
                  <li key={item.title} className="text-sm">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-muted-foreground"> : {item.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Support / donation */}
          <section className="border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => setDonateOpen((o) => !o)}
            >
              <HeartHandshake className="mr-1 h-4 w-4" />
              {donateOpen ? '▲' : '▼'} Faire un don
            </Button>
            {donateOpen && (
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <p>L’app est gratuite. Pour soutenir le développement :</p>
                <p>
                  · 5 étoiles sur Google Play (le meilleur soutien)
                  <br />
                  · Partager l’app autour de vous
                  <br />
                  · {DONATION_URL ? (
                    <a href={DONATION_URL} target="_blank" rel="noreferrer" className="text-primary underline">
                      Faire un don
                    </a>
                  ) : (
                    'Don en ligne : lien bientôt disponible'
                  )}
                </p>
              </div>
            )}
          </section>

          {/* About */}
          <section className="border-t pt-3">
            <p className="text-sm">VroomVroom : suivi de carburant et E85</p>
            <button
              type="button"
              onClick={onVersionTap}
              className="text-xs text-muted-foreground"
              aria-label="Version de l’application"
            >
              Version {APP_VERSION}
            </button>
          </section>

          {/* Reset */}
          <section className="border-t pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={resetMode}>
              Rechoisir le mode de démarrage
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">
              Le changement de mode ne fusionne pas les données.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
