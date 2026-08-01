import { describe, it, expect } from 'vitest'
import { cheapestPrice, compareStations } from './station-sort'
import type { StationSortKeys, StationSortMode } from './station-sort'

function station(partial: Partial<StationSortKeys>): StationSortKeys {
  return {
    isFavorite: false,
    price: 1.7,
    distanceM: 1000,
    durationS: 300,
    ...partial,
  }
}

const sort = (list: StationSortKeys[], mode: StationSortMode) =>
  [...list].sort((a, b) => compareStations(a, b, mode))

describe('cheapestPrice', () => {
  it('is the lowest price, not the first row', () => {
    // The regression: a favourite sorts first but costs more. Reading the
    // cheapest off row 0 would answer 1.899.
    const expensiveFavourite = station({ isFavorite: true, price: 1.899 })
    const cheap = station({ price: 1.689 })

    const ordered = sort([cheap, expensiveFavourite], 'price')

    expect(ordered[0]).toBe(expensiveFavourite)
    expect(cheapestPrice([expensiveFavourite, cheap])).toBe(1.689)
    expect(ordered[0].price).not.toBe(cheapestPrice(ordered))
  })

  it('ignores stations that do not sell the fuel', () => {
    expect(
      cheapestPrice([station({ price: null }), station({ price: 1.8 }), station({ price: 1.75 })]),
    ).toBe(1.75)
  })

  it('is null below two known prices — a lone station is not "the cheapest"', () => {
    expect(cheapestPrice([station({ price: 1.7 })])).toBeNull()
    expect(cheapestPrice([station({ price: 1.7 }), station({ price: null })])).toBeNull()
    expect(cheapestPrice([])).toBeNull()
  })

  it('returns the shared value on a tie, so both stations can be flagged', () => {
    expect(cheapestPrice([station({ price: 1.689 }), station({ price: 1.689 })])).toBe(1.689)
  })
})

describe('compareStations', () => {
  it('floats favourites to the top in every mode', () => {
    const fav = station({ isFavorite: true, price: 2.1, distanceM: 9000, durationS: 3600 })
    const other = station({ price: 1.5, distanceM: 100, durationS: 60 })

    for (const mode of ['price', 'distance', 'time'] as StationSortMode[]) {
      expect(sort([other, fav], mode)[0]).toBe(fav)
    }
  })

  it('sorts by driving time, not by straight-line distance', () => {
    // The mountain case: nearer as the crow flies, an hour away by road.
    const mountain = station({ distanceM: 19000, durationS: 3781 })
    const valley = station({ distanceM: 21000, durationS: 2932 })

    expect(sort([mountain, valley], 'time')).toEqual([valley, mountain])
    expect(sort([valley, mountain], 'distance')).toEqual([mountain, valley])
  })

  it('sinks unroutable stations in time mode instead of treating them as instant', () => {
    const unroutable = station({ durationS: null, distanceM: 100 })
    const far = station({ durationS: 3600, distanceM: 40000 })

    expect(sort([unroutable, far], 'time')).toEqual([far, unroutable])
  })

  it('breaks time ties on distance', () => {
    const near = station({ durationS: 600, distanceM: 4000 })
    const far = station({ durationS: 600, distanceM: 8000 })

    expect(sort([far, near], 'time')).toEqual([near, far])
  })

  it('sinks stations without a price in price mode instead of treating them as free', () => {
    const noPrice = station({ price: null })
    const priced = station({ price: 1.9 })

    expect(sort([noPrice, priced], 'price')).toEqual([priced, noPrice])
  })
})
