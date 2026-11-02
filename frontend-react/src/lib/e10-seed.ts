// First launch (local mode): record a base E10 price so the E85 rentability
// has a reference from day one (savings are computed against the E10 price of
// the fill date). Reference = cheapest E10 price of a Paris station, same
// data.economie.gouv.fr dataset as the station search.
import { loadModeConfig } from './local/config'
import { listE10Prices, createE10Price } from './local/services'

const SEED_KEY = 'vv_e10_seed_done'
const PARIS = { lat: 48.8566, lon: 2.3522 }
const API =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records'

/** Seeds one base E10 price on first launch. Returns true when it seeded. */
export async function seedE10BasePriceIfNeeded(): Promise<boolean> {
  if (loadModeConfig()?.mode !== 'local') return false
  if (localStorage.getItem(SEED_KEY)) return false
  if ((await listE10Prices()).length > 0) return false
  try {
    const params = new URLSearchParams({
      where: `within_distance(geom, geom'POINT(${PARIS.lon} ${PARIS.lat})', 5km)`,
      select: 'e10_prix,adresse',
      limit: '100',
    })
    const res = await fetch(`${API}?${params}`)
    if (!res.ok) return false
    const data = (await res.json()) as { results?: { e10_prix: unknown }[] }
    const prices = (data.results ?? [])
      .map((r) => Number(r.e10_prix))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (prices.length === 0) return false
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    await createE10Price({
      reference_date: date,
      price_per_liter: Math.min(...prices),
      notes: 'Prix de base (première ouverture) : Paris, prix le plus bas du jour',
    })
    localStorage.setItem(SEED_KEY, '1')
    return true
  } catch {
    return false // offline or API down: retried on next launch
  }
}
