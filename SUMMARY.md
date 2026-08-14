# VroomVroom — App Summary & Session History

Last updated: 2026-08-10

**Reference docs:** [docs/architecture.md](docs/architecture.md) — full endpoint/schema/service reference | [docs/gap-analysis.md](docs/gap-analysis.md) — improvements & new ideas | [docs/TODO.md](docs/TODO.md) — prioritized checklist

---

## 2026-08-14 — Audit fixes and Valhalla verification

- Fixed selected fuel types being overwritten on non-FlexFuel submissions.
- Added initial-odometer invariants, deterministic same-stop latest-fill ordering, and retry-safe handling of auth/rate-limit failures in the offline queue.
- Clarified that decreasing odometers are historical corrections, not modeled odometer resets, and labelled period €/100 km as spending over observed distance.
- Refreshed backend/frontend dependencies; dependency audits are clean.
- Verified Valhalla at `192.168.25.25:8002` directly and through `RoutingService`.
- Tests: 119 backend, 27 frontend; production build passes; no migration.

---

## 2026-08-10 — Offline/idempotency resilience

- A single `OfflineProvider` owns queue state; retries are delayed and cannot double-submit from multiple hook instances.
- `fuel_entries.client_request_id` provides UUID-based idempotency while preserving legitimate E10-partial + E85-full entries at the same odometer.
- Fuel/maintenance edit validation, missing-batch stats fallback, and HTTP 503 database health reporting added.
- Deploy migration: `alembic upgrade head`. Tests: 115 backend, 25 frontend.

---

## What the App Does

VroomVroom is a self-hosted vehicle management web app. It tracks vehicles, fuel consumption, maintenance, and costs. It's designed to be used on a phone at the gas station (PWA, installable, works offline).

### Core Features

**Vehicle Management**
- CRUD with soft delete (archive) and force delete
- Dashboard cards showing: consumption, distance, fuel cost, insurance km tracking
- Maintenance reminder badges (overdue = red, upcoming = orange) on each card
- Filter by fuel type, active/inactive status
- Batch stats endpoint to avoid N+1 queries on the dashboard

**Fuel Tracking**
- Log fuel entries with: liters, price/L, odometer, station, location, date, notes
- Full tank and partial fill support
- Automatic consumption calculation (L/100km) using the "fill-to-fill" method
- Partial fill accumulation: liters are accumulated until the next full tank
- Consumption history chart (Recharts line chart)
- CSV export with French formatting (semicolons, UTF-8 BOM, French headers)

**Maintenance Tracking**
- 10 types: vidange, pneus, freins, batterie, filtre_air, filtre_habitacle, distribution, bougie, ct, autre
- Each entry tracks: date, cost, odometer, provider, location, notes
- Next maintenance fields: next_maintenance_date, next_maintenance_odometer
- Reminder system checks for overdue (past date or exceeded km) and upcoming (within 30 days or 1000 km)
- CSV export

**Station Price Map**
- Fuel pump icon in the header opens a global station price dialog (no vehicle required)
- Auto-requests GPS on open, adjustable radius: 2 / 5 / 10 / 20 / 50 km (default 5km)
- Fuel type selector: E10, SP95, SP98, Diesel, E85, GPL
- Toggle sort: by price (cheapest first, green "moins cher" badge) or by distance
- Each row shows the selected fuel price prominently + all other available prices inline
- **City search**: native `<datalist>` autocomplete from `geo.api.gouv.fr/communes` (param `nom=` for text, `codePostal=` for digits). Selecting a city overrides GPS as search origin. Badge shows city name or "GPS actif".
- **Known name override**: haversine < 150m match against `useGlobalStationHistory` (all entries with GPS + station_name across all vehicles). Shows user's saved name + `BookMarked` icon instead of raw API adresse.
- Data source: data.economie.gouv.fr API (`prix-des-carburants-en-france-flux-instantane-v2`), updated every 10 minutes
- API field notes: no `name` field — uses `adresse` as station name; prices are doubles (€/L); geo field is `geom` (geo_point_2d → `{lat, lon}`)
- In FuelAddDialog: GPS capture shows a "Stations proches" panel (fixed 5km) — click any station to auto-fill station name, location, and price/L
- FuelEditDialog also has station autocomplete, location, GPS capture, and nearby stations panel

**FlexFuel E85 Conversion Tracking**
- Record FlexFuel conversion per vehicle (date, kit cost, overconsumption %, brand, installer)
- Fuel entries support E85 type — auto-fills from last fill type for converted vehicles
- Global E10 reference prices: log the E10 price you see at the station over time
- Rentability calculation per E85 fill: compares actual E85 cost vs what E10 would have cost
  - Equivalent E10 liters = E85 liters / (1 + overconsumption%)
  - Savings = (equivalent E10 liters × E10 ref price) - actual E85 cost
  - Uses the most recent E10 price on or before each fill date
- Charts (in graphs popup):
  - Summary cards: total savings, kit cost, break-even date or remaining, monthly average
  - Cumulative savings line chart with kit cost threshold (red dashed line)
  - Monthly savings bar chart
- Y axis auto-scales to max(kit cost, total savings) × 1.1
- `monthly_average_savings` excludes current (incomplete) month — avoids dragging break-even projection too far
- **BlendCalculator** (in graphs popup): recommends X L dilutant (E10 or SP95) + Y L E85 to maintain `target_ethanol_pct` in tank. French pump minimum 5L enforced. Configured on conversion record (`target_ethanol_pct`, `ethanol_tolerance_pct`).

**Charts & Analytics (in graphs popup)**
- Consumption chart (L/100km per fill), price chart (€/L over time)
- Monthly cost chart: stacked bar — fuel (blue) + maintenance (orange) per month. Maintenance spread. Toggle €/mois ↔ €/100km. Current month excluded from averages.
- Distance chart: monthly km bars — uses **max odo per month, diff between consecutive months**. Avg + projected annual use completed months only.
- Stations map: Leaflet map of past fill locations with GPS, clustered within 100m radius
- FlexFuel rentability charts (for converted vehicles)

**Cost of Ownership (in VehicleDetailsDialog)**
- `CostOfOwnershipSection.tsx`: donut chart (achat / carburant / maintenance breakdown) + stat cards
- `allInCostPerKm` = (purchase + fuel + maintenance) / total_distance
- `costPerMonth` = (fuel + maintenance) / months_owned (no purchase amortization)
- `projectedYearly` = costPerMonth × 12

**Dark Mode**
- Toggle in header (Sun/Moon icon)
- 3 modes: system, light, dark
- Uses `next-themes` with CSS class strategy
- Dark CSS variables already defined in index.css
- Preference persisted in localStorage (`vroomvroom-theme`)

**PWA / Offline**
- Service Worker with multiple caching strategies:
  - API requests: network-first with 4s timeout, fallback to cache
  - Map tiles: cache-first
  - Vite hashed assets: cache-first (immutable)
  - HTML navigation: network-first, fallback to cached index.html
- App is installable on mobile (manifest.json)
- Offline reads and writes work

**API Authentication**
- Backend protected by API key (`X-API-Key` header)
- Configured via `API_KEY` in `.env` (empty = auth disabled)
- Health endpoint and docs are public (no auth required)

---

## Tech Stack Details

### Backend
- **Python 3.11+** with **FastAPI**
- **SQLAlchemy 2.0** ORM with relationship cascades
- **Pydantic 2.x** for validation (field_validator, mode='before')
- **MariaDB/MySQL** database
- **Uvicorn** ASGI server
- Centralized enums in `app/core/enums.py` (single source of truth for FuelType)
- Service layer pattern: endpoints -> services -> ORM
- ForeignKey constraints on fuel_entries and maintenances
- Bidirectional relationships with `cascade="all, delete-orphan"`

### Frontend (React)
- **React 19** + **TypeScript**
- **Vite** build tool
- **Tailwind CSS 4** + **shadcn/ui** components
- **TanStack React Query** for data fetching and caching
- **Recharts** for consumption charts
- **next-themes** for dark mode
- **lucide-react** for icons
- **date-fns** for date formatting

### Tests
- **pytest** + **httpx** TestClient
- SQLite in-memory database (session-scoped setup, per-test transaction rollback)
- 119 tests total (as of 2026-08-14): vehicles, fuel entries (incl. distance-weighted average, partial-anchor, idempotency, initial-odometer, and same-stop latest regressions), maintenances, flexfuel, auth, routing
- Frontend: 27 vitest tests over pure functions in `src/lib/` (blend-math, station-sort, vehicle-stats fallback, offline queue status classification)
- Run inside Docker with live source: `docker compose run --rm -v ./backend:/app backend sh -c "pip install -q pytest pytest-asyncio httpx && python -m pytest tests/ -v --tb=short"`

---

## Architecture

```
VroomVroom/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, routes
│   │   ├── api/
│   │   │   ├── deps.py             # get_db + verify_api_key
│   │   │   └── v1/
│   │   │       ├── api.py          # Router with auth dependency
│   │   │       └── endpoints/
│   │   │           ├── vehicles.py       # incl. /stats/batch
│   │   │           ├── fuel_entries.py
│   │   │           ├── maintenances.py
│   │   │           └── flexfuel.py       # Conversion, E10 prices, rentability
│   │   ├── core/
│   │   │   ├── config.py           # Settings from .env
│   │   │   ├── database.py         # SQLAlchemy engine/session
│   │   │   └── enums.py            # FuelType enum (single source)
│   │   ├── models/                 # SQLAlchemy models with FK + relationships
│   │   │   ├── vehicle.py
│   │   │   ├── fuel_entry.py
│   │   │   ├── maintenance.py
│   │   │   ├── flexfuel_conversion.py
│   │   │   └── e10_reference_price.py
│   │   ├── schemas/                # Pydantic v2 schemas
│   │   ├── services/               # Business logic
│   │   └── utils/
│   │       ├── calculations.py
│   │       └── logger.py
│   └── tests/
│       ├── conftest.py             # Fixtures, SQLite setup, TestClient
│       ├── test_vehicles.py
│       ├── test_fuel_entries.py
│       ├── test_maintenances.py
│       └── test_auth.py
├── frontend-react/
│   ├── src/
│   │   ├── App.tsx                 # ThemeProvider wrapper
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── layout/Header.tsx   # Dark mode toggle
│   │   │   ├── vehicles/VehicleCard.tsx  # Maintenance reminder badges
│   │   │   ├── fuel/FuelViewDialog.tsx   # CSV export button
│   │   │   ├── maintenance/MaintenanceViewDialog.tsx  # CSV export button
│   │   │   ├── flexfuel/FlexfuelConversionDialog.tsx  # Create/edit conversion
│   │   │   ├── flexfuel/E10ReferencePriceDialog.tsx   # Global E10 prices
│   │   │   ├── fuel/NearbyStationsList.tsx            # Inline station list (in Add/Edit)
│   │   │   ├── fuel/StationPricesDialog.tsx           # Standalone station price search
│   │   │   ├── charts/FlexfuelRentabilityChart.tsx    # Savings charts
│   │   │   ├── charts/MonthlyCostChart.tsx            # Stacked fuel+maintenance per month
│   │   │   └── charts/DistanceChart.tsx               # Monthly km + projected annual
│   │   ├── hooks/
│   │   │   ├── use-vehicles.ts     # Batch stats + initialData pattern
│   │   │   ├── use-fuel-entries.ts
│   │   │   ├── use-maintenances.ts
│   │   │   ├── use-maintenance-reminders.ts  # Reminder logic
│   │   │   ├── use-flexfuel.ts     # Conversion, E10 prices, rentability
│   │   │   └── use-nearby-stations.ts  # prix-carburant API hook
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── csv.ts              # CSV export utility
│   │   └── types/
│   └── public/
│       └── sw.js                   # Service Worker
├── docker-compose.yml              # Dev (incl. local MariaDB)
├── docker-compose.prod.yml         # Prod (remote DB only)
└── CLAUDE.md                       # Full reference for AI
```

---

## What Was Done (Session of 2026-07-05)

### Math audit + fixes, E10 auto-capture, fixed costs

Full math audit of backend + charts. See CONTEXT.md session log for detail. Highlights:
- `average_consumption` is now **distance-weighted** everywhere (was simple mean on the headline stat); fill-to-fill segments anchor at the first **full** tank in all three backend methods and BlendCalculator.
- `cost_per_km` now uses fill-to-fill distance; FlexFuel `monthly_average_savings` now averages over **calendar** months since conversion (break-even projection no longer optimistic).
- BlendCalculator: sort-tiebreaker fix ported from backend; future-fills planner km column now cumulative.
- New: E10 reference price auto-captured from the selected nearby station on E85 fills; `yearly_fixed_costs` on vehicles feeding CostOfOwnership (donut slice "Frais fixes").
- Tests: 82 passing (two stale tests rewritten to match deliberate decisions: free-text maintenance types, DEBUG-gated Swagger).
- **Deploy**: `alembic upgrade head` required (new `vehicles.yearly_fixed_costs` column).

---

## What Was Done (Session of 2026-05-27)

### Consumption pipeline rewrite — exact fill-to-fill, deterministic sort

User flagged that `MonthlyCostChart` (€/100km mode) was reporting ~5 €/100km after FlexFuel conversion (expected ~7), and that `EthanolHistoryChart` had drifted from ~85% down to ~67% even on pure-E85 fills. Investigation surfaced three connected bugs in the consumption pipeline.

**Bug 1 — MonthlyCostChart dropped Essence booster costs** (`charts/MonthlyCostChart.tsx`):
- The €/100km loop did `if (distance <= 0) continue`, skipping both distance and cost when two entries shared the same odometer (typical FlexFuel stop: E85 Plein + Essence booster at same pump).
- Fix: split the guard — distance gate stays (`if (distance > 0)`), cost is always added. Same-odo booster cost now counts.
- Commit: `e450942`.

**Bug 2 — EthanolHistoryChart "ghost fuel" drift** (`charts/EthanolHistoryChart.tsx`):
- Old algorithm used global `avgL100km` to estimate fuel burned between fills, then forced `litersInTank = tankCapacity` on every Plein. When estimated consumption < actual, the gap was implicit 0%-ethanol "ghost fuel" — biasing every full fill ~5pp downward.
- Fix: rewrote with exact fill-to-fill. Between two Plein stops, sum of liters added = fuel burned (measured, not estimated). Group entries sharing (date, odometer) as one logical stop. Sort tiebreaker `(date, odometer, id)`.
- Also: `essence` ethanol fraction 0.05 → 0.10 (French SP95-E10 is the default unleaded since 2009).
- User's chart values shifted up by ~5pp across the board after deploy, landing near the 70% target band.
- Commit: `1219500`.

**Bug 3 — Backend non-deterministic sort for FlexFuel stops** (`backend/app/services/{fuel,vehicle}_service.py`):
- `get_fuel_statistics_by_vehicle`, `get_consumption_history`, `_compute_seasonal_consumption` all use a fill-to-fill pattern (accumulate Partiels until next Plein triggers consumption calc) but ordered only by odometer (or `(date, odometer)`). When Partiel and Plein shared the same odometer, insertion order decided whether the booster joined the current segment or leaked into the next.
- Fix: all three now sort by `(fueling_date, odometer_reading, is_full_tank ASC, id)`. The `is_full_tank ASC` puts Partiel (false) before Plein (true) at the same stop.

**Tier 2 — Ported exact method to BlendCalculator** (`flexfuel/BlendCalculator.tsx`):
- `computeTankState` rewritten to mirror the new chart algorithm. Removed `avgL100km` parameter from its signature — exact method doesn't need estimation. Returns state at the last Plein. The forward-looking blend recommendations still use `avgL100km` for projections (km until odoA/odoB), but the historical state is now exact.

**Tier 3 — Sort polish on remaining charts**:
- `RefuelingPatternChart.tsx`: added `(odometer, date, id)` tiebreakers.
- `FuelCharts.tsx` `filteredEntries`: added `odometer` to the `(date, id)` sort.

**Commit**: `8b37df4` (covers Tiers 1-3).

**Note on previous BlendCalculator fixes (2026-04-13 session below)**: the "`actualRemaining = min(remaining, tankCapacity - fill.liters)`" patch is superseded — the new exact method doesn't need that physical-bound clamp because it never inflates `litersInTank` past the genuinely-known fill amount.

---

## What Was Done (Session of 2026-05-05)

### StationPricesDialog — city search + known name override

**City search bar** (`StationPricesDialog.tsx`):
- Native `<Input list="commune-suggestions">` + `<datalist>` — same pattern as FuelAddDialog station name field.
- Debounced (300ms) call to `geo.api.gouv.fr/communes?nom=QUERY&boost=population&limit=8` (or `?codePostal=QUERY` when input is all digits). Correct param is `nom=`, not `q=`.
- On `onChange`, exact-match check against fetched suggestions → if match, extract `[lon, lat]` from `commune.centre.coordinates` and set as search origin.
- Search origin state (`{ lat, lon, label, mode: 'gps' | 'city' }`) drives station fetches. GPS still auto-captures; city selection takes priority.
- Badge shows "GPS actif" (Navigation icon) or city name (MapPin icon).

**Known station name override** (`useGlobalStationHistory` in `use-fuel-entries.ts`):
- Calls `GET /fuel-entries/?per_page=500` → response is `FuelEntryListResponse { entries: FuelEntry[] }` (not a plain array — important gotcha).
- `select` unwraps `.entries` and filters to entries with `latitude != null && longitude != null && station_name != null`.
- In `StationPricesDialog`, for each API station: haversine < 150m match against history → show user's saved name + `BookMarked` icon (same as `NearbyStationsList`). Falls back to raw API `adresse`.

**Bug fixed — `useCallback` in conditional JSX** (`FuelAddDialog.tsx`):
- `onSelect={useCallback(...)}` was written inside `{geo.status === 'success' && ... && <NearbyStationsList onSelect={useCallback(...)} />}`. Violated Rules of Hooks (conditional hook call) → React error #310 on GPS capture. Hoisted to `handleStationSelect` at component top level.

---

## What Was Done (Session of 2026-03-12)

### Feature 1: Dark Mode Toggle
- Wrapped app with `<ThemeProvider>` from `next-themes` in App.tsx
- Added Sun/Moon toggle button in Header.tsx
- CSS dark variables were already in index.css (lines 83-115)

### Feature 2: CSV Export
- Created `frontend-react/src/lib/csv.ts` with two export functions
- French headers, semicolon separator (`;`), UTF-8 BOM for Excel FR compatibility
- Filenames: `{brand}_{model}_pleins_{date}.csv` / `{brand}_{model}_maintenance_{date}.csv`
- Added export buttons in FuelViewDialog.tsx and MaintenanceViewDialog.tsx

### Feature 3: Maintenance Reminders
- Created `frontend-react/src/hooks/use-maintenance-reminders.ts`
- Groups maintenances by type, checks latest entry for overdue/upcoming
- Overdue: date in past or km exceeded → red badge
- Upcoming: within 30 days or 1000 km → orange badge
- Integrated badges into VehicleCard.tsx

### Backend Improvements (from AI code reviews)
- **Centralized FuelType enum** in `app/core/enums.py` (was duplicated 3 times)
- **Pydantic v2 migration**: `@validator` → `@field_validator` + `@classmethod`
- **ForeignKey constraints** added to fuel_entries and maintenances models
- **Bidirectional relationships** with `cascade="all, delete-orphan"`
- **Removed `Base.metadata.create_all`** from main.py (migrations handle schema)
- **Deduplicated consumption logic**: VehicleService delegates to FuelService
- **Fixed `vehicle_id` type** from `str` to `int` across fuel_service methods
- **Removed blanket `except Exception`** catches in fuel_entries endpoint
- **Added logging** to fuel_entries endpoint

### API Key Authentication
- Added `verify_api_key` dependency in `app/api/deps.py`
- Uses `X-API-Key` header
- `API_KEY` setting in config (empty = disabled)
- Applied globally via `dependencies=[Depends(verify_api_key)]` on api_router
- Health and docs endpoints bypass auth

### CORS Hardening
- Removed `allow_origins=["*"]` wildcard
- CORS now uses explicit origins from `settings.cors_origins_list`

### N+1 Query Fix
- Added `GET /vehicles/stats/batch` endpoint returning all active vehicle stats in one call
- Frontend `useAllVehicleStats()` fetches batch, `useVehicleStats(id)` uses `initialData` from batch

### Test Suite
- Created full test infrastructure with SQLite in-memory DB
- Transaction rollback per test for isolation
- 45 tests covering vehicles, fuel entries, maintenances, and auth
- Run with: `cd backend && pytest tests/ -v`

### Docker Compose Cleanup
- Vanilla JS frontend service commented out (not deleted) in both compose files
- Can be reactivated by uncommenting

### Documentation Cleanup
- Removed: `DEPLOYMENT.md` (redundant), `ProjetBackend.md` (outdated), `frontend-react/README.md` (boilerplate), `Review/*.md` (applied)
- Kept: `README.md`, `CLAUDE.md`, `PRODUCTION_DEPLOYMENT.md`, `LOCAL_SETUP.md`
- Created: this `SUMMARY.md`

---

## API Endpoints Reference

### Vehicles (`/api/v1/vehicles`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | List vehicles (filters: active_only, fuel_type, skip, limit) |
| POST | `/` | Create vehicle |
| GET | `/{id}` | Get vehicle by ID |
| PUT | `/{id}` | Update vehicle |
| DELETE | `/{id}` | Soft delete (or `?force=true` for hard delete) |
| GET | `/{id}/stats` | Vehicle statistics |
| GET | `/{id}/timeline` | Fuel entries + maintenances merged, sorted by date desc |
| POST | `/{id}/archive` | Archive (set is_active=false) |
| GET | `/stats/batch` | All active vehicles' stats in one call |

### Fuel Entries (`/api/v1/fuel-entries`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/` | Create fuel entry |
| GET | `/` | List with filters (vehicle_id, fuel_type, dates, pagination) |
| GET | `/{id}` | Get entry |
| PUT | `/{id}` | Update entry |
| DELETE | `/{id}` | Delete entry |
| GET | `/vehicle/{id}` | All entries for vehicle |
| GET | `/vehicle/{id}/latest` | Most recent entry |
| GET | `/vehicle/{id}/statistics` | Fuel statistics |
| GET | `/vehicle/{id}/consumption-history` | Consumption over time |

### Maintenances (`/api/v1/maintenances`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/` | Create maintenance |
| GET | `/{id}` | Get maintenance |
| PUT | `/{id}` | Update maintenance |
| DELETE | `/{id}` | Delete maintenance |
| GET | `/vehicle/{id}` | All maintenances for vehicle |
| GET | `/vehicle/{id}/statistics` | Maintenance statistics |

### FlexFuel (`/api/v1/flexfuel`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/vehicles/{id}/conversion` | Record FlexFuel conversion |
| GET | `/vehicles/{id}/conversion` | Get conversion for vehicle |
| PUT | `/vehicles/{id}/conversion` | Update conversion |
| DELETE | `/vehicles/{id}/conversion` | Delete conversion |
| POST | `/e10-prices` | Add global E10 reference price |
| GET | `/e10-prices` | List all E10 reference prices |
| PUT | `/e10-prices/{id}` | Update E10 price |
| DELETE | `/e10-prices/{id}` | Delete E10 price |
| GET | `/vehicles/{id}/rentability` | Calculate E85 rentability |

---

## Key Formulas

**Consumption (L/100km):**
`(liters * 100) / (current_odometer - previous_odometer)`
Segments anchor at FULL tanks only; partial fills accumulate liters until the next full tank. Entries before the first full tank are display-only.

**Vehicle Stats:**
- Total distance (display) = last_odometer - initial_odometer
- Average consumption = distance-weighted: Σ segment_liters × 100 / Σ segment_km (2026-07-05: was a simple mean of segments)
- Cost per km = total_fuel_cost / fill-to-fill distance (first→last entry, 2026-07-05: was initial_odometer-based)

**Cost Stats (frontend):**
- This month: sum of fuel + maintenance costs for current month
- Monthly average: annual cost / 12

**FlexFuel E85 Rentability:**
- Equivalent E10 liters = E85 liters / (1 + overconsumption_pct / 100)
- E10 equivalent cost = equivalent E10 liters × latest E10 reference price at fill date
- Savings per fill = E10 equivalent cost - actual E85 cost
- Break-even = when cumulative savings >= kit cost

---

## What Was Done (Session of 2026-05-04)

### Autonomie — moyenne pondérée par distance + fourchette ville/route

**Backend** (`vehicle_service.py`, `schemas/vehicle.py`):
- `avg_consumption` passe d'une moyenne simple à une moyenne pondérée par distance (`total_liters × 100 / total_km`) — les longs segments highway ne sont plus écrasés par des courts segments urbains.
- Nouveaux champs `SeasonStats` : `min_consumption`, `max_consumption`, `range_km_best`, `range_km_worst`.
- Pour FlexFuel : min/max calculés sur la consommation **normalisée E85** par segment, pas sur le brut mesuré. Élimine le biais des segments de transition post-conversion (réservoir encore en Essence).

**Frontend** (`VehicleDetailsDialog.tsx`):
- Fourchette affichée sous l'autonomie moyenne : « De ~X km (ville) à ~Y km (route) ».
- Grille 4 saisons : chaque cellule affiche aussi la fourchette min–max.

---

## What Was Done (Session of 2026-04-27)

### BlendCalculator — mode toutes saisons + boutons incrémentaux odomètre

- **Suppression du toggle saison** (Hiver / Été) : le calculateur affiche maintenant toujours le mode blend complet (sélecteur diluant, cartes seuils, recommandation, planificateur de trajet). Le mode été (E85 pur systématique) était trop réducteur.
- **Boutons +50 / +100 / +200** ajoutés inline à droite du champ odomètre. Clique sur le dernier odomètre connu si le champ est vide, sinon incrémente la valeur affichée. Permet de saisir rapidement « j'ai fait environ 150 km depuis le dernier plein » sans connaître le km exact.

---

## What Was Done (Session of 2026-04-16)

### Autonomie estimée — VehicleDetailsDialog

New section in the vehicle details popup showing estimated range per meteorological season.

**Backend** (`vehicle_service.py` + `schemas/vehicle.py`):
- New `SeasonStats` nested Pydantic model; `VehicleStats` now exposes `spring/summer/autumn/winter` (SeasonStats) + `range_km` (overall).
- `_compute_seasonal_consumption(vehicle_id, overconsumption_pct, tank_capacity)`: tracks E85 liters per fill-to-fill segment, normalises **per segment before averaging** — correctly handles mixed E85/E10 history.
- Backend looks up `FlexfuelConversion` → frontend receives finished numbers only.
- **Range formula**: `(tank − 5 L) × 100 / consumption` on actual, e10, and e85 values.
- **Normalisation**: `e10 = measured / (1 + opc × e85_fraction_per_segment)`, `e85 = e10 × (1 + opc)`. See CONTEXT.md for worked example.

**Frontend** (`VehicleDetailsDialog.tsx`):
- Current season range headline.
- FlexFuel: E10 / E85 side-by-side cards with L/100 + range, plus "Mix réel : X% E85 / Y% E10".
- 4-season grid: range + L/100 + fill count per season.

### BlendCalculator — plein partiel E85 max + planificateur de trajet

**Carte A — zone E85 pur** : nouvelle ligne sous odoA montrant les litres du plein complet → taux résultant · km ajoutés.

**Carte A — zone morte (après odoA)** : remplace « Fenêtre passée » par « Partiel possible · X L E85 → Y% · +Z km ». Formule : `x = (remaining × targetMax − ethanolLiters) / (0.85 − targetMax)`, capé au réservoir plein.

**Planificateur de trajet** (mode hiver uniquement) : champ « Trajet prévu (km) » → tableau comparant portée actuelle / portée après plein E85 / portée après blend, avec ✓/✗. La réserve 5 L est appliquée partout.

---

## What Was Done (Session of 2026-04-15)

### FuelEditDialog — fuel_type bug fix + selector

- **Bug**: editing any fuel entry overwrote its `fuel_type` with the vehicle's primary type (`vehicle?.fuel_type ?? entry.fuel_type`). An E85 car with a GASOLINE fill would revert to E85 on save.
- **Fix**: `onSubmit` now sends `data.fuel_type` (from the form) instead of `vehicle?.fuel_type ?? entry.fuel_type`.
- **Selector added**: `FuelEditDialog` now has a "Type de carburant" `Select`, pre-filled from the entry's actual type. FlexFuel vehicles see E85/Essence only; others see all 5 types. Same mismatch warning as FuelAddDialog.

### Soft delete for fuel entries, maintenances, and vehicles

**Backend**:
- `FuelEntry` and `Maintenance` models: added `is_active = Column(Boolean, default=True)`.
- `FuelService.delete_fuel_entry` and `MaintenanceService.delete_maintenance`: soft delete (`is_active=False`) instead of `db.delete`.
- All list, stats, history, timeline, and consumption queries in `fuel_service.py`, `maintenance_service.py`, and `vehicle_service.py` filter `is_active=True`.
- Migration: `backend/migrations/add_soft_delete_fuel_maintenance.sql`.

**Frontend**:
- `VehicleCard.tsx`: delete button was hardcoded to `handleDelete(true)` (`?force=true`). Changed to `handleDelete(false)` → soft delete.
- Confirmation dialog text updated to reflect archiving (history is kept).
- `useVehicles` hook was fetching with `active_only=false` → fixed to default (`active_only=true`), inactive vehicles no longer shown on dashboard.

---

## What Was Done (Session of 2026-04-14)

### BlendCalculator — mode hiver intelligent + seuils km de référence

**Contexte** : l'ancienne UI demandait un odomètre et affichait X L E10 + Y L E85. L'utilisateur voulait une vision plus claire : jusqu'où peut-il aller en E85 pur, et à partir de quand doit-il diluer ?

**Deux cartes de référence** (calculées depuis l'état courant du réservoir, sans saisie) :
- **"E85 pur"** — dernier km à partir duquel un plein E85 resterait ≤ target + tolerance. Formule : `r_A = tank × (targetMax − 0.85) / (ethFrac − 0.85)`, puis `odo_A = fromOdo + (remaining − r_A) × 100 / avgL100km`. Affiche "Fenêtre passée" si le seuil est dépassé.
- **"Dilution X"** — premier km où ajouter exactement 5 L (minimum pompe France) de diluant donne le taux cible exact. Formule : `r_B = [5 × (dilFrac − 0.85) − tank × (target − 0.85)] / (0.85 − ethFrac)`. Affiche "Maintenant" si déjà atteint.
- Les deux seuils se recalculent en temps réel si l'utilisateur saisit un odomètre précis dans le champ du bas.

**Recommandation hiver intelligente** (3 cas auto-détectés) :
- Taux trop élevé (> target + tolerance) → ajouter seulement 15 L E85, diluer au prochain plein
- E85 pur ok (résultat ≤ target + tolerance) → plein E85 + km avant que le prochain plein E85 dépasse le max
- Dilution nécessaire → X L [E10|SP95] + Y L E85 (boîte bleue)

**Fix rounding** : `Math.ceil(xIdeal)` remplacé par `Math.round(xIdeal)` — cela minimise le diluant utilisé (ex. 5 L E10 au lieu de 6 L), résultat plus proche de la cible. L'erreur max de 0.5 L ne peut pas sortir de la tolérance ±%.

**Sélecteur diluant** : toujours visible en mode hiver (affect les deux seuils + la recommandation), caché en été.

---

## What Was Done (Session of 2026-04-13)

### BlendCalculator — bug fixes

**Tank drift fix** (`computeTankState` in `BlendCalculator.tsx`):
- When `is_full_tank=true`, reset `litersInTank = tankCapacity` (was `remaining + liters`, causing small consumption errors to accumulate across fills).

**Ethanol % overflow fix** (both `BlendCalculator.tsx` and `EthanolHistoryChart.tsx`):
- Root cause: model overestimates remaining (e.g. 5 L), user fills 44 L E85, but `litersInTank` is forced to 45 L. Previous formula `5L×80% + 44L×85% / 45L = 92%` — physically impossible.
- Fix: `actualRemaining = min(remaining, max(0, tankCapacity - fill.liters))`.
  - Corrects overestimates (takes the physical bound when model overshoots).
  - Preserves prior E10 partial fill at same odometer: `min(5, 45-40) = 5 L` ✓.
  - Only loses E10 if user over-logs E85 (e.g. 45 L in a 45 L tank with E10 already in) — data issue.

**`tank_capacity` gotcha discovered**: manufacturer spec (e.g. 45 L for Corsa E) is the *usable* capacity, not the physical total. Real capacity (réservoir + réserve) is ~50 L. When filling from reserve (5 L left + 45 L pumped), `tankCapacity - liters = 0` → E10 lost. **User must set `tank_capacity` to the observed fill-to-click-off value from near-empty.**

### EthanolHistoryChart — nouveau graphique

- **Replaced** `BlendCalculator` in graphs popup with `EthanolHistoryChart`.
- BlendCalculator remains in the vehicle dashboard card (`BlendCalculatorDialog`) — no duplication.
- Chart: line of ethanol % per full fill over time, with teal dashed target line and orange dashed ±tolerance bounds.
- Same tank state algorithm as BlendCalculator (shared constants, same fixes).
- File: `frontend-react/src/components/charts/EthanolHistoryChart.tsx`

---

## What Was Done (Session of 2026-04-07)

### FlexFuel — Blend Calculator E85/diluant

**Context**: user does E85 + small SP95/E10 fills (same day, same odometer) to maintain a target ethanol % in the tank for cold starts. Two separate fuel entries — partial 'essence' + full E85 — already work correctly with the existing consumption and rentability calculations.

**Backend**:
- `FlexfuelConversion` model + Pydantic schema: added `target_ethanol_pct` (default 77.0) and `ethanol_tolerance_pct` (default 5.0)
- Migration: `backend/migrations/add_blend_calculator_to_flexfuel.sql`
- `init_database.sql` updated for fresh installs
- `flexfuel_service.py`: `monthly_average_savings` now excludes the current (incomplete) month — fixes over-optimistic break-even projection

**Frontend**:
- `FlexfuelConversionDialog`: two new fields (target éthanol cible %, tolérance ±%)
- New component `BlendCalculator` (`frontend-react/src/components/flexfuel/BlendCalculator.tsx`):
  - Recomputes avg L/100km from fill history (fill-to-fill, client-side)
  - Tracks ethanol liters fill-by-fill from entire history to estimate current tank ethanol %
  - User inputs current odometer + dilutant type (E10 or SP95, since it varies by station)
  - Solves blend equation: `x L dilutant + y L E85` to hit target %
  - Applies 5L minimum pump constraint (France): if x < 5 → skip dilutant this fill
  - Shows "Mets X L de E10 puis Y L de E85" or "E85 uniquement + reporter la dilution"
  - Color-coded result % (green = within tolerance, orange = too high, blue = too low)
- `FuelCharts`: BlendCalculator injected above FlexfuelRentabilityChart (only for FlexFuel vehicles)

**FuelCharts ordering fix** (same session):
- `filteredEntries` sort now uses `id` as tiebreaker for same-date fills, preserving DB insertion order

**BlendCalculator drift fix** (session of 2026-04-12):
- `computeTankState`: when `is_full_tank=true`, force `litersInTank = tankCapacity` instead of `remaining + liters`. Prevents consumption estimation errors from accumulating — was causing "Restant: 44.4L" instead of 45L after a full fill, showing 0.6L drift.

---

## What Was Done (Session of 2026-04-05)

### MonthlyCostChart — maintenance spreading & projection rework

**Spreading** (both €/mois and €/100km modes):
- Previously: maintenance cost dumped entirely on the month of the entry in €/mois mode, spread only in €/100km mode with `new Date()` as fallback.
- Now: unified `spreadMaintenanceCosts` memo used by both modes.
- Spread priority: `next_maintenance_date` → `next_maintenance_odometer` (converted to months via `avgKmPerMonth`) → 12-month fallback (tires, wipers, etc.).
- `avgKmPerMonth` computed client-side same method as `DistanceChart` (max odo per month → diffs → average). No backend endpoint.

**Chart behaviour**:
- Real data (solid bars) capped at current month in both modes.
- Projection (faded bars, up to 12 months, stops after 3 if no more spread scheduled):
  - `MaintenanceProj` = actual `spreadMaintenanceCosts` value for that future month.
  - `CarburantProj` = avg fuel of last 3 **completed** months (current month excluded).
- Current month excluded from "Moyenne" header and from projection base — partial month was dragging figures down.

**DistanceChart**: same treatment — `avgKm` badge and `projectedAnnual` now use completed months only.

---

## What Was Done (Session of 2026-03-31)

### Backend — Bug fixes & hardening

- **`models/__init__.py`**: added missing `FuelEntry` and `Maintenance` exports to `__all__`
- **Type consistency**: fixed `vehicle_id: Optional[str]` → `Optional[int]` in `FuelService` (3 methods) and `MaintenanceService` (4 methods)
- **`per_page` cap**: reduced max from 10 000 to 500 on fuel entry list endpoints
- **DB indexes**: added `index=True` on `FuelEntry.fueling_date` and `Maintenance.maintenance_date`
- **Vehicle existence guard**: `_assert_vehicle_exists()` added to `FuelService`, `MaintenanceService`, and `FlexfuelService` — raises a clean 404 instead of a DB FK error
- **Odometer monotonicity**: NOT implemented — no validation in `FuelService.create_fuel_entry`. Decreasing odometer entries silently break consumption calculations. Known limitation, pending fix.
- **FlexFuel skipped fills**: `calculate_rentability()` now counts and returns `skipped_fills_no_e10_price` in the response (fills where no E10 reference price existed at that date were silently ignored before)
- **Bare `404` literals**: standardised all `raise HTTPException(status_code=404, ...)` in `flexfuel.py` to use `status.HTTP_404_NOT_FOUND`
- **New endpoint `GET /vehicles/{id}/timeline`**: returns fuel entries + maintenance merged and sorted by date descending — schema `VehicleTimeline` / `VehicleTimelineEvent` added to `schemas/vehicle.py`
- **Alembic setup**: added Alembic to `requirements.txt`, initialised `backend/alembic/` with `env.py` that reads `settings.database_url`; `compare_type=False` to avoid false positives on custom SQLEnum columns. Run with `cd backend && .venv/bin/alembic upgrade head`

### Frontend — Improvements

- **Removed `react-router-dom`**: was listed in `package.json` but never imported anywhere
- **API request timeout**: `fetchWithTimeout()` wrapper in `lib/api.ts` adds a 15-second `AbortController` timeout to every `fetch()` call
- **`aria-label` on icon buttons**: all icon-only buttons in `VehicleCard` footer and the GPS button in `FuelAddDialog` now have accessible labels
- **`ErrorBoundary` component**: new `src/components/ErrorBoundary.tsx` (class component with "Réessayer" reset button); wraps `<Dashboard>` in `App.tsx` and each individual chart in `FuelCharts.tsx` so a single failing chart can't crash the whole popup
- **Theme-aware chart colors**: `CostOfOwnershipSection` pie chart colors replaced with CSS custom properties (`--color-chart-purchase/fuel/maintenance`) defined in both `@root` (light) and `.dark` blocks in `index.css`
- **Fuel type mismatch warning**: `FuelAddDialog` shows an orange alert banner when the selected fuel type differs from the vehicle's registered type (does not block submission)
- **VehicleCard skeleton**: stats area shows 4 `<Skeleton>` shimmer lines while `useVehicleStats` is loading, replacing a blank card content
- **PWA manifest icon sizes**: added 96 × 96, 128 × 128, and 256 × 256 entries (PNG files at `public/icons/icon-{96,128,256}.png` need to be generated separately)
- **Centralised i18n strings**: new `src/lib/i18n.ts` exports a typed `t` object with all French user-facing strings grouped by domain (`vehicle`, `fuel`, `fuelType`, `maintenance`, `charts`, `flexfuel`, `stations`, `errors`, `offline`). Components can import and use instead of hardcoded string literals.
- **`FlexfuelRentabilitySummary` type**: added `skipped_fills_no_e10_price: number` to match the new backend field

---

## What Was Done (Session of 2026-03-24, part 3)

### Station price fixes (from real API schema)
- Removed non-existent `name` field from select — dataset only has `adresse` + `ville`
- Prices confirmed as `double` (€/L), removed erroneous `/1000` heuristic
- Fixed station display: `adresse` as primary name, `cp + ville` as subtitle
- Added adjustable radius (2/5/10/20/50 km) to standalone dialog only
- Fixed TS build error: `radiusKm` param was missing from the `fetch` type in the interface

---

## What Was Done (Session of 2026-03-24, part 2)

### Station Price Map
- `use-nearby-stations.ts`: calls data.economie.gouv.fr prix-carburants API, returns all 6 fuel prices per station + distance
- `NearbyStationsList.tsx`: inline collapsible panel in FuelAddDialog/FuelEditDialog — appears after GPS capture, click to auto-fill form
- `StationPricesDialog.tsx`: standalone dialog, auto-requests GPS on open, sort by price or distance, fuel type selector, "moins cher" badge on cheapest
- Header: added Fuel icon button to open the standalone dialog

### FuelEditDialog improvements
- Added station name (with autocomplete), location, and GPS capture
- If GPS recaptured: shows NearbyStationsList, preserves existing lat/lon if GPS not used

### New Charts
- `MonthlyCostChart.tsx`: stacked bar (fuel + maintenance) per month. Maintenance spread across months. Toggle €/mois ↔ €/100km. Projection uses scheduled spread + avg fuel. Current month excluded from averages.
- `DistanceChart.tsx`: monthly km bars + average dashed line + projected annual km badge (based on last 3 months)
- Both added to FuelCharts popup

---

## What Was Done (Session of 2026-03-23/24)

### Feature: FlexFuel E85 Conversion & Rentability
- Full-stack feature: backend model/service/endpoints + frontend dialogs/hooks/charts
- One conversion per vehicle (UNIQUE on vehicle_id)
- E10 reference prices are global (shared across vehicles), with time-series lookups
- Fuel entries now support E85 fuel type — added to all Zod schemas, backend enum, DB ENUM
- Rentability charts integrated into the graphs popup (Recharts)
- Cumulative savings Y axis scales to max(kit cost, total savings) to always show the break-even line

### DB Migration Notes
- `fuel_entries.fuel_type` ENUM uses uppercase names (`GASOLINE`, `DIESEL`, etc.) — SQLAlchemy stores enum member names, not values
- `e10_reference_prices` table has no `vehicle_id` (global)
- Migration files: `add_flexfuel_e85.sql` (incremental), `init_database.sql` (fresh install)

---

## Environment Variables (`backend/.env`)

```bash
DB_HOST=192.168.25.46      # Database host
DB_PORT=3306               # Database port
DB_USER=<user>             # Database user
DB_PASSWORD=<password>     # Database password
DB_NAME=vehicle_management # Database name
API_KEY=<your-key>         # API key (empty = auth disabled)
DEBUG=False
BACKEND_CORS_ORIGINS=https://carmanagement.home.ouiouibaguette.fr,https://carmanagementapi.home.ouiouibaguette.fr
```
