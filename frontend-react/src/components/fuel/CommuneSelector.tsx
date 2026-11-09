import { useState, useRef, useCallback, useEffect } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { t } from '@/lib/i18n'

export interface Commune {
  nom: string
  codesPostaux: string[]
  centre: { type: string; coordinates: [number, number] } // [lon, lat]
}

export function communeLabel(c: Commune): string {
  const cp = c.codesPostaux[0] ?? ''
  return cp ? `${c.nom} (${cp})` : c.nom
}

const GEO_API = 'https://geo.api.gouv.fr/communes'

interface CommuneSelectorProps {
  value: string
  onChange: (value: string) => void
  /** Called when a suggestion is picked (or the typed value matches one exactly). */
  onSelect: (commune: Commune) => void
  placeholder?: string
  /** Conservé pour compatibilité d'appel (l'ancienne datalist en avait besoin). */
  listId?: string
}

/** City search bar — custom themed dropdown over geo.api.gouv.fr (commune name
 *  or postal code).
 *
 *  Previously a native <datalist>: its popup is drawn by the WebView and cannot
 *  be styled, so it showed up white (with rendering artifacts) on top of the
 *  dark theme. This renders its own list with theme tokens instead. */
export function CommuneSelector({
  value,
  onChange,
  onSelect,
  placeholder,
}: CommuneSelectorProps) {
  const [suggestions, setSuggestions] = useState<Commune[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }
    setLoading(true)
    try {
      const isPostal = /^\d+$/.test(q)
      const params = new URLSearchParams()
      if (isPostal) {
        params.set('codePostal', q)
      } else {
        params.set('nom', q)
        params.set('boost', 'population')
      }
      params.set('fields', 'nom,codesPostaux,centre')
      params.set('limit', '8')
      const res = await window.fetch(`${GEO_API}?${params}`)
      if (!res.ok) throw new Error()
      const data: Commune[] = await res.json()
      setSuggestions(data)
      setOpen(data.length > 0)
    } catch {
      setSuggestions([])
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fermeture au toucher en dehors de la liste.
  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: PointerEvent) => {
      const root = rootRef.current
      if (root && !root.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [open])

  const pick = (c: Commune) => {
    const label = communeLabel(c)
    onChange(label)
    onSelect(c)
    setOpen(false)
    setSuggestions([])
  }

  return (
    <div ref={rootRef} className="relative flex items-center">
      <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-8 pr-8"
        placeholder={placeholder ?? t.stations.cityPlaceholder}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value
          onChange(v)
          // Valeur tapée identique à une suggestion : on prend ses coordonnées
          // et on referme la liste (elle n'apporte plus rien).
          const match = suggestions.find((c) => communeLabel(c) === v)
          if (match) {
            onSelect(match)
            setOpen(false)
          }
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => fetchSuggestions(v), 300)
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true)
        }}
      />
      {loading && (
        <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {suggestions.map((c) => (
            <li key={c.nom + (c.codesPostaux[0] ?? '')}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground active:bg-accent"
                // pointerdown : fiable sur Android (le blur de l'input ne mange
                // pas le tap) et évite la fermeture avant le clic.
                onPointerDown={(e) => {
                  e.preventDefault()
                  pick(c)
                }}
              >
                {communeLabel(c)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
