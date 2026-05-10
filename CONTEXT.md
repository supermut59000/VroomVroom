# VroomVroom — Vision & Technical Context

This file is meant to be fed to an AI at the start of a new session to restore full context.
Last updated: 2026-04-14

---

## Who I Am

- French user, homelab enthusiast
- Self-hosting this app for personal use — not a SaaS product, not multi-tenant
- Comfortable with technical decisions, no need for hand-holding
- Preferred language in the app: **French** (all UI labels, toasts, error messages)
- Work on this app in sessions, building features incrementally

---

## The Vision

VroomVroom is my **personal vehicle management tool**. The core use case is:

> I'm at the gas station on my phone. I tap the PWA icon, log my fill in 10 seconds, and go.

Everything is designed around that moment. Secondary use cases:
- Reviewing costs and consumption trends later on a desktop
- Tracking maintenance (when is my CT due? when should I change my oil?)
- Understanding the real cost of my car ownership
- Tracking E85 savings since I converted one of my cars to FlexFuel

The app is **not** meant to become a full fleet management system. Keep it focused and simple.

---

## My Cars (Context)

- I have at least one vehicle converted to **FlexFuel E85**
- Real-world consumption: **6.6 L/100km on E10**, **7.9 L/100km on E85** (~19.7% overconsumption)
- FlexFuel kit cost: **~770 €**
- I manually log the E10 reference price I see at stations over time

---

## Technical Vision & Constraints

### Stack (non-negotiable)
- **Backend**: Python / FastAPI / SQLAlchemy / MariaDB — keep this stack
- **Frontend**: React 19 / TypeScript / Vite / Tailwind CSS 4 / shadcn/ui / TanStack Query / Recharts
- **Infrastructure**: Docker Compose (dev + prod), self-hosted homelab
- **DB**: MariaDB at `192.168.25.46:3306`, schema managed manually via SQL migration files

### Principles I care about
1. **Mobile-first** — the app lives on my phone as a PWA. Forms must be usable with one hand at a pump.
2. **Offline support** — fuel entries can be queued offline and synced when connection returns
3. **French UI** — all labels, toasts, error messages in French
4. **No over-engineering** — don't add abstractions for hypothetical future needs
5. **No auth complexity** — single API key is enough for a self-hosted homelab tool
6. **Recharts for all charts** — already in the project, don't introduce Chart.js or other libs
7. **shadcn/ui for all components** — keep UI consistent, don't add raw HTML elements when a component exists

### Key gotchas learned the hard way
- **SQLAlchemy Enum storage**: Python enums store member **names** (uppercase) in DB, not values. So `FuelType.GASOLINE` stores `"GASOLINE"` not `"essence"`. The DB ENUM must use uppercase: `ENUM('GASOLINE','DIESEL','ELECTRIC','HYBRID','LPG','E85')`
- **Zod schemas need updating everywhere**: when adding a new fuel type (e.g. `e85`), update ALL Zod schemas across VehicleAddDialog, VehicleEditDialog, FuelAddDialog — easy to miss one and get a production build error
- **prix-carburant API**: `data.economie.gouv.fr` dataset `prix-des-carburants-en-france-flux-instantane-v2`
  - No `name` field — use `adresse` as station name
  - Prices are `double` (€/L), NOT millièmes — do NOT divide by 1000
  - Geo field is `geom` (type `geo_point_2d`), returns `{lat, lon}`
  - `dist()` is NOT supported in `order_by` — sort client-side with haversine
  - `within_distance(geom, geom'POINT(lon lat)', Xkm)` works in `where`
- **E10 reference prices are global** — one shared price list, not per-vehicle. I fill up my E85 car and reference the E10 price I see at that station for savings calculation.
- **TSC is strict in production**: `bun run build` runs `tsc -b && vite build`. Unused imports are errors. Always run `npx tsc --noEmit` before committing.
- **Running backend tests**: no system pytest, no venv. Use Docker: `docker compose run --rm backend sh -c "pip install -q pytest pytest-asyncio httpx && python -m pytest tests/ -v --tb=short"`. 50 tests total (49 pass — `test_invalid_maintenance_type` is a pre-existing failure unrelated to security/features, maintenance_type accepts any string).

---

## Architecture Decisions

### Backend
- **Service layer pattern**: endpoints never touch the DB directly, always go through service classes
- **Migration files**: schema is managed via SQL files in `backend/migrations/`. No auto-migration (no `Base.metadata.create_all` in main.py)
- **Batch stats endpoint** (`GET /vehicles/stats/batch`): returns all active vehicle stats in one call to avoid N+1 queries on the dashboard
- **Soft delete**: vehicles use `is_active` flag. Hard delete only with `?force=true`
- **Centralized FuelType enum** in `app/core/enums.py` — single source of truth
- **order_by is whitelisted**: `fuel_entries.py` and `maintenances.py` use strict `str(Enum)` classes (`FuelEntryOrderBy`, `MaintenanceOrderBy`) — never accept raw strings for sort fields
- **Swagger UI is gated**: `docs_url` and `redoc_url` are `None` when `DEBUG=False`. Set `DEBUG=True` in local `.env` to access `/docs`
- **Error responses are opaque**: endpoints return static French strings, never `str(e)`. Internal details go to `logger.exception()` only
- **GPS bounds validated**: latitude `ge=-90/le=90`, longitude `ge=-180/le=180` enforced in Pydantic schema and query params

### Frontend
- **React Query** for all server state — no useEffect for data fetching except for derived/local effects
- `retry: false` on queries where 404 is expected (e.g., FlexFuel conversion — not all vehicles have one)
- **Offline queue** in fuel entries: if offline, entry is stored locally and synced on reconnect
- **GPS capture** in FuelAddDialog: captures lat/lon stored on the entry, used in StationsMap chart
- **Station price autocomplete**: past station names are suggested from `GET /fuel-entries/vehicle/{id}/stations` (wait — actually it's `GET /fuel-entries/stations`)

### DB Migration pattern
When making schema changes:
1. Update `backend/migrations/init_database.sql` (for fresh installs)
2. Create an incremental migration file in `backend/migrations/`
3. Run the incremental SQL manually on the live DB

---

## Current Feature Set

### Vehicle management
- Full CRUD, soft delete, archive
- Fields: brand, model, year, license plate, fuel type, initial odometer, tank capacity, acquisition date, purchase price, insurance km tracking, description

### Fuel tracking
- Full CRUD with offline queue
- GPS capture button inline with date/odometer row (top of form, no scrolling needed)
- After GPS: NearbyStationsList appears → click station to auto-fill name, location, price/L from gouv.fr API
- Backend endpoint `GET /fuel-entries/vehicle/{id}/nearest-station?lat=X&lon=Y&radius_m=250`: haversine in Python, returns station_name from closest past fill within radius — auto-fills form field
- Fuel type selector always shown, pre-filled from last fill (or vehicle default)
- FlexFuel vehicles: E85/E10 selector only
- Consumption: L/100km, fill-to-fill method, partial fill accumulation

### Maintenance tracking
- 10 predefined types + free text
- Next maintenance date + km reminders
- Reminder badges on vehicle cards (red = overdue, orange = upcoming within 30 days or 1000km)

### FlexFuel E85
- Record conversion (date, kit cost, overconsumption %, brand, installer, target_ethanol_pct, ethanol_tolerance_pct)
- Global E10 reference price history (date + price/L, shared across vehicles)
- Rentability calculation: savings per E85 fill = (E85_liters / overconsumption_factor × E10_ref_price) - actual_E85_cost
- Charts: cumulative savings line (Y axis = max(kit_cost, total_savings) × 1.1), monthly savings bars, summary cards
- **BlendCalculator**: see section below

### Station price map
- Standalone dialog (header button): nearby stations from gouv.fr API, adjustable radius 2-50km
- Sort by price (cheapest highlighted green) or distance
- Shows all 6 fuel type prices per station
- **City search bar**: `<Input list="commune-suggestions">` + `<datalist>` (same pattern as FuelAddDialog station name). Type city name or postal code → debounced call to `geo.api.gouv.fr/communes?nom=...` (or `?codePostal=...` when input is digits) → browser-native dropdown. Selecting a city uses its coordinates as search origin. GPS remains available and falls back automatically.
- **Known station name override**: `useGlobalStationHistory` hook fetches `GET /fuel-entries/?per_page=500` → filters to entries with GPS + station_name → for each API station, haversine < 200m match → if found, shows the user's saved name instead of the raw API `adresse`, with a `BookMarked` icon (same as NearbyStationsList). Response is `FuelEntryListResponse { entries: [...] }`, not a plain array.
- In FuelAddDialog/FuelEditDialog: after GPS capture, shows clickable list → auto-fills form

### Charts (in graphs popup)
- **ConsumptionChart**: L/100km per fill-up over time (line). Backend computes with partial-fill accumulation.
- **PriceChart**: €/L per fill-up over time (line) with average reference line.
- **MonthlyCostChart**: stacked bars fuel + maintenance per month. Toggle: €/mois ↔ €/100km. Both modes show 3-month projection as faded bars (avg of last 3 months).
- **DistanceChart**: km per month (bar) + projected annual km badge.
- **InsuranceKmChart**: absolute odometer progression vs insurance km limit (line). Reference line at `insurance_km_limit + years_elapsed × annual_increase`. Dotted projection forward at current monthly rate. Badge uses backend `insurance_km_remaining` (authoritative). Only renders if `vehicle.insurance_km_limit` is set. Uses **allEntries** (never filtered) for correct base odometer.
- **StationsMap**: clusters GPS fill points within 100m radius, Leaflet map.
- **FlexfuelRentabilityChart**: cumulative savings line vs kit cost reference line. If break-even not reached: dotted projection line extending at `monthly_average_savings` rate until kit cost is hit. Badge shows projected break-even month. Monthly savings bar chart.
- **BlendCalculator** (`frontend-react/src/components/flexfuel/BlendCalculator.tsx`): in-graphs popup, only for FlexFuel vehicles. See dedicated section below.

#### Insurance km calculation (mirrors backend exactly)
```
current_limit = insurance_km_limit + floor(years_since_start_date) × annual_increase
insurance_km_remaining = current_limit − last_odometer_reading
```
The limit is a **cumulative total odometer threshold**, not a per-year quota reset each year.

`InsuranceKmChart.tsx` projection: uses max odometer per month (same grouping as DistanceChart), then computes consecutive diffs for the **last 3 months** (not completed months — uses all available including current). Projects forward at that avg rate until limit hit, capped at 36 months. Uses `allEntries` (never date-filtered) so the base odometer is always correct.

#### DistanceChart km/month method
Groups entries by month → takes **max odometer per month** → differences between consecutive months. This accounts for multiple fills in a month without double-counting. Avg and projected annual use **completed months only** (< current month key).

#### CostOfOwnershipSection (in VehicleDetailsDialog)
```
totalCost = purchase_price + total_fuel_cost + total_maintenance_cost
costPerMonth = (fuelCost + maintenanceCost) / monthsOwned   ← no purchase price amortization
allInCostPerKm = totalCost / total_distance                  ← includes purchase price
projectedYearly = costPerMonth × 12
monthsOwned = max(1, months from acquisition_date or created_at to today)
```
Rendered as stat cards + donut chart (purchase / fuel / maintenance breakdown). Colors use CSS custom properties (`--color-chart-purchase/fuel/maintenance`) for dark mode support. Only renders if `totalCost > 0`.

#### Monthly cost projection method (updated 2026-04-05)

**Spreading**: Each maintenance cost is spread across multiple months (not dumped on one month).
Priority for determining the spread end date:
1. `next_maintenance_date` → spread from `maintenance_date` to that date (prorated by ms overlap)
2. `next_maintenance_odometer` → convert km remaining to months via `avgKmPerMonth`, then spread
3. Fallback → 12-month fixed spread (tires, wipers, anything without a next service date)

`avgKmPerMonth` is computed client-side the same way as `DistanceChart`: max odo per month → diff between consecutive months → average. No backend endpoint involved.

**Spreading is applied in both modes** (€/mois and €/100km). The shared `spreadMaintenanceCosts` Map is computed once and reused.

**Real data capped at current month** (`<= currentMonthKey`). Future spread amounts go to projection only.

**Projection** (faded `fillOpacity=0.35` bars, up to 12 months, stops after 3 if no more spread):
- `CarburantProj` = avg fuel of last 3 **completed** months (current month excluded)
- `MaintenanceProj` = actual `spreadMaintenanceCosts` value for that future month

**Averages** (header "Moyenne" badge, DistanceChart `avgKm` / `projectedAnnual`): computed on completed months only (< current month). Fallback to all months if no completed months exist.

#### FlexFuel monthly_average_savings (backend)
Computed in `flexfuel_service.py`. Excludes the current month from the average so that a partial month doesn't drag the projection down. If no completed months exist (conversion done this month), `monthly_average_savings = None` → no projection shown.

#### BlendCalculator — mélange E85/diluant (frontend only)

**Use case**: user fills with a small amount of SP95 or E10 first, then E85, to maintain a target ethanol % in the tank for reliable cold starts. Recorded as two separate fuel entries (partial 'essence' + full E85, same odometer).

**Stored on `FlexfuelConversion`** (new fields):
- `target_ethanol_pct` (default 77.0) — target ethanol % in tank
- `ethanol_tolerance_pct` (default 5.0) — acceptable ±deviation

**Ethanol content by fuel type**: E85 = 85%, E10 = 10%, SP95 = 5%, diesel/GPL/electric = 0%.
For 'essence' fills in history: uses the dilutant fraction the user selects at calculation time (E10 or SP95).

**Tank state computation** (fill-by-fill, from the full fill history):
```
state = { litersInTank: 0, ethanolLiters: 0, prevOdo: firstFill.odo }

for each fill sorted by (fueling_date ASC, id ASC):
  distance       = max(0, fill.odo - prevOdo)
  consumed       = distance × avgL100km / 100
  remaining      = min(max(0, litersInTank - consumed), tankCapacity)
  ethFrac        = litersInTank > 0 ? ethanolLiters / litersInTank : 0

  if fill.is_full_tank:
    # Physical constraint: at most (tankCapacity - fill.liters) was left before fill.
    # Take min(model estimate, physical bound) to prevent drift from inflating ethanol%
    # above the 85% physical max, while still preserving a prior partial fill logged at
    # the same odometer (e.g. 5 L E10 just before 40 L E85).
    actualRemaining  = min(remaining, max(0, tankCapacity - fill.liters))
    litersInTank     = tankCapacity
    ethanolLiters    = min(ethFrac × actualRemaining + fill.liters × ethanolFrac(fill.fuel_type), tankCapacity)
  else:
    litersInTank     = min(remaining + fill.liters, tankCapacity)
    ethanolLiters    = min(ethFrac × remaining + fill.liters × ethanolFrac(fill.fuel_type), litersInTank)

  prevOdo = fill.odo
```

**Ethanol fractions used** (fixed constants — E85 at pump in France varies 60–85% by season, 85% is a conservative upper bound):
```
e85       → 0.85
essence   → 0.05  (SP95 assumed for historical fills)
e10       → 0.10  (dilutant selected at recommendation time, not stored on fill)
diesel / gpl / electrique / hybride → 0.00
```

**Why `min(remaining, tankCapacity - fill.liters)` on full fills:**
- Model overestimates remaining (e.g. 5 L) but only 1 L was physically there → without fix: `5×80% + 44×85% = 41.4 L / 45 L = 92%` (impossible). With fix: `1×80% + 44×85% = 38.4 L / 45 L = 85.3%` ✓
- E10 partial + E85 full at same odometer: model says 5 L remaining (the E10 we just logged, consumed=0). `actualRemaining = min(5, 45−40) = 5 L` → E10 contribution preserved ✓
- User over-logs E85 (45 L in 45 L tank): `actualRemaining = min(5, 0) = 0` → E10 contribution lost, but this is a data entry issue (5+45 > 45 L is physically impossible)
`avgL100km` is computed client-side from the same fill history using fill-to-fill method (accumulate partials until next full tank, divide total liters by distance).

**Two reference km thresholds** shown at top of dialog (no input needed):
```
ethFrac = ethanolLiters / remainingLiters

# odoA — last km for pure E85 fill staying ≤ targetMax
r_A = tank × (targetMax − 0.85) / (ethFrac − 0.85)
odoA = fromOdo + (remaining − r_A) × 100 / avgL100km   (null if remaining ≤ r_A)

# odoB — first km where x_ideal = 5 L (min pump) → exact target
r_B = [5 × (dilFrac − 0.85) − tank × (target − 0.85)] / (0.85 − ethFrac)
odoB = fromOdo + (remaining − r_B) × 100 / avgL100km   (odoBNow=true if remaining ≤ r_B)
```
Both thresholds react to the manual odometer input in real time.

**Winter smart recommendation** (3 auto-detected cases):
- `currentPct > targetMax` → partial fill: add only 15 L E85, dilute at next fill
- Pure E85 fill result ≤ targetMax → recommend E85 only + km until next fill would exceed max
- Otherwise → blend needed:
```
T = tankCapacity - remainingLiters
x_ideal = (target × (remaining + T) - ethanolLiters - 0.85 × T) / (dilutantFraction - 0.85)
x = round(x_ideal)   ← Math.round, not ceil — minimise dilutant, stay as close to target as possible
if x < 5  → x = 5    (minimum pompe France)
if T-x < 5 → adjust
```
- Summer → pure E85 always (économies maximales)

**Recording** (no schema change needed): two fills, same odometer, same day:
- 'essence' fill, `is_full_tank: false` (the dilutant)
- E85 fill, `is_full_tank: true` (completes the tank)
The consumption calculation already handles this correctly: partial 'essence' accumulates, E85 full fill triggers the fill-to-fill calculation over the total distance.

**BlendCalculator location**: vehicle dashboard card (via `BlendCalculatorDialog`). NOT in the graphs popup — graphs popup has `EthanolHistoryChart` instead.

#### EthanolHistoryChart — taux éthanol dans le réservoir (frontend only)

**File**: `frontend-react/src/components/charts/EthanolHistoryChart.tsx`

**Purpose**: line chart showing estimated ethanol % in the tank after each full fill, over time. Allows tracking whether the blending strategy is keeping ethanol within the target band.

**Data**: one point per `is_full_tank=true` fill, computed using the exact same tank state algorithm as BlendCalculator (same `ETHANOL_FRACTION` constants, same `avgL100km`, same `actualRemaining` formula).

**Reference lines**:
- Teal dashed: `target_ethanol_pct` (77% default)
- Orange dashed: `target + tolerance` and `target - tolerance` (±5% default)

**Gotcha — `tank_capacity` must be the real physical capacity** (réservoir + réserve), not the manufacturer's "usable" spec:
- A Corsa E is listed as 45 L but can physically hold ~50 L (the light comes on with ~5 L left)
- If `tank_capacity = 45` but user fills 45 L of E85 from reserve (5 L left), `tankCapacity - fill.liters = 0` → `actualRemaining = 0` → E10 partial fill contribution is lost → chart shows ~85% instead of the real ~78%
- Fix: set `tank_capacity` to the observed fill-to-click-off value from near-empty (e.g. 50 L)

### PWA / Offline
- Service worker: network-first for API, cache-first for assets and map tiles
- Installable on mobile
- Offline fuel entry queue

### Auth
- API key (`X-API-Key` header), configured in `.env`
- Empty = disabled (useful for local dev)
- CORS: explicit methods `["GET","POST","PUT","DELETE","OPTIONS"]` and headers `["Content-Type","Authorization","X-API-Key","Accept"]` — no wildcards

### Dark mode
- Sun/Moon toggle in header
- 3 modes: system / light / dark
- Persisted in localStorage

---

## Production Setup

- Frontend: `https://carmanagement.home.ouiouibaguette.fr`
- Backend API: `https://carmanagementapi.home.ouiouibaguette.fr`
- DB: MariaDB at `192.168.25.46:3306`, database `vehicle_management`
- Deploy: `docker compose -f docker-compose.prod.yml up -d --build`
- Reverse proxy: handles SSL (Let's Encrypt)

---

## What I Like / Don't Like

### What works well, keep doing
- Small focused features per session
- Asking about the real use case before designing
- French UI throughout
- Mobile-first thinking

### Things to avoid
- Don't add features I didn't ask for
- Don't add comments/docstrings to code that wasn't changed
- Don't over-abstract — 3 similar lines is better than a premature helper
- Don't add backwards-compatibility shims for removed code
- Don't use emojis unless I ask
- Don't summarize what you just did at the end — I can read the diff

---

## Security Status (as of 2026-03-26)

### Fixed
- SQL injection via `order_by` → enum whitelist
- GPS coordinate validation → Pydantic `ge/le` bounds
- CORS wildcard → explicit methods + headers
- Swagger UI exposed in prod → gated behind `DEBUG=True`
- Health check leaked environment → returns `{"status":"healthy"}` only
- Error messages leaked `str(e)` → static strings, server-side logging
- `vehicle_id` typed as `str` in maintenances.py → fixed to `int`

### Pending (known, accepted for homelab)
- **`.env` in git history**: credentials (`mathis`/`mathis`, `192.168.25.46`) are in commit `3836c24`. To fix: `git filter-repo --path backend/.env --path backend/.env.local --invert-paths` + force push + rotate DB password. Low priority since repo is private and credentials are homelab-only.
- **No rate limiting**: acceptable for single-user homelab
- **Offline queue stored in localStorage**: acceptable since only user is the owner
- **CSP/HSTS headers**: handle at reverse proxy level (Nginx/Traefik), not in app

---

## Session log — 2026-04-15

### Bug fixes & soft delete

**FuelEditDialog — fuel_type bug** (`frontend-react/src/components/fuel/FuelEditDialog.tsx`):
- Bug: editing any fuel entry was overwriting its `fuel_type` with the vehicle's primary type (`vehicle?.fuel_type ?? entry.fuel_type`). An E85 car with a GASOLINE entry would turn it back to E85 on save.
- Fix: use `entry.fuel_type` as ground truth in `onSubmit`. Also fixed `fuelType` variable used by `NearbyStationsList` to use entry type first.
- Added fuel type `Select` to the edit form (same options as FuelAddDialog: FlexFuel vehicles get E85/Essence only, others get all 5 types). Pre-filled from `entry.fuel_type` on open. Mismatch warning shown if selected type differs from vehicle type.

**Soft delete for fuel entries and maintenances**:
- Added `is_active BOOLEAN NOT NULL DEFAULT TRUE` to `FuelEntry` and `Maintenance` models.
- `FuelService.delete_fuel_entry` and `MaintenanceService.delete_maintenance` now set `is_active=False` instead of `db.delete`.
- All queries in `fuel_service.py`, `maintenance_service.py`, and `vehicle_service.py` (timeline, stats, direct fuel_entries query) filter `is_active=True`.
- Migration: `backend/migrations/add_soft_delete_fuel_maintenance.sql` (two `ALTER TABLE ADD COLUMN` statements).
- **`Boolean` import was missing** from `maintenance.py` model — caused backend crash on deploy, fixed immediately.

**Vehicle delete was also hard-deleting**:
- `VehicleCard.tsx` delete button was hardcoded to `handleDelete(true)` (`?force=true`). Changed to `handleDelete(false)` so vehicle deletion is a soft delete (archives the vehicle).
- Confirmation dialog text updated: no longer says "irréversible", now says the vehicle is archived and history is kept.

**`useVehicles` was fetching inactive vehicles**:
- Hook was calling `/vehicles/?active_only=false`, showing archived vehicles in the dashboard.
- Fixed to `/vehicles/` (backend defaults to `active_only=true`).

---

## Session log — 2026-04-14

### BlendCalculator — mode hiver intelligent + seuils km de référence

- **Deux cartes de référence** affichées dès l'ouverture du dialog (hiver uniquement) :
  - "E85 pur" : dernier km pour un plein E85 ≤ targetMax. `r_A = tank × (targetMax−0.85) / (ethFrac−0.85)`. Affiche "Fenêtre passée" si dépassé.
  - "Dilution X" : premier km où 5 L de diluant → taux cible exact. `r_B = [5×(dilFrac−0.85) − tank×(target−0.85)] / (0.85−ethFrac)`. Affiche "Maintenant" si atteint.
- **Recommandation hiver intelligente** (3 cas) : taux trop élevé → 15 L E85 partiel ; E85 pur ok → plein E85 + km-safe ; sinon → blend.
- **Fix `Math.round` vs `Math.ceil`** : le calcul de blend utilisait `Math.ceil(xIdeal)` — donnait 6 L E10 quand x_ideal=5.15. Corrigé en `Math.round` → 5 L E10, résultat 72.1% (au plus près de la cible).
- Sélecteur diluant (E10/SP95) toujours visible en hiver, caché en été.

---

## Session log — 2026-04-05

### MonthlyCostChart — maintenance spreading & projection rework

- **Spreading added to €/mois mode**: previously maintenance cost was dumped entirely on the month of the entry. Now spread across months with same algo as €/100km mode.
- **Unified `spreadMaintenanceCosts` memo**: single Map used by both modes instead of duplicated logic. Old `per100kmData` fallback was `new Date()` (today) — replaced by proper priority cascade.
- **Spread priority**: `next_maintenance_date` > `next_maintenance_odometer` (converted via `avgKmPerMonth`) > 12-month fallback.
- **`avgKmPerMonth`** uses same method as `DistanceChart` (max odo per month, diffs, average). No backend endpoint.
- **Real data capped at current month** in both modes — future spread no longer appears as solid bars.
- **Projection** uses actual scheduled `spreadMaintenanceCosts` for future months (not avg of past maintenance). Fuel projection uses avg of last 3 **completed** months.
- **Current month excluded from averages** in MonthlyCostChart (header "Moyenne") and DistanceChart (`avgKm` badge, `projectedAnnual`) — partial month was dragging figures down.

---

## Session log — 2026-03-30

### Graph deduplication & new charts
- Merged `CostPerKmChart` into `MonthlyCostChart` (toggle €/mois ↔ €/100km). Deleted the old component.
- Deleted `OdometerChart` (duplicate of `DistanceChart`).
- Added 3-month projection to both modes of `MonthlyCostChart` (faded bars + ReferenceLine).
- Added dotted break-even projection line to `FlexfuelRentabilityChart` when kit not yet amortised. Badge shows projected month.
- Created `InsuranceKmChart`: absolute odometer vs insurance limit, dotted forward projection. Uses `allEntries` (unfiltered) + `useVehicleStats` for authoritative remaining km.

### API key & resilience (session prior)
- `frontend-react/src/lib/api.ts`: added `getHeaders()` injecting `X-API-Key` from `VITE_API_KEY`.
- `frontend/js/config.js`: added `API_KEY`, `getHeaders()`, `fetchApi()` wrapper; all vanilla JS fetch calls updated.
- `/health` endpoint now probes DB with `SELECT 1`.
- `run.py`: `timeout_graceful_shutdown=5` added to Uvicorn.
- Docker healthcheck added to backend service in both compose files.
- Station map cluster radius: 50m → 100m.

---

## Session log — 2026-05-10

### BlendCalculator — décimales + planificateur de pleins futurs

**Contexte mathématique établi en session** :
- Réservoir Corsa E : 50L physique (pas 45L)
- Consommation : 6.6 L/100km E10, 7.9 L/100km E85 (+19.7%)
- Ratio optimal pour 70% éthanol : 80% E85 + 20% E10 par volume
- Minimum pompe France : 5L (obligation métrologique DGCCRF). Certaines pompes récentes : 2L.
- À 300km entre les pleins (~26L restants), x_ideal ≈ 4.5L → forcé à 5L par le minimum pompe → résultat 68.6% au lieu de 70%. Pas un bug du code, contrainte physique.
- Pour que x_ideal dépasse naturellement 5L : attendre ~350-400km (≤22L restants).

**Changements `BlendCalculator.tsx`** :
- Arrondi 0.1L (`Math.round(x * 10) / 10`) sur tous les montants, affichage `.toFixed(1)` partout
- Suppression section "Trajet prévu" (tripKm state + UI entièrement retirés)
- `simulateFutureFills(intervals: number[])` : simule les 4 prochains pleins depuis l'état actuel du réservoir
- Section "Pleins futurs" collapsible (▴/▾, fermée par défaut) : input intervalle global + tableau km/mélange/%
- Boutons −50/+50km par ligne dans le tableau pour ajuster la distance d'un plein individuel sans affecter les autres (`intervalOverrides: Record<number, number>`)

---

## Session log — 2026-05-05

### StationPricesDialog — recherche par ville + nom personnalisé depuis l'historique

**Recherche par ville** :
- Barre de recherche avec `<Input list="commune-suggestions">` + `<datalist>` — même pattern que le champ station dans FuelAddDialog.
- Appel debounced (300ms) à `geo.api.gouv.fr/communes?nom=QUERY` (ou `?codePostal=QUERY` si l'input est entièrement numérique). Le bon paramètre est `nom=` et non `q=` (erreur initiale).
- Détection de la sélection dans `onChange` : si la valeur correspond exactement à un label de suggestion (`"Nieppe (59850)"`), on extrait `[lon, lat]` depuis `commune.centre.coordinates` et on met à jour l'origine.
- État `origin { lat, lon, label, mode: 'gps' | 'city' }` pilote les fetches de stations. Le GPS s'active toujours au démarrage ; la ville sélectionnée prend la priorité.

**Nom personnalisé depuis l'historique** :
- Hook `useGlobalStationHistory` (`use-fuel-entries.ts`) : appelle `GET /fuel-entries/?per_page=500`.
- **Gotcha** : la réponse est `FuelEntryListResponse { entries: FuelEntry[] }` et non un tableau direct — le `select` doit déstructurer `.entries` avant de filtrer.
- Pour chaque station API, haversine < 200m contre l'historique → si match, affiche le nom sauvegardé + icône `BookMarked` (identique à `NearbyStationsList`). Fallback sur l'`adresse` API.

**Bug corrigé — `useCallback` dans un rendu conditionnel** (`FuelAddDialog.tsx`) :
- `onSelect={useCallback(...)}` était dans un bloc `{geo.status === 'success' && ... && <NearbyStationsList ... />}`. Violation des Rules of Hooks → React error #310 au premier succès GPS. Déplacé en `handleStationSelect` au niveau racine du composant.

---

## Session log — 2026-05-04

### Autonomie — moyenne pondérée par distance + fourchette ville/route

**Problème identifié** : la moyenne saisonnière utilisait une moyenne simple des segments fill-to-fill (chaque segment comptait pour 1 quel que soit le nombre de km). Un segment de 100 km pesait autant qu'un segment de 500 km, ce qui biaisait le résultat et donnait une autonomie affichée supérieure au ressenti réel.

**Deuxième problème** : la fourchette min/max était calculée sur la consommation mesurée brute. Le meilleur cas (684 km) venait d'un segment de transition post-conversion où le réservoir avait encore de l'Essence, donnant 6.58 L/100km non représentatif d'un plein E85.

**Fixes backend** (`vehicle_service.py`, `schemas/vehicle.py`) :
- `avg_consumption` → moyenne pondérée par distance : `total_liters × 100 / total_km`
- `season_buckets` stocke `(distance_km, liters, e85_liters, measured_l100)` par segment
- Nouveaux champs `SeasonStats` : `min_consumption`, `max_consumption`, `range_km_best`, `range_km_worst`
- Pour FlexFuel : `min_consumption`/`max_consumption` calculés sur la consommation **normalisée E85** par segment (`measured / (1 + opc × e85_frac) × (1 + opc)`) — élimine le biais des segments de transition où l'Essence était encore dans le réservoir
- Pour non-FlexFuel : min/max sur la consommation brute mesurée
- La normalisation E10/E85 reste par segment avant moyenne pondérée (inchangé dans sa logique, réécrit pour partager `e10_per_seg`)

**Fix frontend** (`VehicleDetailsDialog.tsx`, `types/index.ts`) :
- Sous le titre de saison : « De ~X km (ville) à ~Y km (route) · moy. Z L/100 »
- Dans chaque cellule de la grille 4 saisons : ligne `min–max` en sous-texte

---

## Session log — 2026-04-27

### BlendCalculator — mode toutes saisons + boutons incrémentaux odomètre

- Supprimé le toggle Hiver/Été et `SeasonMode` type + `defaultSeasonMode()` function.
- Le calculateur affiche maintenant toujours le contenu "hiver" (sélecteur diluant, cartes seuils A/B, recommandation blend, planificateur de trajet). La carte "été" (E85 pur, fond amber) est supprimée.
- Ajouté boutons `+50` / `+100` / `+200` inline à droite du champ odomètre. Chaque clic fait `setCurrentOdo(String(inputOdo + delta))` — `inputOdo` vaut `lastOdo` si le champ est vide, sinon la valeur saisie. Les clics sont cumulables.

---

## Session log — 2026-04-16 (suite — BlendCalculator)

### BlendCalculator — plein partiel E85 max + planificateur de trajet

#### Plein partiel E85 max (`limitFill`)

Nouvelle valeur calculée dans le composant à chaque rendu :

```
x = (remaining × targetMax − ethanolLiters) / (0.85 − targetMax)
liters = min(x, tankCapacity − remaining)   ← cap au réservoir plein
isFull = x ≥ (tankCapacity − remaining) − 0.5  ← plein complet si x_idéal dépasse la capacité
resultPct = (ethanolLiters + liters × 0.85) / (remaining + liters) × 100
addedKm = liters × 100 / avgL100km
```

**Zone E85 pur (avant odoA)** : x_idéal dépasse la capacité du réservoir → `isFull = true`, affiche « Plein complet : X L → Y% · +Z km » en bas de la carte A. Confirme que le plein complet reste sous la limite.

**Zone morte (après odoA, avant odoB)** : x_idéal < capacité disponible → remplissage partiel actionnable. La carte A remplace « Fenêtre passée » par « Partiel possible · X L E85 → Y% · +Z km ». C'est la réponse à « puis-je quand même mettre de l'E85 sans dépasser la limite ? » — oui, mais en s'arrêtant à X L.

**Cas limite** : si le taux actuel ≥ targetMax, `limitFill = null` (aucun E85 ne peut améliorer la situation, seul le diluant aide).

#### Planificateur de trajet (`tripKm`)

Nouveau champ de saisie « Trajet prévu (km) » en mode hiver uniquement, placé sous la recommandation. Affiche un tableau de comparaison :

| Ligne | Calcul |
|-------|--------|
| Réservoir actuel | `(remaining − 5) × 100 / avgL100km` |
| + X L E85 (partiel/plein) | `(remaining + limitFill.liters − 5) × 100 / avgL100km` |
| + X L diluant + Y L E85 | `(remaining + dilutant + e85 − 5) × 100 / avgL100km` |

La ligne « blend » n'apparaît que si la recommandation hiver est de type `blend`. La ligne E85 n'apparaît que si `limitFill` est disponible. Indicateurs ✓ / ✗ selon si la portée couvre le trajet.

La **réserve de 5 L** est appliquée à toutes les portées (cohérent avec le calcul d'autonomie dans VehicleDetailsDialog).

---

## Session log — 2026-04-16

### Autonomie estimée (VehicleDetailsDialog)

New "Autonomie estimée" section added to the vehicle details popup (not the card — too dense for mobile).

#### What was added
- **Backend** (`vehicle_service.py`): new `_compute_seasonal_consumption()` method + 9 new fields on `VehicleStats`:
  - `spring/summer/autumn/winter_avg_consumption` (L/100km)
  - `range_km`, `range_km_spring`, `range_km_summer`, `range_km_autumn`, `range_km_winter`
- **Frontend** (`VehicleDetailsDialog.tsx`): section showing current-season range prominently, 4-season grid, E85/E10 split for FlexFuel vehicles.

#### Seasonal grouping
Meteorological seasons (by fill date month):
| Season | Months |
|--------|--------|
| Printemps | mars–mai (3–5) |
| Été | juin–août (6–8) |
| Automne | septembre–novembre (9–11) |
| Hiver | décembre–février (12, 1, 2) |

Each season's average consumption is computed using the **same fill-to-fill algorithm** as the main stats:
- Partial fills accumulate liters until the next `is_full_tank = true` entry
- Consumption is only attributed to the **full-tank entry** (not the partial ones)
- The fill date of the full-tank entry determines which season bucket the data point goes into
- Average = simple mean of all fill-to-fill consumption values in that season

#### Data structure
`VehicleStats` now exposes a `SeasonStats` nested object for each season (`spring`, `summer`, `autumn`, `winter`) plus an `overall range_km`.
Each `SeasonStats` contains:
- `avg_consumption` — actual L/100km measured in that season (real fuel mix)
- `e85_fraction` — fraction of E85 in fills during that season (0.0–1.0). FlexFuel only.
- `e10_consumption` — L/100km normalised to pure E10. FlexFuel only.
- `e85_consumption` — L/100km normalised to pure E85. FlexFuel only.
- `range_km` — range on actual avg mix (5 L cushion)
- `range_km_e10` / `range_km_e85` — range on pure fuels. FlexFuel only.
- `fill_count` — number of fill-to-fill data points (reliability indicator)

#### Range formula
```
usable_liters = tank_capacity − 5     ← 5 L cushion (warning-light reserve)
range_km = usable_liters × 100 / consumption_L100km
```
Applied to `avg_consumption`, `e10_consumption`, and `e85_consumption` independently.

Example: tank = 50 L, hiver avg = 7.5 L/100km → `45 × 100 / 7.5 = 600 km`

#### FlexFuel E10/E85 normalisation — per-segment, not on the average

For each fill-to-fill segment the backend computes the **E85 fraction** of fills added in that segment (e.g. 5 L E10 + 40 L E85 → fraction = 40/45 ≈ 0.889). Then it normalises the measured consumption **before** averaging across the season:

```
For each segment i:
  e85_fraction_i = e85_liters_i / total_liters_i
  e10_l100_i     = measured_l100_i / (1 + opc × e85_fraction_i)
  e85_l100_i     = e10_l100_i × (1 + opc)

Season averages:
  e10_consumption = mean(e10_l100_i for all i in season)
  e85_consumption = mean(e85_l100_i for all i in season)
```

Where `opc = overconsumption_pct / 100` (e.g. 0.197 for 19.7%).

**Why per-segment and not on the average?**
Normalising the already-averaged value assumes all segments had the same E85 fraction. In reality a hiver season might have some 100% E10 segments (cold start weeks) and some 80% E85 segments. Per-segment normalisation handles each differently and produces a more accurate E10 and E85 baseline.

**Worked example** (hiver, 3 segments):
| Segment | Measured | E85 frac | → E10 | → E85 |
|---------|----------|----------|-------|-------|
| 1 | 7.2 L/100 | 0.00 (pure E10) | 7.20 | 8.62 |
| 2 | 7.5 L/100 | 0.50 | 7.50/(1+0.197×0.5)=6.83 | 8.18 |
| 3 | 8.1 L/100 | 1.00 (pure E85) | 8.10/1.197=6.77 | 8.10 |

→ `e10_consumption = (7.20+6.83+6.77)/3 = 6.93 L/100`
→ `e85_consumption = (8.62+8.18+8.10)/3 = 8.30 L/100`
→ With 50 L tank: E10 range = `45×100/6.93 = 649 km`, E85 range = `45×100/8.30 = 542 km`

The `e85_fraction` reported in `SeasonStats` is the **average** fraction across segments in that season, shown in the UI as "Mix réel cette saison : X% E85 / Y% E10".

---

## Pending / Ideas for Future Sessions

- **Photo receipts** — snap a photo of pump receipt / maintenance invoice, attach to entry
- **Push notifications** — PWA push when maintenance is due or insurance km limit approaching
- **Multi-vehicle comparison** — side-by-side stats
- **CI/CD** — GitHub Actions: lint, test, build, deploy on push to master
- **Test coverage for FlexFuel** — no tests yet for flexfuel service/endpoints
- **Fix `test_invalid_maintenance_type`** — maintenance_type accepts any string, should be enum-validated
