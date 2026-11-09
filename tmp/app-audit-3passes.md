# VroomVroom — App Audit ×3 (looped passes)

Date: 2026-08-22 — 3 independent audit passes of the app-audit skill, compiled.
Source pass files: app-audit-pass1-bugs.md, app-audit-pass2-flows-security.md, app-audit-pass3-tests-features.md

---

## Loop 1 — Pass 1: Logic & Math Bugs

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

---

## Loop 2 — Pass 2: Flows + Security

# App-audit PASS 2 — Flows + Security (VroomVroom)

Date: 2026-08-21 · Scope: end-to-end flows (fuel capture, station prices/routing, maintenance reminders) + security posture calibrated to a personal homelab PWA behind a reverse proxy.

## Verdict

The core pump-capture flow is exceptionally well-defended (idempotent offline queue, degraded-transport fallback, surfaced outcomes), but the app ships with **authentication effectively disabled** (empty `API_KEY` in the real `.env.docker`, and no way for the built frontend to send a key) — the entire CRUD API is open to whoever can reach it, and the docs claim a protection that is off.

---

## Flows

### F1 — HIGH · Fuel *edit* and maintenance add/edit have no degraded-transport path: raw error + input loss on server-down
- **Evidence:** `frontend-react/src/components/fuel/FuelEditDialog.tsx:119-120` → `toast.error(e instanceof Error ? e.message : 'Erreur lors de la mise à jour')`; same shape at `MaintenanceAddDialog.tsx:81-82`. Only `FuelAddDialog.tsx` (~line 195-200) catches non-`ApiError` (timeout/DNS/refused) and falls back to `addToQueue`.
- **Scenario:** LTE is up, homelab is down (the exact case the create path handles). User edits a mistyped fill at the pump → `mutateAsync` throws `TypeError: Failed to fetch` / abort-timeout → English raw error toast, dialog stays open, nothing preserved beyond the current form state, no queue offered. If the user navigates away or reloads, the correction is lost. Same for adding maintenance while the backend is unreachable.
- **Fix shape:** Reuse the offline queue for updates — an update is naturally idempotent (targets `entry_id`), so `PUT /fuel-entries/{id}` replayed is safe; add `{mode:'update', id, data}` queue items and replay on sync. Minimal alternative: French message + keep form open + explicit "Réessayer / Mettre en file d'attente" choice. Backend already tolerates replay via entry-id targeting.

### F2 — MED · E10 reference price auto-capture silently skipped for offline E85 fills
- **Evidence:** `FuelAddDialog.tsx` (~lines 160-185): the auto-capture of `stationE10PriceRef.current` runs only in the online success branch of `onSubmit`. The offline branch (line 151-157) and the queued-on-transport-failure branch queue only the fuel payload — the E10 price dies with the ref.
- **Scenario:** User is offline at a station whose E10 price is known (from the station list) and fills E85. The fill syncs later, but no E10 reference price is recorded for that date → the rentability/flexfuel charts silently miss a reference point, and there is no visible indication.
- **Fix shape:** Stash `stationE10PriceRef.current` inside the queue item (extend `QueuedFuelEntry` with optional `e10Price`) and record it at sync time with the same date-dedup guard. Or accept as a documented limitation — the reference feed degrades slowly, never corrupts.

### F3 — LOW/MED · Poison-pill variant: 401/403/429 retried every 60 s forever with no escalation
- **Evidence:** `use-offline.tsx:95-102` — only `[400,404,409,422]` are rejected; every other status (incl. 401, 403, 429) is pushed to `transientFailures` and retried on the fixed 60 s timer (`use-offline.tsx:143-145`), no retry cap, no backoff.
- **Scenario:** API key rotated/expired (or, post-F8, a proxy returns 403 permanently): entries sit in the queue forever, retried once a minute indefinitely, with only the purple "N pleins en attente" banner as a signal. A permanent 401 is indistinguishable from a transient outage.
- **Ledger check:** CONTEXT.md 2026-08-14 documents this as deliberate ("retains 401, 403 and 429 responses for retry"). Reported as accepted-with-a-knob: add a consecutive-failure counter → toast alert + stop auto-retry after N attempts (keep manual sync), without changing which statuses are permanent.
- **Fix shape (if ever revisited):** `syncQueue` already returns `{synced, failed, rejected}` — surface `failed > 0 && consecutiveFailures >= 3` as a persistent alert instead of silent timer retries.

### F4 — LOW · Service worker caches all personal API data unbounded, no expiry
- **Evidence:** `frontend-react/public/sw.js:29-42` — every GET matching `/api/` or `carmanagementapi` is `caches.put` into `DATA_CACHE`; cache entries are only ever removed on `activate` for *old cache names*, never by age/volume. Includes fuel entries with GPS coordinates, prices, maintenance, vehicles.
- **Scenario:** Personal device, so impact is small; but the data copy is permanent in the browser's Cache Storage and is served to the origin without any auth context. If the app is ever exposed to other users or the device is shared, this becomes a leak channel.
- **Fix shape:** Bound `DATA_CACHE` (evict entries older than N days, or cap by count) — a 30-line addition in `activate` or on `put`. Otherwise document as accepted (offline support is a core feature).

### F5 — LOW · Falsy filter guards: `vehicle_id=0` bypasses filtering and returns all rows
- **Evidence:** `backend/app/services/fuel_service.py:109` (`if vehicle_id:`), same at 225, 275-284; `maintenance_service.py:70,162` — and `if fuel_type:` / `if start_date:` / `if end_date:` use the same falsy pattern. `vehicle_id=0` or an empty `fuel_type` string silently disables the filter.
- **Scenario:** `GET /api/v1/fuel-entries/?vehicle_id=0` returns every fuel entry for every vehicle instead of none. Single-user app → the same user sees their own data, so impact is cosmetic today — but it is the over-broad-guard class, it contradicts the `ge=1` semantics everywhere else, and it is one future multi-vehicle-auth check away from a real leak.
- **Fix shape:** `if vehicle_id is not None:` and `if fuel_type is not None:` (one-line guards).

### F6 — Well-defended (verified, no change needed)
- **Degraded transport:** create path queues on ANY non-`ApiError` (timeout, DNS, refused), not just `navigator.onLine` — `FuelAddDialog.tsx` catch branch; confirmed both `online` and `offline` event paths plus 60 s timer and reconnect-triggered sync in `use-offline.tsx:130-146`.
- **Idempotency:** `client_request_id` (UUID) on every payload, DB `unique` constraint (`fuel_entry.py:45` + Alembic `e5f6a7b8c9d0`), pre-check + `IntegrityError` fallback both return the existing row — duplicate delivery of the same fill cannot double-count.
- **Confirmations don't lie:** the decreasing-odometer `confirm()` maps end-to-end to `allow_odometer_decrease=true` on the POST and is carried in the queued payload (`FuelAddDialog.tsx`, `use-offline.tsx` QueuedFuelEntry).
- **Queue concurrency:** items added during an in-flight sync survive (filter is by `attempted` id set, `use-offline.tsx:104-107`).
- **Outcomes surfaced:** purple banner shows pending count (`OfflineBanner.tsx`), sync/reject toasts, cache invalidated for all fuel/stats query keys after successful sync (`use-offline.tsx:109-119`, keys match `use-fuel-entries.ts` / `use-vehicles.ts`).
- **Routing:** backend never 500s on provider failure, null legs, failures never cached (`routing_service.py`), per-pair TTL cache with lock + eviction, batch ≤ 95, concurrency 4; frontend `use-station-routes.ts` `retry:false`, empty-map fallback to straight-line haversine — verified in `StationPricesDialog.tsx:195-240`.
- **Station prices:** paged (offset loop to 300, page 100) against the data.gouv API, French error string, `radiusKm` bounds via `within_distance`.

---

## Security

Calibration: personal homelab app, single user, LAN + possibly internet-exposed hostnames (`carmanagement.home.ouiouibaguette.fr` / `carmanagementapi.home.ouiouibaguette.fr` appear in CORS). Verdicts below assume the API may be reachable from the internet via reverse proxy.

### Actionable

#### S1 — HIGH · API authentication is effectively OFF in the deployed configuration
- **Evidence:**
  - `backend/.env.docker` (the real env file both compose files load): `API_KEY=` **empty**. `deps.py:11-14`: `if not settings.API_KEY: return` → `verify_api_key` passes every request.
  - The frontend has **no way to send a key**: `getHeaders` (`frontend-react/src/lib/api.ts`) only adds `X-API-Key` when `import.meta.env.VITE_API_KEY` is set at build; nothing sets it — `frontend-react/Dockerfile` has no `ARG`/`ENV` for it, `docker-compose.prod.yml` has no `build.args`, no `VITE_*` anywhere in repo build config. Grep across Dockerfiles/compose/sh confirmed zero occurrences.
- **Scenario:** Anyone who can reach `:8055` or the reverse-proxied `carmanagementapi.home.ouiouibaguette.fr` can `POST /api/v1/fuel-entries/`, `PUT/DELETE` entries, vehicles, maintenance, and use the routing proxy — full read/write of the user's personal vehicle/fuel/GPS data. If the hostname is internet-resolvable, this is internet-writable data.
- **Doc drift:** CLAUDE.md and the auth tests (`tests/test_auth.py` exists, auth code is correct when a key IS set) claim "API key auth" as the deployed model — the capability exists but is not wired into the actual deployment.
- **Fix shape (when the user wants auth on):** (a) set a real `API_KEY` in `.env.docker`; (b) pass `VITE_API_KEY` at frontend build (`ARG VITE_API_KEY` + `ENV` in Dockerfile, `build.args` in compose); (c) restart both services. Minimal alternative that fits the homelab philosophy: keep auth off deliberately and document it (this is legitimately acceptable **only** if the proxy/network restricts access — see accepted list).
- **Note for the ledger:** verify whether `*.home.ouiouibaguette.fr` is LAN-internal DNS only, or internet-reachable. This determines whether S1 is "open to the LAN" (acceptable) or "open to the internet" (urgent).

#### S2 — LOW · No security headers shipped by the app
- **Evidence:** `frontend-react/nginx.conf` sets only gzip + cache headers — no `Content-Security-Policy`, no `X-Frame-Options`, no `X-Content-Type-Options`, no HSTS; `main.py` adds none either, and no doc says the reverse proxy owns them.
- **Scenario:** A single XSS (or injected third-party content) on the origin runs with full access to `localStorage` (offline queue holds liters/prices/GPS/notes) and Cache Storage (all API data). There is no CSP line of defense.
- **Fix shape:** In nginx.conf add `Content-Security-Policy: default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org https://basemaps.*; style-src 'self' 'unsafe-inline'; connect-src 'self' https://data.economie.gouv.fr https://geo.api.gouv.fr https://carmanagementapi...; font-src 'self' data:` (Tailwind injects inline styles, so `style-src 'unsafe-inline'` is required) plus `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. ~10 lines. Low priority for a homelab, cheap to add.

### Accepted for this threat model (deliberate or documented)

- **S3 — Secrets in git history:** `git log --all` shows `backend/.env.docker` and `backend/.env.local` were committed (initial commit `bc45564`, modified `4b0dd41`, since removed from tracking). Values found in history: `DB_USER/DB_PASSWORD=mathis` (the bundled dev MariaDB default — **accepted per decision ledger** "root docker-compose.yml is development-only; user accepts its exposed/default local database credentials"), `DB_PASSWORD=mystuff` (placeholder in a deleted doc), `API_KEY=change-me-in-production` (placeholder). **No real production credentials in history.** Residual: `mathis/mathis` is forever in the git history — fine for a private repo; if the repo is ever made public, rotate the dev DB password and scrub history (the pending `docs/TODO.md` .env-cleanup item relates).
- **S4 — `/` and `/health` are unauthenticated:** deliberate (Docker healthchecks hit `/health`); `/health` correctly returns 503 on DB loss. The `/` root returns a name+version banner — negligible. `/docs`, `/redoc`, `openapi.json` are gated on `DEBUG` (currently `False` in `.env.docker`) — good.
- **S5 — API key would be baked into the JS bundle if enabled:** inherent to a static frontend + shared-key model; the real control for this app is network reachability. Acceptable for homelab.
- **S6 — Service-worker cache of personal data (F4) and plaintext localStorage queue:** standard PWA offline trade-off on a personal device; no API key or password is stored in localStorage (key comes from build-time env only).
- **S7 — No rate limiting / no request size limit beyond Pydantic schema bounds:** single-user; routing matrix is capped at 300 destinations with bounded batches, so even the heaviest call is bounded. Acceptable; not currently even reachable by third parties only because of S1's state.

### What is already well-defended (security)

- **AuthZ wiring when enabled:** the whole `/api/v1` router is behind `verify_api_key` (`api/v1/api.py:7`), timing-safe `hmac.compare_digest`, `auto_error=False` with a French 403 detail.
- **Injection:** sort/order params are enum-whitelisted (`FuelEntryOrderBy` in `fuel_entries.py:24-34`, `MaintenanceOrderBy` in `maintenances.py:24`), `order` regex-constrained to `^(asc|desc)$`; no raw `getattr` on user input anywhere (verified grep across services). Vehicles endpoint has no sort params at all.
- **Input validation:** Pydantic bounds everywhere (`schemas/fuel_entry.py` liters `gt=0 le=200`, price `le=10`, odometer `le=9999999`, lat/lon ranges, string max_lengths; `schemas/routing.py` coordinate ranges + `max_length=300`); pagination capped (`per_page le=500`, `page ge=1`).
- **CORS:** explicit origins (`localhost:3055`, the two prod hostnames), no wildcard, methods/headers allow-listed.
- **Errors:** `str(e)` is only used for French domain-validation messages mapped to 4xx (`ValueError → 422/404`); unexpected errors log with `logger.exception` and return the generic French 500 "Erreur interne du serveur" — no stack traces or `repr` leak to clients.
- **Dependencies:** `requirements.txt` fully pinned (`fastapi==0.109.0`, etc.), `bun.lock` committed, session log 2026-08-14: `npm audit` reports zero vulnerabilities.
- **Health/monitoring:** `/health` 503s when MariaDB is down so Docker/HA-monitoring fires.
- **SSRF posture:** routing proxy uses a fixed `ROUTING_URL` from settings (existing LAN Valhalla at 192.168.25.25:8002, per decision ledger); coordinates are the only user-controlled input — no arbitrary-target fetch.

---

## What is already well-defended (summary — do not re-audit)

1. Offline fuel-create: idempotent (client_request_id + unique constraint + IntegrityError fallback), survives server-down via any-failure queueing, preserves entries added during sync, distinguishes permanent (400/404/409/422 → rejected + toast) from transient.
2. Confirmation flags survive the queue end-to-end (`allowOdometerDecrease`).
3. Sync outcomes surfaced: pending banner, success/reject toasts, targeted query invalidation.
4. Routing degrades gracefully at every layer (never 500, null legs, straight-line fallback, no retry hammering, bounded batches, cache never poisoned by failures).
5. Maintenance reminders: latest-per-type, one badge, overdue-first.
6. Backend validation bounds + enum-whitelisted sorting + capped pagination; timing-safe key compare; docs gated on DEBUG; pinned deps; no real prod secrets in git history; explicit CORS.

## Approximations worth documenting rather than fixing

- F3 (401/403/429 eternal retry) — accepted by design; flag if it ever produces support friction.
- F2 (offline E10 reference loss) — degrades a bonus metric slowly; acceptable unless the user starts logging many fills offline.
- S1's severity hinges on whether `*.home.ouiouibaguette.fr` resolves outside the LAN — worth a 5-minute check, not code.

---

## Loop 3 — Pass 3: Tests + Features

# App Audit — PASS 3: Tests + Features

**Repo:** VroomVroom (/home/supermut59000/Work/VroomVroom)
**Date:** 2026-08-22 · **Scope:** Phase 4 (tests) + Phase 5 (features), report-only, nothing fixed.
**Method:** Read CONTEXT.md (full), CLAUDE.md, docs/TODO.md, docs/gap-analysis.md, all 7 backend test files and 4 frontend vitest files. Ran both suites. Checked git log and decision ledger (project memories) before calling anything a bug or a stale test.

---

## Verdict (one sentence)

The suite is genuinely discriminating where it matters most (fill-to-fill math, weighted means, offline poison pills, routing), but the single most bug-prone block in the codebase — `_compute_seasonal_consumption` / autonomy stats, which had a multi-fix debug session on 2026-07-05 — has **zero** backend tests, and the odometer-decrease override, offline provider, batch/timeline endpoints, and all chart math run untested.

---

## Tests — what is already well-defended (do not re-audit)

These past bugs each have a regression test whose expected value differs between old and new behavior:

| Bug class (from CONTEXT.md session logs) | Test |
|---|---|
| Simple vs weighted consumption mean | `test_average_consumption_distance_weighted` (test_fuel_entries.py:249) — asserts 6.29, not simple mean 7.0 |
| Leading partial must not anchor a segment | `test_leading_partial_is_not_an_anchor` (test_fuel_entries.py:270) + frontend `computeAvgConsumption` "anchors at the first full tank" |
| Same-stop booster folding / `is_full_tank ASC, id` tiebreaker | frontend `computeAvgConsumption` "folds a same-stop booster… regardless of id order" (blend-math.test.ts) — old sort produced 8.0, new produces 9.0 |
| Partial fills accumulate to closing full | `test_partial_fills_accumulate` (test_fuel_entries.py:326) |
| Idempotent retry (client_request_id) | `test_client_retry_is_idempotent` (test_fuel_entries.py:28) |
| Poison pills (401/403/429 retry vs 400/404/409/422 park) | `isPermanentQueueStatus` (offline.test.ts) |
| Same-stop latest fill prefers full tank | `test_latest_same_stop_prefers_full_tank` (test_fuel_entries.py:179) |
| Pure-E85 tank crash + renderer contract (odoB null) | `computeThresholds` sweep test — a genuine mathematical-singularity sweep (blend-math.test.ts) |
| Cumulative vs per-step odometer in simulation | `simulateFutureFills` regression test (blend-math.test.ts) |
| Decreasing-odometer / chronology guards (reject path) | `test_create_fuel_entry_below_initial_odometer_rejected`, `test_update_rejects_out_of_sequence_odometer`, `test_update_allows_equal_odometer_blend_pair`, `test_update_initial_odometer_cannot_pass_existing_history` |
| Rentability formulas (equiv liters, savings, break-even, pre-conversion exclusion, most-recent-E10-price) | `TestFlexfuelRentability` — formula-pinned with exact expected values |
| Soft delete everywhere | vehicle, fuel, maintenance, conversion (recreatable), e10 price, rentability exclusion — all tested |
| Period stats formulas (weighted price, €/100km, anchor-in-period) | `TestPeriodStats` — 6 tests, exact numbers |
| Routing order/caching/batching/km↔m for both providers | `test_routing.py` — outstanding: order alignment, cache, GPS-drift cache hit, outage→nulls, 301-destination cap, cache bounded at 10 |
| Auth on/off, health 503, docs gated by DEBUG | `test_auth.py` — deliberate decisions encoded as tests, not violations |

**No stale tests found.** Every test asserts current behavior consistent with git/migration history; the two places where a test could look "wrong" (`test_custom_maintenance_type_accepted` = deliberate varchar migration; `test_docs_gated_by_debug`) explicitly document the decision in comments. This is the correct Phase 4 rule 2 behavior.

---

## Tests — findings ranked by impact

### T1 (P1) — `_compute_seasonal_consumption` / autonomy stats: zero backend tests
`backend/app/services/vehicle_service.py:234` (`_compute_seasonal_consumption`), `backend/app/schemas/vehicle.py:17-35` (`range_km*`, `e85_fraction`, `e10/e85_consumption`).
- **Why it matters:** CONTEXT.md's 2026-07-05 session documents the longest debug run in the project's history on exactly this code: `from_date` filter, drop-until-first-Plein anchoring, per-segment E85 normalisation, 5 L cushion, min/max. Multiple real bugs were fixed *in that session* — none left a regression test behind.
- **Concrete scenario:** vehicle with a conversion and a single fill-to-fill segment; if the "drop until first full tank on/after `from_date`" logic regressed, a leading partial anchors and `range_km` inflates (documented 26 L/100 km → 171 km "ville" failure mode). Nothing in the suite fails.
- **Fix shape:** 3–4 backend tests pinning exact numbers: (a) range formula `(tank−5)×100/avg`; (b) leading-partial-after-`from_date` not anchoring; (c) pre-conversion fills excluded from the season bucket; (d) per-segment normalisation vs average normalisation (two segments with different E85 fractions — the documented worked example in CONTEXT.md gives exact expected values).

### T2 (P1) — The odometer-decrease override success path is untested
`backend/app/services/fuel_service.py:35-52` (`allow_odometer_decrease=True`), same for update (`:158-188`).
- Only the **reject** path is tested (`test_create_fuel_entry_below_initial_odometer_rejected`, test_fuel_entries.py:58). The override itself — a documented 2026-08-14 feature ("historical correction only") — is never exercised. A regression that makes the override always-reject, or always-allow (silently swallowing real data-entry errors), passes the whole suite.
- **Fix shape:** one test creating an entry below the latest reading with `?allow_odometer_decrease=true` (expect 201), and one PUT with the override (expect 200).

### T3 (P2) — The 2026-05-27 chart bug class is untested (logic inline in components)
`frontend-react/src/components/charts/MonthlyCostChart.tsx`, `EthanolHistoryChart.tsx`, `DistanceChart.tsx`, `RefuelingPatternChart.tsx`.
- The booster-cost drop, ghost-fuel drift, gap-spreading, and plein-fold bugs were all real and fixed, but the logic lives inside React components with no vitest coverage. Only `blend-math.ts` (extracted separately) is tested.
- **Fix shape:** the project already has the precedent — extract the *already-proven-buggy* computations (monthly cost spread incl. booster handling; gap spreading; plein folding) into pure functions in `src/lib/` and test them, mirroring `blend-math.test.ts`. Do **not** test the components themselves (no RTL in the project — don't add it for this).

### T4 (P2) — Backend consumption-history same-stop tiebreaker has no discriminating test
`backend/app/services/fuel_service.py` (`get_consumption_history` / `get_fuel_statistics_by_vehicle`).
- The 2026-05-27 Bug 3 (backend non-deterministic sort for FlexFuel stops) is only caught by the **frontend** twin test (`computeAvgConsumption`). Backend tests use distinct odometers (`test_partial_fills_accumulate`). If the backend sort drifts from `(date, odometer, is_full_tank ASC, id)`, no backend test fails.
- **Fix shape:** one statistics test with a same-odo booster+full pair asserting the booster is consumed by the closing full (mirror the frontend 8.0→9.0 case with backend values).

### T5 (P2) — `/stats/batch` and `/timeline` endpoints untested
`backend/app/api/v1/endpoints/vehicles.py:150` (`stats/batch`), `:214` (`timeline`).
- Batch fallback is tested frontend-side (`shouldFetchIndividualStats`, vehicle-stats.test.ts) but the endpoint itself is not. Timeline merges fuel + maintenance; a soft-delete filter regression there would be silent (Phase 4 critical-path gap: soft-delete filtering in every query path).

### T6 (P2) — Offline provider behavior untested (core-value path)
`frontend-react/src/hooks/use-offline.tsx` (159 lines).
- Only the status classifier is tested. The documented behaviors — 60 s retry of transient failures, preserving entries added during an in-flight sync, server-down queueing, cross-tab idempotency (2026-08-10 / 08-14 sessions) — are untested. This is the app's entire reason to exist ("log a fill offline at the pump"). The core logic could be extracted to a testable pure module (queue state machine over an injected clock), or at minimum the reducer logic unit-tested.
- **Note the risk of touching this:** refactoring the provider to be testable is a behavior-preserving refactor; the existing integration behavior is documented in CONTEXT.md and must be kept.

### T7 (P3) — Frontend hooks with real bug history are untested
`use-vehicles` (active_only default, real bug 2026-04-15), `FuelEditDialog` fuel_type preservation (real bug 2026-04-15), `use-maintenance-reminders.ts` logic. React-Query hook logic and dialog submit logic have no tests; acceptable for a homelab app, but the two 2026-04-15 bugs are cheap to pin if the logic is ever extracted.

### T8 (P3) — Weak/conditional tests
- `test_rentability_monthly_avg_excludes_current_month` (test_flexfuel.py:201) is date-dependent and only asserts `is not None` — it can silently pass without testing the exclusion. Either pin it to a fixed fake date (freeze the clock) or assert the exact expected average.
- `test_pagination` (test_fuel_entries.py:195) covers page 1 of 2 but not page-beyond-end (an off-by-one returning 200 instead of empty is undetected).
- Zero-distance segment (two fulls at the same odometer → division by zero in consumption) is untested anywhere — the singularities are well-tested frontend-side for thresholds, not for the consumption path.

### T9 (P3) — Suite ergonomics (verified)
- Backend: the documented Docker command works as written — `docker compose run --rm -v ./backend:/app backend sh -c "pip install -q pytest pytest-asyncio httpx && python -m pytest tests/ -v --tb=short"` → **120 passed in 3.67 s** (verified today). Fast, per-test rollback, session-scoped schema.
- Frontend: `npm run test` → **32 passed in 473 ms** (vitest 4.1.10, verified today).
- Test-count claims in CLAUDE.md/CONTEXT.md (120 backend + 32 frontend) are accurate.
- Minor: `conftest.py` uses a file-backed `sqlite:///./test.db` — leaves a `test.db` file in `backend/` after runs (works, but a `:memory:` or tmp path would avoid stray artifacts).

---

## Features (Phase 5)

### Decision-ledger check (what not to propose)
- **Route/toll optimizer & full trip planner — REJECTED** (git `4909ca2` "remove trip planner entirely"; project memory records the rejection). Do not re-propose. A *pure fuel-cost estimator* (no routing, no map) is a different, smaller thing and remains viable (see F2).
- **Push notifications, photo upload, PDF export, multi-vehicle comparison, multi-user** — listed "Not Implemented", not formally rejected; the user's philosophy (single user, no over-engineering, no auth complexity) means: only build if the user asks. Do not put them on a recommended list.
- **Dev compose credentials exposure** — accepted risk, do not re-litigate.

### docs/gap-analysis.md staleness (generated 2026-05-12)
| Item | Status |
|---|---|
| #1 No odometer monotonicity check | **DONE** (2026-08-14) — stale |
| #2 Soft delete inconsistency (flexfuel hard delete) | **DONE** — conversion + E10 prices now soft-deleted and tested — stale |
| #3 `Vehicle.fuel_type` plain String vs docs' ENUM | **Still open** (model `vehicle.py:24` is `String(20)`; CLAUDE.md/architecture doc claim an ENUM). Doc/code disagreement; low impact for a single-user app, but the doc should be corrected or the model aligned. |
| #4 VehicleStats untyped dict merge | Still open, internal, low value — skip |
| #5 Pydantic `.dict(exclude_unset)` | **DONE** — no occurrences remain — stale |
| #6 No FlexFuel test coverage | **DONE** — 28 tests — stale |
| #7 `.env` in git history | Still open; tracked in docs/TODO.md #6 (P2) — leave as-is |

### Recommended features (ranked by value-to-effort, philosophy-fitting, all reuse existing data)

**F1 (P1, S) — Refuel-by / remaining-range badge on VehicleCard** (gap-analysis A1)
- Data already exists: `VehicleStats.range_km`, `days_since_last_entry` (`backend/app/schemas/vehicle.py:31-35`; stats already fetched per card via `useVehicleStats`). Frontend-only.
- Serve the core moment ("should I stop at this pump?"). Label it an estimate (5 L cushion, no live sensor). No push notifications, no calendar-date inference unless enough history exists.
- This is the single highest-value remaining mobile aid and costs a few hours.

**F2 (P2, S–M) — One-tap trip fuel-cost estimator (no routing)** (gap-analysis A2, reduced)
- Distance input + vehicle + fuel type → litres + €, using existing seasonal consumption and optional current price. Pure frontend math, no endpoint, no map, no tolls — explicitly *not* the rejected trip planner.
- Only worth building if F1 isn't enough; it reuses the same stats.

**F3 (P2, S) — Date-filtered CSV export** 
- Existing export (`src/lib/csv.ts`, Fuel/Maintenance dialogs) is all-history; a start/end period filter reuses everything already loaded. Small, honest for reimbursements/annual review.

**F4 (P2, S) — Next-service summary in the maintenance reminder surface**
- Reuses `use-maintenance-reminders.ts` and existing Maintenance types: show latest service + next date/km compactly. No scheduler, no notifications.

**F5 (P2, M) — Safety rail: regression tests for `_compute_seasonal_consumption`** (same as T1)
- The cheapest "feature" with the biggest correctness payoff: pin the autonomy formulas before anyone touches them again. If any autonomy work happens next, this test must come first.

**F6 (P3, S) — Fix the doc drift** (#3 above + gap-analysis header)
- Update the architecture doc to state `vehicles.fuel_type` is a plain string in the ORM (migration may differ), or align the model. One-line doc edit either way.

**Not recommended now:** range circle overlay on the station map (A3 — nice but M effort, needs the map + stats wiring, lower value than F1 for the same workflow), multi-vehicle comparison, fuel budget/market-price history/calendar heatmap (gap-analysis tail items — configuration burden for a single user).

---

## What is already well-defended (summary)
- Fill-to-fill math (weighted mean, anchoring, accumulation) — dual-tested backend + frontend, discriminating fixtures.
- Blend math singularities — swept, including the crash that previously blanked the app.
- Offline classification of permanent vs transient failures.
- Idempotent retries; chronology guards; soft delete in every query path that is tested; routing order/caching/unit conversion (best-tested surface in the repo).
- Auth on/off and health/503 behavior; deliberate decisions encoded as tests.
- Both suites run in seconds and the documented commands are accurate.

## Open risks / known approximations
- Chart and offline-provider logic is untested because it's embedded in components/hooks — the fix shape (extract pure logic, don't add RTL) is a suggestion, not a decision.
- T8's date-dependent rentability test can silently pass; it should be pinned, but it is not masking a known bug today.
- Nothing in this pass was fixed; all findings are report-only.
