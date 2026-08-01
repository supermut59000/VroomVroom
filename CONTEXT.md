# VroomVroom — Vision & Technical Context

This file is meant to be fed to an AI at the start of a new session to restore full context.
Last updated: 2026-08-01

**Reference docs:** [docs/architecture.md](docs/architecture.md) — endpoints, schemas, services, formulas | [docs/gap-analysis.md](docs/gap-analysis.md) — improvements & new ideas | [docs/TODO.md](docs/TODO.md) — prioritized checklist

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
- **TSC is strict in production**: `bun run build` runs `tsc -b && vite build`. Unused imports/variables are errors. Always run **`npm run build`** (or `npx tsc -b`) before committing — **not** `npx tsc --noEmit`: `tsconfig.json` is a solution file (`"files": []` + `references`), so `--noEmit` compiles zero files and passes on code that fails the real build.
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
- **ConsumptionChart**: L/100km per fill-up over time (line). Backend computes with partial-fill accumulation. Always plots **raw measured** values (no normalisation — user explicitly rejected the normalised view). For FlexFuel vehicles, the line is split into two by the segment's `e85_fraction > 0.5`: green = E85 segments, orange = Essence segments. Each line gets its own distance-weighted average reference line. Non-FlexFuel uses the backend's `average_consumption`. Subtitle format matches PriceChart: `Essence X L/100 · E85 Y L/100`. Always-visible "Dernier plein : X L/100 (date · fuel)" line below the subtitle removes the need to tap the rightmost dot; `activeDot` bumped to r=8 with 2px stroke for fat-finger taps. **Important attribution rule (db17cb5)**: `e85_fraction` on a data point is the fraction of E85 in fuel added at the **previous** Plein (lagged by one segment), because that's the fuel that was actually burned during the trip. The first E85 Plein closes a segment of Essence consumption, not E85.
- **PriceChart**: €/L per fill-up over time (line). For FlexFuel vehicles (`splitByFuelType=true` when a conversion exists and ≥ 2 distinct fuel types in history), renders **one line per fuel_type** with a colored dot + its own liters-weighted average reference line. Single-line mode otherwise.
- **MonthlyCostChart**: stacked bars fuel + maintenance per month. Toggle: €/mois ↔ €/100km. Both modes show 3-month projection as faded bars (avg of last 3 months). Custom tooltip shows each component + a **Total** line. €/100km moyenne is correctly weighted: `Σ cost_completed_months / Σ distance_completed_months × 100` (NOT an average of monthly ratios — past bug).
- **DistanceChart**: km per month (bar) + projected annual km badge. **Gap months are filled**: when two adjacent fill months are non-contiguous (no fills between), the total km between them is spread uniformly across the missing months. No more fake single-month spike on a resuming month.
- **OdometerChart** (`charts/OdometerChart.tsx`): absolute odometer progression line + dotted projection. Reference line + badges shown when `vehicle.insurance_km_limit` is set (and `insurance_unlimited` is false). Without a limit, still useful as a progression chart with 12-month projection. Uses **allEntries** (never date-filtered). Replaces the old `InsuranceKmChart` (now deleted).
- **StationsMap**: clusters GPS fill points within 100m radius, Leaflet map.
- **FlexfuelRentabilityChart**: cumulative savings line vs kit cost reference line. If break-even not reached: dotted projection line extending at `monthly_average_savings` rate until kit cost is hit. Badge shows projected break-even month. Monthly savings bar chart.
- **BlendCalculator** (`frontend-react/src/components/flexfuel/BlendCalculator.tsx`): in-graphs popup, only for FlexFuel vehicles. See dedicated section below.

#### Insurance km calculation (mirrors backend exactly)
```
current_limit = insurance_km_limit + floor(years_since_start_date) × annual_increase
insurance_km_remaining = current_limit − last_odometer_reading
```
The limit is a **cumulative total odometer threshold**, not a per-year quota reset each year.

`OdometerChart.tsx` projection: uses max odometer per month (same grouping as DistanceChart), then computes consecutive diffs for the **last 3 completed months** (excludes the current partial month). Projects forward at that avg rate until limit hit, capped at 36 months (or 12 if no limit set). Uses `allEntries` (never date-filtered) so the base odometer is always correct.

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

**Tank state computation — exact fill-to-fill method** (rewritten 2026-05-27, mirrors EthanolHistoryChart):

The previous method used `avgL100km` to *estimate* fuel burned between fills and forced `litersInTank = tankCapacity` on every Plein. When actual trip consumption diverged from the global average, the missing liters became 0%-ethanol "ghost fuel" that biased the tank % downward by ~5pp on every full fill. Replaced with the exact method below.

```
Sort entries by (fueling_date, odometer_reading, is_full_tank ASC, id)
  ← is_full_tank ASC puts Partiel before Plein at the same stop, so a booster
    paired with a top-up at the same pump gets accumulated INTO the Plein's
    composition rather than leaking into the next segment.

Group consecutive entries sharing (date, odometer) into one logical "stop".
  ← E85 8.64 L Plein + Essence 5.72 L Partiel at the same pump = one stop with
    accLiters = 14.36 L and accEthLiters = 0.572 + 7.344 = 7.92 L

ethFraction = null            ← running tank ethanol fraction (0..1)
accLiters, accEthLiters = 0   ← accumulator between two Plein stops

for each stop in physical order:
  if stop is Plein (any entry in the group has is_full_tank=true):
    if ethFraction is null:                    # very first Plein since conversion
      ethFraction = accEthLiters / accLiters   # tank composition = added composition
    elif accLiters >= tankCapacity:             # added ≥ a full tank → old fuel displaced
      ethFraction = accEthLiters / accLiters
    else:                                       # mix remaining old fuel + new fill
      remainingOldFuel = tankCapacity - accLiters
      totalEth = ethFraction × remainingOldFuel + accEthLiters
      ethFraction = min(totalEth / tankCapacity, 1)

    accLiters, accEthLiters = 0                 # reset accumulators

  # Partiel-only stops: just accumulate, they'll fold into the next Plein

return { litersInTank: tankCapacity, ethanolLiters: ethFraction × tankCapacity, lastOdo: lastPleinOdo }
```

**Key properties:**
- No `avgL100km` dependency: between two Plein stops, the sum of liters added IS the fuel burned. Exact, not estimated.
- Order of partial vs full at the same odometer doesn't matter — they're merged into one stop's accumulator before the Plein triggers the calculation.
- Trailing Partiels after the last Plein get absorbed by the next Plein. Rare edge case: if history ends on a lone Partiel, the returned state reflects the last Plein (the Partiel is ignored until the next full fill is logged).

**Ethanol fractions used** (fixed constants):
```
e85       → 0.85   (E85 at French pumps varies 60–85% seasonally; 85% is the conservative upper bound)
essence   → 0.10   (SP95-E10 is the default French unleaded since 2009 — UPDATED 2026-05-27 from 0.05)
e10       → 0.10   (dilutant selected at recommendation time)
sp95      → 0.05   (only used as dilutant selector option, not as fuel_type in history)
diesel / gpl / electrique / hybride → 0.00
```

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

**Data**: one point per logical "stop" that contains at least one `is_full_tank=true` entry. Uses the exact fill-to-fill method (see BlendCalculator section above) — same algorithm, same `ETHANOL_FRACTION` constants. No `avgL100km` dependency.

**Reference lines**:
- Teal dashed: `target_ethanol_pct` (70% default)
- Orange dashed: `target + tolerance` and `target - tolerance` (±5% default)

**Gotcha — `tank_capacity` should match real physical capacity** (réservoir + réserve):
- A Corsa E is listed as 45 L but can physically hold ~50 L (the warning light comes on with ~5 L left)
- With the new method, if the user fills more than `tank_capacity` between two Plein stops (e.g. 50 L pumped but capacity is set to 45), the algorithm assumes old fuel is fully displaced (`accLiters >= tankCapacity` branch). The previous Plein's ethanol contribution is lost, biasing the result toward the just-added composition.
- Fix: set `tank_capacity` to the observed fill-to-click-off value from near-empty (e.g. 50 L for a Corsa E).

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
- **Position GPS envoyée à un tiers (routage)**: depuis 2026-08-01, les recherches de stations envoient les coordonnées à `router.project-osrm.org` (projet OSRM/FOSSGIS). Atténué : l'appel passe par le backend, donc OSRM voit l'IP du serveur et non celle du téléphone. Suppression complète possible sans changement de code en pointant `ROUTING_URL` vers un OSRM auto-hébergé.
- **Pas de rate limit sur `/routing/matrix`**: cohérent avec l'absence de rate limiting ailleurs ; à noter que ce proxy est un amplificateur sortant vers un service public tiers.

---

## Session log — 2026-08-01

### Temps de trajet réel + carte dans StationPricesDialog

**Problème constaté sur le terrain** : la liste des stations n'affichait que la distance à vol d'oiseau. Une station annoncée « proche » était de l'autre côté d'une montagne — plus d'1 h de route au GPS. Et aucun moyen de voir où sont réellement les stations.

- **Backend — nouveau service de routage** : `POST /api/v1/routing/matrix` (`{origin, destinations[]}` → `{legs[], provider, cached}`). `RoutingService` interroge le service `table` d'un serveur **OSRM** (une seule requête pour toutes les stations, renvoie distance ET durée). Défaut = serveur public `router.project-osrm.org` (sans clé, usage raisonnable) ; `ROUTING_URL` dans `.env` permet de pointer vers un OSRM auto-hébergé plus tard **sans changement de code**.
- **Cache par paire origine/destination** (pas par requête), TTL 6 h, coords arrondies à 4 décimales (~11 m) : changer de carburant ou de rayon ne redemande que les stations réellement nouvelles, et une dérive GPS de quelques mètres retombe sur le cache. Plafond 5000 entrées. **Les échecs ne sont jamais mis en cache** — une panne du fournisseur ne doit pas effacer les distances pendant 6 h.
- **Jamais d'erreur 500** : fournisseur injoignable ou station non routable → `legs` à `null`, le frontend retombe sur le vol d'oiseau (explicitement étiqueté « à vol d'oiseau » dans l'UI, pas de mensonge silencieux).
- **Frontend** : hook `useStationRoutes` (React Query, staleTime 6 h, `retry: false`). Chaque ligne affiche `12,4 km · 18 min` par la route. Badge ⚠ **détour** quand route/vol d'oiseau ≥ 1.8 (le cas montagne), avec le détail en tooltip.
- **Tri** : le bouton bascule prix/distance devient un Select à 3 modes — prix, distance, **temps de trajet**. Les stations non routables tombent en bas du tri par temps plutôt que de passer pour instantanées.
- **Onglets Liste / Carte** : nouvelle vue carte (`StationsMapView.tsx`) réutilisant `@/components/ui/map` (MapLibre, déjà présent pour `StationsMap`). Marqueur bleu = origine, marqueurs stations avec label prix, vert = moins cher, jaune = favori. Popup : nom, prix, distance/temps route, lien **« Y aller »** (Google Maps directions, ouvre l'app GPS native sur mobile). La carte n'est montée que quand l'onglet est actif (MapLibre supporte mal un conteneur caché) et refit ses bounds via `map.fitBounds` quand l'origine ou la liste change.
- **Dépendance backend ajoutée** : `httpx==0.28.1` (déjà utilisé en tests). **Rebuild backend nécessaire.**
- **Tests** : 18 tests (`test_routing.py`) — mapping des legs sur le bon index (colonne 0 = origine, à ne jamais confondre avec une station), cache partiel (n'interroge que les nouvelles stations, et le résultat atterrit dans le bon slot), dérive GPS, panne fournisseur, non-mise-en-cache des échecs, bornes de validation, éviction. Suite backend : **82 → 100 tests**.
- **Non fait volontairement** : pas de routage dans `NearbyStationsList` (dialogue d'ajout de plein) — on y est déjà à la station, le temps de trajet n'y sert à rien et ça ferait un appel OSRM à chaque ouverture.

### Limite de 25 stations → pagination complète

La liste ne demandait qu'**une page de 25** à data.economie.gouv.fr, or l'API
renvoie les enregistrements dans un ordre **arbitraire** (pas par distance) :
un rayon de 50 km autour de Nieppe contient **288 stations**. On triait donc
par prix un sous-ensemble aléatoire de 25 — le badge « moins cher » ne voulait
rien dire aux grands rayons.

- Pagination par pages de 100 (plafond de l'API) jusqu'à `MAX_STATIONS = 300`.
- Backend : `MAX_DESTINATIONS` 50 → 300, et découpage automatique en lots de
  `ROUTING_MAX_BATCH` (95 par défaut) exécutés **en parallèle** — `osrm-routed`
  refuse par défaut les tables de plus de 100 coordonnées, origine comprise.
  La latence reste celle d'un aller-retour au lieu de s'additionner.
- Un lot en échec n'invalide pas les autres (test dédié).

### Support Valhalla — `ROUTING_PROVIDER=osrm|valhalla`

Valhalla est **tuilé** : il ne charge que les tuiles utiles, donc la RAM ne
dépend plus de la taille du jeu de données (France servie en quelques Go contre
~16 Go pour OSRM, dont un `osrm-extract` à ~45 Go inatteignable ici).

- `/sources_to_targets` au lieu du `table` d'OSRM, et **distances en km à
  convertir en mètres** — piège d'unité couvert par un test dédié.
- Pas de colonne origine à sauter côté Valhalla (contrairement à OSRM) : test
  dédié aussi, sauter une colonne perdrait la première station.
- Stack autonome dans [deploy/valhalla/](deploy/valhalla/) — **volontairement
  hors du docker-compose VroomVroom** : l'utilisateur veut la réutiliser pour
  d'autres projets (GPS maison). Expose aussi `/route`, `/isochrone`,
  `/trace_route`, `/optimized_route`.
- **Piège documenté** : couverture partielle (une seule région) → le moteur
  rabat les points hors zone sur la route la plus proche de SON jeu de données
  et renvoie un temps plausible mais faux. Pour rouler partout en France :
  construire la France entière.

### Bug corrigé au passage — badge « moins cher » sur la mauvaise station

`isCheapest` valait `idx === 0`, mais le comparateur fait remonter les **favoris** en tête de tous les tris. Une station favorite à 1.899 €/L affichée avant une autre à 1.689 recevait donc le badge vert « moins cher » — et depuis la nouvelle carte, aussi le marqueur vert. Mensonge d'affichage qui pousse vers la station la plus chère, exactement l'inverse du but du dialogue.

- Tri et « moins cher » extraits dans `src/lib/station-sort.ts` (pur, testable) : `cheapestPrice()` = minimum réel des prix connus, `compareStations()` = favoris d'abord puis prix/distance/temps.
- `cheapestPrice` renvoie `null` en dessous de 2 prix connus — une station seule n'est « la moins chère » de rien.
- Le badge ne dépend plus du mode de tri : la moins chère reste signalée même en tri par temps, ce qui est plus utile et surtout vrai.
- 9 tests vitest (`station-sort.test.ts`), dont le scénario exact du bug (favori cher en tête ≠ moins cher). Frontend : 15 → 24 tests.

---

## Session log — 2026-07-17

### ConsumptionChart : Moyenne de la période affichée + Bilan de période (KPI)

**ConsumptionChart fix**: en mode ligne unique, le sous-titre « Moyenne » et la ligne rouge utilisaient `stats.average_consumption` (moyenne globale all-time) alors que les points affichés respectent le filtre de dates — la ligne pouvait donc être sous tous les points (7.35 global vs pleins d'été E85 à 8.7–10.7). Corrigé : moyenne pondérée distance calculée sur les points affichés (même méthode que le mode split). Prop `avgConsumption` supprimée (chart + FuelCharts). Sans filtre, identique à la moyenne backend.

**Nouveau — Bilan de période** (bouton « Bilan » dans VehicleDetailsDialog, à côté d'Historique) :
- **Backend**: `GET /vehicles/{id}/period-stats?start_date=&end_date=` → `VehiclePeriodStats`. `VehicleService.get_period_stats`: entrées bornées aux dates, distance = span odomètre des entrées de la période, conso pondérée distance ancrée au premier Plein DANS la période, prix moyen pondéré litres + breakdown par carburant, maintenance de la période, économies E85 vs 100% E10 (même formule que la rentabilité, bornée aux dates, part E85 des litres, compteur skipped sans prix E10), €/100km, €/jour (carburant+maintenance), km/jour. 422 si end < start. 5 tests (`TestPeriodStats`).
- **Frontend**: `PeriodStatsDialog.tsx` — 2 date inputs (défaut 30 derniers jours) + presets 30 j / 3 mois / 1 an / Année en cours. KPI en 3 blocs choisis par l'utilisateur : Essentiels (distance + km/j, conso, carburant € + pleins·L, prix moyen €/L avec détail par carburant), carte verte Économies E85 (montant, mix % E85, warning pleins ignorés), Coûts avancés (€/100km, €/jour, maintenance € + interventions, période en jours). Hook `usePeriodStats` (`['periodStats', id, start, end]`), activé seulement dialog ouvert + dates valides.
- Idée écartée à ce stade : comparaison vs période précédente (deltas ↑↓) — proposée, non retenue par l'utilisateur pour l'instant.

---

## Session log — 2026-07-13 (suite — flow audit & fixes)

### Pump-flow audit: 4 fixes + frontend test suite

Full /app-audit pass on the fill-logging pipeline. Findings were tracked in a temp FLOW_FIXES.md, deleted after deploy (all fixed & verified). Summary:

1. **Confirm now honest**: confirming "compteur inférieur" sends `allow_odometer_decrease=true` end-to-end (dialog → hook → offline queue). Backfilling an older fill works.
2. **Queue poison pills**: sync distinguishes permanent 4xx (dropped + toast naming the lost entry) from transient failures (retried). Sync success surfaces a toast + invalidates fuel/vehicle caches.
3. **Server-down ≠ data loss**: a create that fails on transport (timeout/DNS/refused while `navigator.onLine` is true) is queued instead of dropped.
4. **E10 auto-capture** dedup guard requires the price list to be loaded.
5. **Prod auth ambiguity**: frontend build has no `VITE_API_KEY` → prod API_KEY must be empty → API open behind the proxy. **Risk accepted by user (LAN-only), do not change, do not re-propose.**
6. **Frontend tests exist now**: blend math extracted to `src/lib/blend-math.ts` (pure module), 15 vitest tests in `blend-math.test.ts` (singularity regression, renderer contract sweep, weighted-vs-mean discrimination, booster tiebreaker, planner cumulative odo). `npm run test`. To run in CI alongside backend pytest when Forgejo Actions is wired: `cd frontend-react && npm ci && npm run test && npm run build`.

---

## Session log — 2026-07-13

### BlendCalculator crash on pure-E85 tank (2nd vehicle)

**Bug**: opening the Mélange E85 dialog crashed the whole app ("Cannot read properties of null (reading 'toLocaleString')") for a vehicle whose post-conversion history is 100% E85. `computeThresholds` has a degenerate early return when `ethFraction ≈ 0.85` (both km formulas divide by `ethFraction − 0.85`): it returned `{odoB: null, odoBNow: false}`, and card B's renderer discriminated on `odoBNow` then force-unwrapped `odoB!`. The first vehicle's blend history never hits exactly 0.85; a second vehicle running pure E85 does — hence "only with 2 vehicles".

**Fix** (`BlendCalculator.tsx`): degenerate case now returns `odoBNow: true` (a pure-E85 tank is above any target < 85% → dilution applies now); card B render null-guards `odoB` (`—` fallback) instead of `!`. **Containment** (`BlendCalculatorDialog.tsx`): dialog content wrapped in `ErrorBoundary` — a future calculator crash degrades the dialog, not the dashboard (same pattern as FuelCharts per-chart boundaries).

Swept the rest of the frontend for the same pattern: remaining `!` unwraps (OdometerChart `remaining!`, VehicleDetailsDialog ranges) are transitively guarded — `Math.round(null)` renders 0 but those paths are gated by the section's `range_km != null` guard. `/app-audit` skill updated with this bug class (compute/render shape mismatch, "only with N entities" heuristic, blast-radius rule).

---

## Session log — 2026-07-05

### Math audit — weighted averages, stale-fix ports, break-even honesty

Full math sweep of backend services + chart/calculator frontend. Seven bugs fixed, two features added. 82 backend tests pass (was 49/50).

**Backend fixes:**
- `get_fuel_statistics_by_vehicle` (`fuel_service.py`): `average_consumption` was a **simple mean** of segment values — the exact bias fixed in seasonal stats on 2026-05-04 but never ported to the headline number. Now distance-weighted (`Σ seg_liters × 100 / Σ seg_km`). Also anchors at the **first full tank** (a leading Partiel can't anchor a segment — its pseudo-segment polluted the average). Same anchor fix in `get_consumption_history` (display-only points until first Plein) and `_compute_seasonal_consumption` (the first-full drop now applies even without `from_date`).
- `cost_per_km` (`vehicle_service.py`): was `total_fuel_cost / (last_odo − initial_odometer)` — km driven before the first logged fill diluted the ratio. Now divides by fill-to-fill distance (first→last entry). `total_distance` (display) unchanged.
- Insurance limit: `years_elapsed` clamped at 0 (future start date was *shrinking* the limit).
- `monthly_average_savings` (`flexfuel_service.py`): averaged only months **containing fills** — a skipped month inflated the rate and pulled break-even too close. Now `completed_savings / calendar_months_since_conversion`.
- `next_maintenance_date` stat: `min()` over all entries returned stale superseded dates; now latest-entry-per-type first (matches frontend reminder logic).
- Maintenance create: rejects odometer below vehicle `initial_odometer`; endpoint now maps `ValueError` → 422 (was swallowed as 500).

**Frontend fixes:**
- `BlendCalculator.computeAvgConsumption`: the 8b37df4 sort fix (`is_full_tank ASC` tiebreaker) was never ported here — same-stop boosters could leak between segments. Also now distance-weighted + first-full anchored, matching backend.
- `simulateFutureFills`: `odo = fromOdo + (i+1) × intervalKm` used the *current row's* interval × row number — wrong km column when per-row −50/+50 overrides differ. Now a cumulative sum.
- `MonthlyCostChart` €/100km: first fill's cost was never counted (loop from i=1) — €/mois and €/100km disagreed on total spend. First fill's cost now lands in its month.
- `RefuelingPatternChart`: avg km between fills divided by all pairs including skipped (km ≤ 0) ones; now divides by valid segments.
- `use-maintenance-reminders`: one entry with both date and km triggers produced two badges; now one per type (overdue wins over upcoming, date-based preferred otherwise).

**Stale tests fixed** (both predated deliberate decisions):
- `test_invalid_maintenance_type` → free text is a feature (`maintenance_type_to_varchar.sql`); replaced with accept-custom-type + odometer-guard tests.
- `test_docs_no_auth_required` → Swagger is gated behind `DEBUG=True` since the security pass; test now asserts 200/404 based on `settings.DEBUG`.
- New regression tests: distance-weighted average (6.29 ≠ simple-mean 7.0), leading-partial anchor exclusion, `yearly_fixed_costs` roundtrip.

**Feature — E10 reference auto-capture** (`FuelAddDialog.tsx`, `NearbyStationsList.tsx`):
- `onSelect` now passes the station's full `StationPrices`; the dialog stores `prices.e10` in a ref. On saving an **E85 fill** for a FlexFuel vehicle, if no E10 reference exists for that date, one is POSTed automatically (`notes: "Auto — <station>"`) + info toast. Best-effort: failure never blocks the fill. Kills the manual E10 price logging chore.

**Feature — `yearly_fixed_costs`** (assurance, CT... €/an):
- New nullable Float on `vehicles` (alembic `d4e5f6a7b8c9`, + `init_database.sql`), Pydantic schemas, TS types, field in VehicleAdd/EditDialog (next to prix d'achat).
- `CostOfOwnershipSection`: fixed costs prorated over months owned, included in Coût total / Coût par mois / Coût par km / Projection annuelle, new donut slice "Frais fixes" (`--color-chart-fixed`, light+dark).

**Deploy note**: run `docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head` before deploying (new `yearly_fixed_costs` column).

**Known approximation (accepted)**: rentability counts only `fuel_type=E85` entries, each divided by the full overconsumption factor — Essence boosters burned in the blend are treated as burned at E10 rate, slightly overstating savings. Segment-level accounting would fix it; not worth the complexity for now.

---

## Session log — 2026-05-28

### Chart audit — clarity & consistency pass

Full sweep of every graph displayed in the app. Eight charts updated, one deleted, several long-standing logic bugs fixed.

**ConsumptionChart** (`charts/ConsumptionChart.tsx`):
- Was a single raw line for everyone. First attempt at FlexFuel split (commit `382a695`, reverted via the user not liking normalisation) → simply hid the two normalised lines and went raw measured, split by dominant fuel of the segment.
- **Attribution rule corrected** (`db17cb5`): a segment's measured consumption reflects the fuel burned (the one in the tank at the start, i.e. the *previous* Plein's added fuel), not the fuel just poured at the closing Plein. Backend now lags `e85_fraction` by one segment in both `get_consumption_history` and `_compute_seasonal_consumption`. The first E85 Plein closes a segment of Essence consumption — only the next one onwards counts as E85.
- Compact subtitle: `Essence X L/100 · E85 Y L/100` (matches PriceChart).
- Always-visible "Dernier plein : X L/100 (date · fuel)" line so user doesn't need to tap the rightmost dot. `activeDot` r=8 with 2px stroke for fat-finger taps.

**PriceChart** (`charts/PriceChart.tsx`):
- For FlexFuel vehicles (when a conversion exists), splits by `fuel_type` — one line per type with a liters-weighted average reference line. Prevents the meaningless saw-tooth a single line gave when mixing 0.79 €/L E85 with 1.85 €/L Essence.

**MonthlyCostChart** (`charts/MonthlyCostChart.tsx`):
- €/100km "Moyenne" was an average of monthly ratios — short-distance months gave 50–80 €/100km, inflating the figure. Fixed to `Σ cost_completed_months / Σ distance_completed_months × 100`.
- Custom tooltip shows each stacked component plus a **Total** line.

**DistanceChart** (`charts/DistanceChart.tsx`):
- A skipped fill month attributed its km entirely to the next month, producing a fake spike. Now spreads `total_km / gap_months` uniformly across missing months.

**RefuelingPatternChart** (`charts/RefuelingPatternChart.tsx`):
- "Pleins totaux", "Coût moy./plein", "Litres moy./plein" counted every entry (including partial boosters). Now built from stops closed by a full tank, with same-day boosters folded into the closing full's totals: a 5 L Essence + 40 L E85 booster pair = one plein at 45 L / combined cost.

**StationsMap, EthanolHistoryChart, FlexfuelRentabilityChart**: no logic changes; reviewed and confirmed correct.

**OdometerChart vs InsuranceKmChart**:
- `InsuranceKmChart.tsx` deleted — orphan, not imported anywhere. `OdometerChart` had absorbed its job (handles insurance limit + projection when `insurance_km_limit` is set, 12-month projection otherwise).

### Autonomie estimée — vehicle details

Long debug session resolving the "Mix réel cette saison" % and what the E10/E85 cards should mean.

**Backend `_compute_seasonal_consumption`** (`vehicle_service.py`):
- New `from_date` parameter. Caller passes `flexfuel.conversion_date` when a conversion exists. The seasonal buckets then ignore pre-conversion fills so the all-Essence pre-conversion data doesn't dilute the post-conversion E85 share.
- Fix: when `from_date` filters out the previous Plein, the first remaining entry could be a partial fill. Anchoring there would produce a fake first segment (51 L over only 198 km → bogus 26 L/100km, surfacing as a 171 km "ville" min range). Now drops entries until the first **full tank** on/after `from_date`.
- E10/E85 "if pure" projection: per-segment normalisation `e10 = measured / (1 + opc × e85_burned_fraction)`, distance-weighted, then `e85 = e10 × (1 + opc)`. Uses the *previous* Plein's E85 fraction (what was burned), same attribution rule as the chart.
- Min/max raw measured (not normalised) — matches the chart's data points.
- `e85_fraction` returned in `SeasonStats` is `e85_burned / total_liters` over the season.

**Frontend (`VehicleDetailsDialog.tsx`)**:
- "Sur E10" / "Sur E85" cards renamed "Si 100% Essence" / "Si 100% E85" with a "Projection si un plein 100% pur :" caption above. Makes the hypothetical-projection nature explicit (different from the chart's "raw measured per fuel" metric).
- 4-season grid: removed the per-card min–max range numbers (X–Y km). 2x2 layout on mobile.
- One-shot redesign with hero card + gradient range bar + mix progress bar was reverted on user feedback — kept the original compact text-based UI.

**Three reading layers** in the autonomy section, each clearly labelled:
1. Headline range (`~568 km / 7.9 L/100`): what your tank actually gave this season with the real fuel mix.
2. Projection cards (`Si 100% Essence`/`E85`): hypothetical, applies surconsommation to estimate one tank of pure X.
3. ConsumptionChart "Moyenne Essence/E85": raw measured per dominant-fuel fill, all time since data exists.

**Commits**: `730e14a` (chart audit pass), `52680b6` (Fragment fix — Recharts doesn't see Line children inside `<>...</>`), `382a695` (ConsumptionChart back to raw split), `3b41340` + `922be85` (Autonomie redesign + revert), `6e81417` (conversion_date filter), `802d36a` (anchor at first Plein), `731d6b6` (raw split for autonomy) + `ce1ba5f` (back to normalised projection labelled "Si 100%"), `f001700` (Dernier plein line + fat-finger dots), `db17cb5` (attribute segment to previous Plein's fuel).

---

## Session log — 2026-05-27

### Consumption pipeline — deterministic sort + exact fill-to-fill rewrite

Three connected bugs found while investigating why `MonthlyCostChart` (€/100km mode) showed ~5 €/100km for FlexFuel stops when real cost was ~7 €/100km, and why `EthanolHistoryChart` drifted from ~85% down to ~67% even on pure-E85 fills.

**Bug 1 — MonthlyCostChart €/100km dropped Essence booster costs** (`frontend-react/src/components/charts/MonthlyCostChart.tsx`):
- Loop used `if (distance <= 0) continue` which skipped BOTH the distance contribution AND the cost when two entries shared the same odometer.
- Fix: split the guard. Distance gate still applies (`if (distance > 0) add to monthlyDistance`), but cost is always added to `monthlyFuelCost`. Same-odo booster (5L Essence @ 2€/L) now correctly counts in the numerator.

**Bug 2 — EthanolHistoryChart "ghost fuel" drift** (`frontend-react/src/components/charts/EthanolHistoryChart.tsx`):
- Algorithm used global `avgL100km` to estimate fuel burned between fills, then forced `litersInTank = tankCapacity` on every Plein. The gap between actual and estimated consumption was filled with implicit 0%-ethanol "ghost fuel", systematically biasing every full fill's % downward by ~5pp.
- Fix: rewrote with exact fill-to-fill method. Between two Plein stops, sum of liters added = fuel burned. Group entries sharing (date, odometer) as one logical stop. Sort tiebreaker is now `(date, odometer, id)`.
- Also: changed `essence` ethanol fraction from 0.05 to 0.10 (French SP95-E10 is the standard unleaded since 2009).

**Bug 3 — Backend non-deterministic sort for FlexFuel stops** (`backend/app/services/fuel_service.py`, `vehicle_service.py`):
- `get_fuel_statistics_by_vehicle`, `get_consumption_history`, `_compute_seasonal_consumption` all used the fill-to-fill pattern (accumulate Partiels until next Plein triggers consumption calc), but ordered only by odometer (or `(date, odometer)`). When E85 (Plein) and Essence (Partiel) shared the same odometer, the insertion order determined whether the booster joined the current segment or leaked into the next, inflating the next segment's L/100km non-deterministically.
- Fix: all three methods now order by `(fueling_date, odometer_reading, is_full_tank ASC, id)`. The `is_full_tank ASC` puts Partiel (false) before Plein (true) at the same stop, so the booster is always accumulated INTO the Plein's calc.

**Tier 2 — Ported exact fill-to-fill method to BlendCalculator** (`frontend-react/src/components/flexfuel/BlendCalculator.tsx`):
- `computeTankState` rewritten to mirror EthanolHistoryChart. Removed `avgL100km` parameter — the function no longer estimates between-fill consumption. Returns state at the last Plein. The BlendCalculator's *forward-looking* logic (km until odoA/odoB, blend recommendations) still uses `avgL100km` for projections, but the historical tank state is now exact.

**Tier 3 — Sort polish on remaining charts**:
- `RefuelingPatternChart.tsx`: `(odometer, date, id)` tiebreakers added.
- `FuelCharts.tsx` `filteredEntries`: added `odometer` to the `(date, id)` sort.

**Concrete impact on user's data**: ethanol % chart values shifted up by ~5pp across the board (ghost fuel removed). FlexFuel stop on 25/05/2026 went from 67% (wrong) to 72.9% (correct, matching real physics of 50 L tank with 14.36 L of mixed fuel added at known composition).

**Commits**: `e450942` (MonthlyCostChart), `1219500` (EthanolHistoryChart + essence 10%), `8b37df4` (backend sort + BlendCalculator port + sort polish).

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
- **CI/CD on Forgejo Actions** — pytest + tsc/build on push, deploy on green (user will wire this up)
- **Rentability segment-level accounting** — count Essence boosters at blend overconsumption (see 2026-07-05 known approximation)
