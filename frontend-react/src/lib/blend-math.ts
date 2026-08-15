import type { FuelEntry } from '@/types'

// Pure blend/tank math for FlexFuel vehicles — no React, no DOM.
// Consumed by BlendCalculator and unit-tested in blend-math.test.ts.

// Conservative upper bounds: overestimating ethanol recommends more gasoline,
// never less. Winter-grade E85 is 60–75%; transition periods may still carry
// summer stock, so only the mandatory winter window uses 75%.
export function e85EthanolFraction(date: string | Date = new Date()): number {
  let month: number
  let day: number
  if (typeof date === 'string') {
    const parts = date.slice(0, 10).split('-').map(Number)
    month = parts[1]
    day = parts[2]
  } else {
    month = date.getMonth() + 1
    day = date.getDate()
  }

  const winter = month === 11 || month === 12 || month <= 2 ||
    (month === 3 && day <= 15) || (month === 10 && day === 31)
  return winter ? 0.75 : 0.85
}

export const ETHANOL_FRACTION: Record<string, number> = {
  essence: 0.10,
  sp98: 0.05,
  diesel: 0.0,
  gpl: 0.0,
  electrique: 0.0,
  hybride: 0.0,
}

export function fuelEthanolFraction(fuelType: string, date: string | Date): number {
  return fuelType === 'e85' ? e85EthanolFraction(date) : (ETHANOL_FRACTION[fuelType] ?? 0)
}

export const MIN_PUMP_LITERS = 5

export type DilutantType = 'e10' | 'sp98'

export interface TankState {
  litersInTank: number
  ethanolLiters: number
  lastOdo: number
}

export function computeAvgConsumption(entries: FuelEntry[], conversionDate: string): number | null {
  // Same sort as the backend fill-to-fill pipeline: Partiel before Plein at
  // the same stop so a booster folds into the closing full's segment.
  const sorted = [...entries]
    .filter((e) => e.fueling_date >= conversionDate)
    .sort((a, b) => {
      const d = a.fueling_date.localeCompare(b.fueling_date)
      if (d !== 0) return d
      const odo = a.odometer_reading - b.odometer_reading
      if (odo !== 0) return odo
      const full = Number(a.is_full_tank) - Number(b.is_full_tank)
      if (full !== 0) return full
      return a.id - b.id
    })

  // Distance-weighted (Σ liters × 100 / Σ km), anchored at the first full tank
  let prevFullOdo: number | null = null
  let accLiters = 0
  let sumLiters = 0
  let sumKm = 0

  for (const e of sorted) {
    if (prevFullOdo === null) {
      if (e.is_full_tank) prevFullOdo = e.odometer_reading
      continue
    }
    accLiters += e.liters
    if (e.is_full_tank) {
      const dist = e.odometer_reading - prevFullOdo
      if (dist > 0) {
        sumLiters += accLiters
        sumKm += dist
      }
      prevFullOdo = e.odometer_reading
      accLiters = 0
    }
  }

  return sumKm > 0 ? (sumLiters * 100) / sumKm : null
}

export function computeTankState(
  entries: FuelEntry[],
  conversionDate: string,
  tankCapacity: number,
): TankState {
  const sorted = [...entries]
    .filter((e) => e.fueling_date >= conversionDate)
    .sort((a, b) => {
      const d = a.fueling_date.localeCompare(b.fueling_date)
      if (d !== 0) return d
      const odo = a.odometer_reading - b.odometer_reading
      if (odo !== 0) return odo
      return a.id - b.id
    })

  if (sorted.length === 0) {
    return { litersInTank: 0, ethanolLiters: 0, lastOdo: 0 }
  }

  // Exact fill-to-fill method (mirrors EthanolHistoryChart).
  // Entries sharing (date, odometer) are one stop. Between two "Plein" stops,
  // the sum of liters added equals fuel burned — no avgL100km estimation.
  let ethFraction: number | null = null
  let lastFullOdo: number | null = null
  let accLiters = 0
  let accEthLiters = 0
  let lastSeenOdo = sorted[0].odometer_reading

  let i = 0
  while (i < sorted.length) {
    const stopDate = sorted[i].fueling_date
    const stopOdo = sorted[i].odometer_reading
    let stopIsFull = false

    while (
      i < sorted.length &&
      sorted[i].fueling_date === stopDate &&
      sorted[i].odometer_reading === stopOdo
    ) {
      const e = sorted[i]
      const fillEthFraction = fuelEthanolFraction(e.fuel_type, e.fueling_date)
      accLiters += e.liters
      accEthLiters += e.liters * fillEthFraction
      if (e.is_full_tank) stopIsFull = true
      i++
    }
    lastSeenOdo = stopOdo

    if (stopIsFull) {
      if (ethFraction === null) {
        ethFraction = accLiters > 0 ? accEthLiters / accLiters : 0
      } else if (accLiters >= tankCapacity) {
        ethFraction = accEthLiters / accLiters
      } else {
        const remainingOldFuel = tankCapacity - accLiters
        const totalEth = ethFraction * remainingOldFuel + accEthLiters
        ethFraction = Math.min(totalEth / tankCapacity, 1)
      }
      lastFullOdo = stopOdo
      accLiters = 0
      accEthLiters = 0
    }
  }

  // No full fill yet since conversion: fall back to whatever has been pumped.
  if (ethFraction === null) {
    if (accLiters > 0) {
      return { litersInTank: accLiters, ethanolLiters: accEthLiters, lastOdo: lastSeenOdo }
    }
    return { litersInTank: 0, ethanolLiters: 0, lastOdo: 0 }
  }

  // Return state at last full. Trailing partials (post-last-full) are absorbed
  // by the next full fill; in the rare case the user just added a lone partial,
  // they should record an E85 fill to refresh the state.
  return {
    litersInTank: tankCapacity,
    ethanolLiters: ethFraction * tankCapacity,
    lastOdo: lastFullOdo ?? lastSeenOdo,
  }
}

// ─── Reference thresholds ──────────────────────────────────────────────────
// Two km landmarks computed from the current tank state:
//
// odoA — last km at which a FULL E85 fill would still land ≤ targetMax.
// odoB — first km at which an OPTIMAL blend (min-pump dilutant → exact target)
//   becomes feasible. Both use today's conservative seasonal E85 fraction.

export interface Thresholds {
  odoA: number | null  // null = already past or no deadline
  odoB: number | null  // null = now or unnecessary
  odoBNow: boolean
  pureE85AlwaysSafe: boolean
}

export function computeThresholds(
  remaining: number,
  ethFraction: number,
  tankCapacity: number,
  targetPct: number,
  tolerancePct: number,
  dilutantEthFraction: number,
  avgL100km: number,
  fromOdo: number,
  e85EthFraction: number = 0.85,
): Thresholds {
  const eps = 0.001
  const targetMax = (targetPct + tolerancePct) / 100
  const target = targetPct / 100

  if (e85EthFraction <= targetMax) {
    return { odoA: null, odoB: null, odoBNow: false, pureE85AlwaysSafe: true }
  }
  if (avgL100km <= 0 || Math.abs(ethFraction - e85EthFraction) < eps) {
    return { odoA: null, odoB: null, odoBNow: true, pureE85AlwaysSafe: false }
  }

  // Threshold A: last km for pure E85 fill ≤ targetMax
  const rA = (tankCapacity * (targetMax - e85EthFraction)) / (ethFraction - e85EthFraction)
  const odoA =
    rA >= 0 && remaining > rA
      ? Math.round(fromOdo + ((remaining - rA) * 100) / avgL100km)
      : null

  // Threshold B: first km where blend with exactly MIN_PUMP_LITERS dilutant → exact target
  const denomB = e85EthFraction - ethFraction
  let odoB: number | null = null
  let odoBNow = false
  if (denomB > eps) {
    const rB =
      (MIN_PUMP_LITERS * (dilutantEthFraction - e85EthFraction) - tankCapacity * (target - e85EthFraction)) / denomB
    if (rB <= 0 || remaining <= rB) {
      odoBNow = true
    } else {
      odoB = Math.round(fromOdo + ((remaining - rB) * 100) / avgL100km)
    }
  } else {
    odoBNow = true
  }

  return { odoA, odoB, odoBNow, pureE85AlwaysSafe: false }
}

// ─── Winter smart recommendation ───────────────────────────────────────────

export type WinterRec =
  | { type: 'tank_full'; currentPct: number }
  | {
      type: 'pure_e85'
      e85Liters: number
      resultPct: number
      kmSafe: number | null
      kmRelative: number | null
    }
  | { type: 'blend'; dilutantLiters: number; e85Liters: number; resultPct: number; withinTolerance: boolean }

export function computeWinterRec(
  remainingLiters: number,
  ethanolLiters: number,
  tankCapacity: number,
  targetPct: number,
  tolerancePct: number,
  dilutantEthFraction: number,
  avgL100km: number,
  currentOdo: number,
  e85EthFraction: number = 0.85,
): WinterRec {
  const ethFraction = remainingLiters > 0 ? ethanolLiters / remainingLiters : 0
  const currentPct = ethFraction * 100
  const targetMax = (targetPct + tolerancePct) / 100
  const target = targetPct / 100
  const toAdd = tankCapacity - remainingLiters

  if (toAdd < MIN_PUMP_LITERS) {
    return { type: 'tank_full', currentPct }
  }

  // Pure E85 keeps ethanol within targetMax
  const afterE85Pct = (ethanolLiters + toAdd * e85EthFraction) / tankCapacity
  if (afterE85Pct <= targetMax) {
    let kmSafe: number | null = null
    let kmRelative: number | null = null
    const f = afterE85Pct
    if (f < e85EthFraction - 0.001) {
      const rSafe = (tankCapacity * (targetMax - e85EthFraction)) / (f - e85EthFraction)
      if (rSafe >= 0 && rSafe < tankCapacity) {
        const dist = ((tankCapacity - rSafe) * 100) / avgL100km
        kmSafe = Math.round(currentOdo + dist)
        kmRelative = Math.round(dist)
      }
    }
    return {
      type: 'pure_e85',
      e85Liters: Math.round(toAdd * 10) / 10,
      resultPct: afterE85Pct * 100,
      kmSafe,
      kmRelative,
    }
  }

  // Blend needed
  const numerator = target * (remainingLiters + toAdd) - ethanolLiters - e85EthFraction * toAdd
  const denominator = dilutantEthFraction - e85EthFraction
  const xIdeal = numerator / denominator

  let x: number
  if (xIdeal <= 0) {
    x = 0
  } else if (xIdeal < MIN_PUMP_LITERS) {
    x = MIN_PUMP_LITERS
  } else {
    x = Math.round(xIdeal * 10) / 10
    if (x < MIN_PUMP_LITERS) x = MIN_PUMP_LITERS
  }

  if (x > 0 && toAdd - x < MIN_PUMP_LITERS) {
    x = Math.ceil((toAdd - MIN_PUMP_LITERS) * 10) / 10
    if (x < MIN_PUMP_LITERS) x = 0
  }

  if (x === 0) {
    return {
      type: 'pure_e85',
      e85Liters: Math.round(toAdd * 10) / 10,
      resultPct: afterE85Pct * 100,
      kmSafe: null,
      kmRelative: null,
    }
  }

  const e85 = Math.round((toAdd - x) * 10) / 10
  const resultEthanol = ethanolLiters + x * dilutantEthFraction + e85 * e85EthFraction
  const resultTotal = remainingLiters + x + e85
  const resultPct = resultTotal > 0 ? (resultEthanol / resultTotal) * 100 : 0
  const withinTolerance =
    resultPct <= targetPct + tolerancePct && resultPct >= targetPct - tolerancePct

  return { type: 'blend', dilutantLiters: x, e85Liters: e85, resultPct, withinTolerance }
}

// ─── Future fills simulation ───────────────────────────────────────────────

export interface FutureFill {
  fillNum: number
  odo: number
  intervalKm: number
  dilutantLiters: number
  e85Liters: number
  resultPct: number
  type: 'blend' | 'pure_e85'
  withinTolerance: boolean
}

export function simulateFutureFills(
  startRemaining: number,
  startEthanol: number,
  fromOdo: number,
  intervals: number[],
  tankCapacity: number,
  avgL100km: number,
  targetPct: number,
  tolerancePct: number,
  dilutantEthFraction: number,
  e85EthFraction: number = 0.85,
): FutureFill[] {
  const fills: FutureFill[] = []
  let rem = startRemaining
  let eth = startEthanol
  let odoCursor = fromOdo

  for (let i = 0; i < intervals.length; i++) {
    const intervalKm = intervals[i]
    const consumed = (intervalKm * avgL100km) / 100
    const remAfter = Math.max(0, rem - consumed)
    const ethAfter = rem > 0 ? eth * (remAfter / rem) : 0
    odoCursor += intervalKm
    const odo = odoCursor

    const rec = computeWinterRec(
      remAfter, ethAfter, tankCapacity, targetPct, tolerancePct,
      dilutantEthFraction, avgL100km, odo, e85EthFraction,
    )

    let dilLiters: number, e85Liters: number, resultPct: number, type: FutureFill['type']
    if (rec.type === 'pure_e85') {
      dilLiters = 0; e85Liters = rec.e85Liters; resultPct = rec.resultPct; type = 'pure_e85'
    } else if (rec.type === 'blend') {
      dilLiters = rec.dilutantLiters; e85Liters = rec.e85Liters; resultPct = rec.resultPct; type = 'blend'
    } else {
      dilLiters = 0; e85Liters = 0
      resultPct = remAfter > 0 ? (ethAfter / remAfter) * 100 : 0
      type = 'pure_e85'
    }

    fills.push({
      fillNum: i + 1, odo, intervalKm, dilutantLiters: dilLiters, e85Liters,
      resultPct, type,
      withinTolerance: resultPct >= targetPct - tolerancePct && resultPct <= targetPct + tolerancePct,
    })

    rem = Math.min(remAfter + dilLiters + e85Liters, tankCapacity)
    eth = Math.min(ethAfter + dilLiters * dilutantEthFraction + e85Liters * e85EthFraction, tankCapacity)
  }

  return fills
}
