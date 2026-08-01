/**
 * Ordering and "cheapest" logic for the station price list.
 *
 * Kept pure and separate from the dialog because both rules are easy to get
 * subtly wrong: favourites float to the top of every sort, so the first row is
 * NOT necessarily the cheapest one.
 */

export type StationSortMode = 'price' | 'distance' | 'time'

export interface StationSortKeys {
  isFavorite: boolean
  /** Price for the currently selected fuel, null when the station doesn't sell it */
  price: number | null
  /** Straight-line distance in metres */
  distanceM: number
  /** Driving time in seconds, null when routing is unavailable for this station */
  durationS: number | null
}

/**
 * The lowest price on offer, or null when there is nothing to compare.
 *
 * Returns null below two known prices: calling a lone station "the cheapest"
 * is noise, not information.
 */
export function cheapestPrice(stations: { price: number | null }[]): number | null {
  const known = stations
    .map((s) => s.price)
    .filter((p): p is number => p != null)
  if (known.length < 2) return null
  return Math.min(...known)
}

export function compareStations(
  a: StationSortKeys,
  b: StationSortKeys,
  mode: StationSortMode,
): number {
  // Favourites always float to the top, whatever the sort.
  if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1

  if (mode === 'price') {
    // Stations that don't sell this fuel sink rather than sorting as free.
    const pa = a.price ?? Infinity
    const pb = b.price ?? Infinity
    if (pa !== pb) return pa - pb
    return a.distanceM - b.distanceM
  }

  if (mode === 'time') {
    // Stations we couldn't route to sink rather than looking instant.
    const ta = a.durationS ?? Infinity
    const tb = b.durationS ?? Infinity
    if (ta !== tb) return ta - tb
    return a.distanceM - b.distanceM
  }

  return a.distanceM - b.distanceM
}
