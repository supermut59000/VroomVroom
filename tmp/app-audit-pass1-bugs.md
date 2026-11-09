# App Audit — Pass 1: Logic & Math Bugs (VroomVroom)

**Date:** 2026-08-21 — **Scope:** `/app-audit bugs` (Phase 1 checklist only, report-only, nothing fixed)
**Files read in full:** `backend/app/services/vehicle_service.py`, `fuel_service.py`, `flexfuel_service.py`, `maintenance_service.py`, `backend/app/utils/calculations.py`, `backend/app/schemas/{vehicle,fuel_entry}.py`, `backend/app/api/v1/endpoints/{vehicles,fuel_entries}.py`; `frontend-react/src/components/charts/{MonthlyCostChart,ConsumptionChart,EthanolHistoryChart,DistanceChart,RefuelingPatternChart,OdometerChart,FlexfuelRentabilityChart,PriceChart}.tsx`, `frontend-react/src/components/flexfuel/BlendCalculator.tsx`, `frontend-react/src/components/fuel/{FuelCharts,FuelViewDialog}.tsx`, `frontend-react/src/components/vehicles/{VehicleDetailsDialog,CostOfOwnershipSection}.tsx`, `frontend-react/src/lib/{blend-math,vehicle-stats,station-sort,csv,utils}.ts`, `frontend-react/src/types/index.ts`.
**Decision ledger consulted:** `CONTEXT.md` session logs (2026-03-30 → 2026-08-15), git log, `docs/gap-analysis.md`. Rejected/decided items (route/toll optimizer, per-fill ethanol input, odometer-reset epochs, dev compose creds, seasonal ethanol rates, first-full anchoring, `(date, odo, is_full_tank, id)` tiebreaker) are treated as decisions, not findings.

## Verdict

The fill-to-fill consumption pipeline (backend `fuel_service`/`vehicle_service` + frontend `blend-math`/`EthanolHistoryChart`) is internally consistent and well-hardened after the May/July 2026 audits; the remaining defects are **twin-implementation drift in the monthly-km helpers, silent 50 L tank assumptions, and several unclamped/undocumented boundary approximations** — no money-losing or data-corrupting bug found.

---

## Findings (ranked by real-world impact)

### F1 — Monthly-km helpers drifted: DistanceChart spreads gap months, MonthlyCostChart and OdometerChart don't (both claim "same method")
**P2 — numbers drift / wrong maintenance spread.**

- `frontend-react/src/components/charts/DistanceChart.tsx:50-71` — spreads `totalKm / gapMonths` uniformly across skipped months (deliberate fix, logged in CONTEXT 2026-07-05).
- `frontend-react/src/components/charts/MonthlyCostChart.tsx:41-62` — `avgKmPerMonth` = mean of *raw* month-to-month max-odo diffs (a skipped month lumps 2+ months of km into one diff).
- `frontend-react/src/components/charts/OdometerChart.tsx:61-69` — `avgMonthlyKm` = mean of last 3 raw month diffs, comment literally says "same method as DistanceChart".

**Scenario:** fills Jan@1000, Feb@2000, May@5000, Jun@6000 (Mar–Apr skipped).
- DistanceChart: Feb=1000, Mar=1000, Apr=1000, May=1000, Jun=1000 → avg **1000 km/mo**.
- MonthlyCostChart/OdometerChart: diffs [1000, 3000, 1000] → avg **1667 km/mo** (+67%).

Visible consequences: (a) maintenance spreading `monthsAhead = kmRemaining / avgKmPerMonth` (`MonthlyCostChart.tsx:75-77`) spreads an 4000-km-due service over 2 months instead of 4 → an artificially doubled €/mois bar; (b) €/100km `MaintenanceProj = maintCost / avgKmPerMonth × 100` (`:243-244`) is ~40% low; (c) OdometerChart's insurance-limit projection hits the limit ~2 months early after any logging gap.
**Nuance (honesty):** for *forward* projection the non-spread average may actually be the better estimate (a driver who skips a month drives more in adjacent months). The defect is that three charts implement two different methods while two of them claim "same method as DistanceChart". Fix shape: one shared `computeAvgKmPerMonth(entries, {spreadGaps})` in `src/lib/`, used by all three, with the spread-vs-not choice made once and documented.

### F2 — Silent tank = 50 L assumption when `tank_capacity` is not set
**P3 — display lie on the blend math.**

- `frontend-react/src/components/flexfuel/BlendCalculator.tsx:47` and `frontend-react/src/components/charts/EthanolHistoryChart.tsx:23` — `const tankCapacity = vehicle.tank_capacity ?? 50`.
- Backend side: `Vehicle.tank_capacity` is nullable (no default, `backend/app/models/vehicle.py:23`) and `vehicle_service._compute_seasonal_consumption`/`range_km` return `None` without it.

**Scenario:** a 60 L-tank vehicle with `tank_capacity` never filled in (the field is optional in VehicleAddDialog). BlendCalculator mixes on 50 L: a stop adding 45 L is treated as `remainingOldFuel = 50 − 45 = 5 L` when the truth is 15 L → the displayed tank ethanol % and every winter recommendation are wrong, and EthanolHistoryChart draws precise-looking %s on the same false premise. Backend stats meanwhile show `—` for range, so the two surfaces silently disagree.
Fix shape: don't default to 50 — hide/disable the blend calculator and ethanol chart with a "renseignez la capacité du réservoir" hint when `tank_capacity` is null (matching backend behavior), or use the backend's refusal as the single rule.

### F3 — Future-dated fuel entries produce negative "days since last entry"
**P3 — display bug (unclamped delta).**

- `backend/app/services/vehicle_service.py:586` — `days_since_last_entry = (date.today() - last_entry.fueling_date).days` is unclamped.
- Nothing prevents a future date: `FuelAddDialog.tsx:47-57` Zod schema only requires a non-empty string; no `max` on the `<input type="date">`.

**Scenario:** user typos or deliberately pre-fills tomorrow's date (app's whole offline flow encourages backdated fills; the date picker allows any value). Dashboard `VehicleCard.tsx:197-201` renders "Dernier plein il y a -2 jours". No crash, but an obvious lie next to the headline stats.
Fix shape: `max(0, ...)` in the service (one line) or `max: today` in the Zod schema (defense in depth at both layers).

### F4 — MonthlyCostChart €/100km: first-fill month's cost is invisible when that month has no distance-bearing fill
**P3 — the comment promises a property the code doesn't deliver.**

- `frontend-react/src/components/charts/MonthlyCostChart.tsx:128-135` — special case adds `sorted[0]`'s cost to `monthlyFuelCost` "so €/mois and €/100km agree on total spend".
- `:137-145` — but the €/100km chart data is built from `monthlyDistance.keys()`; a month with no distance-bearing entry never appears.

**Scenario:** the most common first month — user logs exactly one fill (e.g. 50 L @ 2.0 €/L = 100 €) and no second fill that month. €/mois shows 100 € for that month; €/100km shows no bar at all and the weighted "Moyenne" excludes the 100 € (both the first month's bar and its share of the numerator are dropped). The comment's stated goal ("both modes agree on total spend") holds only when the first month also contains a second fill with distance.
Fix shape: build €/100km `data` from the union of `monthlyDistance` and `monthlyFuelCost` keys (months with cost but no distance render a bar with `Carburant = null`, cost counted in the weighted average denominator only when distance > 0, consistent with the existing `dist <= 0 → continue` guard at `:280-283`).

### F5 — `e85_share_liters` denominator counts pre-conversion fills the numerator excludes
**P4 — metric window mismatch, worth documenting.**

- `backend/app/services/vehicle_service.py:520-528` (in `get_period_stats`): numerator counts only E85 fills with `fueling_date >= conversion_date`; `total_liters` (denominator) sums **all** period fills.

**Scenario:** conversion 2026-05-20, period 2026-05-01→31 with E10 30 L (May 5) + E85 40 L (May 25). `e85_share = 40/70 = 57%` — but of the post-conversion period the share is 100%. The same window asymmetry exists in `e85_savings` (pre-conversion E85 fills are silently excluded rather than marked). Impact is cosmetic today (a share label), but the asymmetry between the two numerators is confusing if the user ever runs a period spanning the conversion.
Fix shape: either filter the period's `total_liters` to `>= conversion_date` for the share, or document the definition in the endpoint docstring + UI label.

### F6 — Maintenance with `next_maintenance_odometer` already passed spreads over 12 months
**P4 — probably deliberate, but the shape is odd.** `frontend-react/src/components/charts/MonthlyCostChart.tsx:77` — `monthsAhead = kmRemaining > 0 ? Math.round(kmRemaining / avgKmPerMonth) : 12`. A service whose next-due odometer is already in the past (late maintenance) spreads its cost across the *next 12 months* instead of the current one, so an already-due cost shows up as a 12-month future projection in €/mois. If deliberate, keep it but say so in the code comment; if not, spread over `max(1, …)` months (already-due → current month).

### F7 — Rentability monthly average treats the conversion month as a full calendar month
**P4 — approximation worth documenting, not a bug.** `backend/app/services/flexfuel_service.py:220-225`: `completed_savings` (months `< current_month`) is divided by `(today − conversion month)` — the current partial month is correctly excluded from **both** sides, but the conversion month is counted as full even when conversion happened mid-month (May 20 → May counts 1.0). 45 € saved May 20→Aug 10 reports 15 €/mo instead of ~16.7 €/mo (~10% low, ≤ 1 month of bias). The projected break-even date (`FlexfuelRentabilityChart.tsx`) inherits this. Acceptable for a personal tool; the fixed-85%-nominal comment in `CONTEXT.md` already acknowledges the family of approximations. Add one sentence to the code comment.

### F8 — `haversineM` exists in 4 copies (3 frontend files + backend)
**P4 — drift hazard, currently identical.** `frontend-react/src/hooks/use-nearby-stations.ts:55`, `frontend-react/src/components/fuel/StationPricesDialog.tsx:74`, `frontend-react/src/components/fuel/NearbyStationsList.tsx:32`, `backend/app/utils/calculations.py:6`. All four use equivalent formulas today (verified character-for-character in the frontend trio; backend uses the `asin` variant of the same haversine). Not a bug yet — but the skill's "twin implementations that drifted" class has bitten this codebase three times; hoist the frontend copies into `src/lib/geo.ts` (backend keeps its own — different process).

---

## What is already well-defended (verified, do not re-audit)

- **Fill-to-fill pipeline is consistent across all 5 implementations.** Backend `get_fuel_statistics_by_vehicle`, `get_consumption_history`, `_compute_seasonal_consumption` (with `from_date`), `get_period_stats`, and frontend `computeAvgConsumption`/`computeTankState`/`EthanolHistoryChart` all use: sort `(fueling_date, odometer_reading, is_full_tank ASC, id)`, anchor at first full tank (leading partials dropped), same-stop partial→full folding, distance-weighted Σliters×100/Σkm, and previous-Plein E85 fraction attribution. Cross-checked segment by segment.
- **Consumption, price, cost-per-km and €/100km averages are distance- or liters-weighted** everywhere (`fuel_service.average_consumption`, `average_price_per_liter`, `get_vehicle_stats.cost_per_km`, `ConsumptionChart` avg buckets, `PriceChart` weighted averages, `MonthlyCostChart` €/100km Moyenne).
- **Same-stop booster attribution in `RefuelingPatternChart`** sorts without the `is_full_tank` tiebreaker, but the displayed stats are sums/counts that are invariant to which stop absorbs the booster — no visible impact (checked, not a finding).
- **Seasonal E85 normalisation** uses per-segment prev-Plein fractions before distance-weighting, exactly as documented in CONTEXT; `min/max` use raw measured values matching the chart's points.
- **`VehicleDetailsDialog` autonomy section** — every `!`-asserted value is guarded upstream: `stats.range_km != null` gates the section, and `range_km_e10/e85` are provably non-null whenever their consumption values are non-null (both derive from `tank_capacity` being set).
- **Error mapping:** `ValueError → 422/409/404` is consistent across vehicle, fuel and maintenance endpoints; batch-stats exceptions are caught per vehicle with a documented frontend fallback.
- **Validation:** liters (0,200], price (0,10], odometer [0, 9 999 999], initial-odometer floor on create/update for fuel and maintenance, chronology checks on fuel edits, decreasing-odometer override gated by explicit `allow_odometer_decrease`.
- **`computeWinterRec`/`computeThresholds` math** was re-derived (threshold A/B, blend x, min-pump floor, `Math.round` vs `Math.ceil`) — correct against the 2026-04-14 session log.
- **Cost-of-ownership** (purchase + fuel + maintenance + prorated fixed) — internally consistent; `allInCostPerKm` divides by `stats.total_distance` (since-acquisition) which is the documented denominator.

## Approximations worth documenting (no code change needed)

1. `get_vehicle_stats` reports `total_distance` (since acquisition) alongside a `cost_per_km` whose denominator is first→last **logged** fill distance — two windows in one payload, documented in CLAUDE.md; keep as-is.
2. `get_period_stats.fuel_cost_per_100km` is "spending per observed 100 km" over the odometer span of period boundary fills (already labelled in the UI per CONTEXT 2026-08-14).
3. Same-stop booster+plein pairs count the booster's liters as burned in the closing full's segment (documented "one plein at 45 L" convention).
4. `E85 → E10` savings equivalence uses a flat overconsumption factor per fill (not per segment); segment-level accounting is already in the Pending/Ideas list.

## How to reproduce & validate fixes (suggested)

- F1: unit test for a shared `avgKmPerMonth` with a Mar–Apr gap asserting DistanceChart's spread value; the discriminating assertion is that MonthlyCostChart's maintenance spread lands on 4 months, not 2.
- F2: mount BlendCalculator with `tank_capacity: null` — current behaviour renders mixing math; fixed behaviour shows the "renseignez la capacité" hint.
- F3: POST a fuel entry dated tomorrow → `days_since_last_entry` is currently negative; fixed = 0.
- F4: two entries, first month with a single fill → €/100km currently misses the month; fixed shows the month (null bar) and the average includes the cost when distance exists.
- F5–F8: doc/comment updates + optional hoisting of the haversine helper.
