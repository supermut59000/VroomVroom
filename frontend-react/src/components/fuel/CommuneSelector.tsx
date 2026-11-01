import { useState, useRef, useCallback } from 'react'
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
  /** Called when the typed value exactly matches a datalist suggestion. */
  onSelect: (commune: Commune) => void
  placeholder?: string
  /** Datalist id — keep unique per mounted instance. */
  listId?: string
}

/** City search bar — native datalist over geo.api.gouv.fr (commune name or postal code).
 *  Same pattern as the station name autocomplete in FuelAddDialog.
 *  Extracted from StationPricesDialog so ColdAlertDialog reuses it. */
export function CommuneSelector({
  value,
  onChange,
  onSelect,
  placeholder,
  listId = 'commune-suggestions',
}: CommuneSelectorProps) {
  const [suggestions, setSuggestions] = useState<Commune[]>([])
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([])
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
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="relative flex items-center">
      <MapPin className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-8 pr-8"
        placeholder={placeholder ?? t.stations.cityPlaceholder}
        list={listId}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          // If the typed value exactly matches a datalist option, use those coords
          const match = suggestions.find((c) => communeLabel(c) === e.target.value)
          if (match) onSelect(match)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => fetchSuggestions(e.target.value), 300)
        }}
      />
      {loading && (
        <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      <datalist id={listId}>
        {suggestions.map((c) => (
          <option key={c.nom + (c.codesPostaux[0] ?? '')} value={communeLabel(c)} />
        ))}
      </datalist>
    </div>
  )
}
