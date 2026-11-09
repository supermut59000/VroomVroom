import { useRef, useState } from 'react'
import {
  Server,
  Database,
  Loader2,
  CheckCircle2,
  XCircle,
  HeartHandshake,
  ChevronDown,
  ChevronUp,
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
import { loadModeConfig, saveModeConfig } from '@/lib/local/config'
import { normalizeServerUrl } from '@/lib/api'
import { startTutorial } from '@/lib/tutorial'

// Donation link (PayPal.Me) — the panel shows the link when set.
const DONATION_URL = 'https://paypal.me/wiwibaguette'
const APP_VERSION = '1.0.4'
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

  const testConnection = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const base = normalizeServerUrl(serverUrl)
      const res = await fetch(`${base}/vehicles/`, {
        headers: apiKey.trim() ? { 'X-API-Key': apiKey.trim() } : undefined,
      })
      if (res.status === 401 || res.status === 403) {
        setTestResult({ ok: false, msg: 'Clé API refusée (401/403)' })
      } else if (res.ok) {
        setTestResult({ ok: true, msg: 'Connexion réussie' })
      } else if (res.status === 404) {
        setTestResult({ ok: false, msg: '404 : API introuvable à cette URL (vérifie le domaine et le chemin /api/v1)' })
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

  const launchTutorial = () => {
    onClose()
    // L'overlay doit démarrer une fois les paramètres fermés.
    requestAnimationFrame(() => startTutorial())
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
              Faire un don
              {donateOpen ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
            </Button>
            {donateOpen && (
              <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                <p>L’app est gratuite. Pour soutenir le développement :</p>
                <p>
                  · 5 étoiles sur Google Play (le meilleur soutien)
                  <br />
                  · Partager l’app autour de vous
                </p>
                {DONATION_URL ? (
                  <>
                    <a
                      href={DONATION_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
                      style={{ background: 'linear-gradient(135deg, #003087 0%, #0070e0 55%, #009cde 100%)' }}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
                        <g fill="#ffffff">
                          <path opacity="0.55" transform="translate(-2,-2)" d="M8.9 6h4.2c1.9 0 3.2.5 3.9 1.5.6.8.8 1.9.5 3.2-.5 2.9-2.6 4.5-6 4.5H9.6L9 20H6.9L8.9 6z" />
                          <path d="M8.9 6h4.2c1.9 0 3.2.5 3.9 1.5.6.8.8 1.9.5 3.2-.5 2.9-2.6 4.5-6 4.5H9.6L9 20H6.9L8.9 6z" />
                        </g>
                      </svg>
                      Faire un don PayPal
                    </a>
                    <p className="text-center text-xs">paypal.me/wiwibaguette</p>
                  </>
                ) : (
                  <p>Don en ligne : lien bientôt disponible</p>
                )}
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
            <a
              href="https://supermut59000.github.io/VroomVroom/confidentialite.html"
              target="_blank"
              rel="noreferrer"
              className="block text-xs text-primary underline"
            >
              Politique de confidentialité
            </a>
          </section>

          {/* Tutoriel */}
          <section className="border-t pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={launchTutorial}>
              Tutoriel
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">
              Relance le guide pas à pas : enregistrer un plein à la station.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
