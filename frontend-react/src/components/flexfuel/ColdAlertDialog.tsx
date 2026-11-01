import { useState } from 'react'
import { Snowflake, Loader2 } from 'lucide-react'
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
import { CommuneSelector } from '@/components/fuel/CommuneSelector'
import { t } from '@/lib/i18n'
import {
  loadColdAlert,
  saveColdAlert,
  fetchOpenMeteo,
  nextOccurrence,
  tempAtTime,
  coldAdvice,
} from '@/lib/cold-alert'
import type { ColdAlertConfig, ColdAdvice } from '@/lib/cold-alert'
import { requestNotificationPermission } from '@/lib/notify'

interface ColdAlertDialogProps {
  open: boolean
  onClose: () => void
}

export function ColdAlertDialog({ open, onClose }: ColdAlertDialogProps) {
  const [cfg, setCfg] = useState<ColdAlertConfig>(() => loadColdAlert())
  const [cityInput, setCityInput] = useState('')
  const [testResult, setTestResult] = useState<ColdAdvice | null>(null)
  const [testing, setTesting] = useState(false)

  const runTest = async () => {
    if (!cfg.city) {
      toast.error(t.coldAlert.needsCity)
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const forecast = await fetchOpenMeteo(cfg.city.lat, cfg.city.lon)
      const occurrence = nextOccurrence(cfg.time)
      const temp = tempAtTime(forecast, occurrence)
      setTestResult(coldAdvice(temp, cfg, cfg.city.name))
    } catch {
      setTestResult({ level: 'unknown', message: 'Prévision indisponible' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (cfg.enabled && !cfg.city) {
      toast.error(t.coldAlert.needsCity)
      return
    }
    saveColdAlert(cfg)
    if (cfg.enabled) {
      const granted = await requestNotificationPermission()
      if (!granted) toast.info(t.coldAlert.notificationDenied)
    }
    toast.success(t.coldAlert.saved)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-blue-500" />
            {t.coldAlert.title}
          </DialogTitle>
          <p className="-mt-2 mb-1 text-xs text-muted-foreground">{t.coldAlert.subtitle}</p>
        </DialogHeader>

        <div className="space-y-4">
          <Button
            type="button"
            variant={cfg.enabled ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setCfg((c) => ({ ...c, enabled: !c.enabled }))}
            aria-pressed={cfg.enabled}
          >
            {t.coldAlert.enable}
          </Button>

          <div className="space-y-1">
            <span className="text-sm font-medium">{t.coldAlert.city}</span>
            <CommuneSelector
              value={cityInput}
              onChange={setCityInput}
              onSelect={(c) => {
                const [lon, lat] = c.centre.coordinates
                setCityInput(`${c.nom} (${c.codesPostaux[0] ?? ''})`)
                setCfg((prev) => ({
                  ...prev,
                  city: { name: c.nom, cp: c.codesPostaux[0] ?? '', lat, lon },
                }))
              }}
            />
            {cfg.city && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {cfg.city.name} ({cfg.city.cp})
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-sm font-medium">{t.coldAlert.time}</span>
              <Input
                type="time"
                value={cfg.time}
                onChange={(e) => setCfg((c) => ({ ...c, time: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium">{t.coldAlert.threshold}</span>
              <Input
                type="number"
                min={-20}
                max={15}
                step={1}
                value={cfg.thresholdC}
                onChange={(e) =>
                  setCfg((c) => ({ ...c, thresholdC: Number(e.target.value) }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void runTest()}
              disabled={testing}
            >
              {testing && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {t.coldAlert.testNow}
            </Button>
            {testResult && (
              <p
                className={`text-xs ${
                  testResult.level === 'cold'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-muted-foreground'
                }`}
              >
                {testResult.message}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">{t.coldAlert.limitation}</p>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => void handleSave()}>
            {t.coldAlert.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
