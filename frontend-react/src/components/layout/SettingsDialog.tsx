import { useState } from 'react'
import { Server, Database, Loader2, CheckCircle2, XCircle } from 'lucide-react'
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

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

/** Data-mode settings: current mode, server URL/key (server mode), reset. */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [cfg] = useState(() => loadModeConfig())
  const [serverUrl, setServerUrl] = useState(cfg?.serverUrl ?? '')
  const [apiKey, setApiKey] = useState(cfg?.apiKey ?? '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  if (!cfg) return null

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
        msg: 'Connexion impossible (URL ou CORS — l’API doit autoriser ce navigateur)',
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {cfg.mode === 'local' ? (
              <Database className="h-5 w-5 text-primary" />
            ) : (
              <Server className="h-5 w-5 text-primary" />
            )}
            Mode des données
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {cfg.mode === 'local'
              ? 'Les données sont stockées sur ce téléphone (IndexedDB).'
              : `Connecté à : ${cfg.serverUrl}`}
          </p>

          {cfg.mode === 'server' && (
            <>
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
                  placeholder="laisser vide si inchangée / sans clé"
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
              <Button type="button" size="sm" onClick={saveServer}>
                Enregistrer
              </Button>
            </>
          )}

          <div className="border-t pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={resetMode}>
              Rechoisir le mode de démarrage
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">
              Le changement de mode ne fusionne pas les données.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
