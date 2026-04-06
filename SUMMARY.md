# VroomVroom — App Summary & Session History

Last updated: 2026-04-05 (session 5)

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
- 45 tests total:
  - `test_vehicles.py` — 15 tests (CRUD, filters, stats, consumption calculation)
  - `test_fuel_entries.py` — 14 tests (CRUD, auto total_cost, pagination, statistics, consumption history, partial fill accumulation)
  - `test_maintenances.py` — 10 tests (CRUD, all 10 types, statistics)
  - `test_auth.py` — 6 tests (403 without key, valid key, health/docs bypass, auth disabled)

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
First entry has no consumption. Partial fills accumulate liters until next full tank.

**Vehicle Stats:**
- Total distance = last_odometer - initial_odometer
- Average consumption = (total_liters / total_distance) * 100
- Cost per km = total_fuel_cost / total_distance

**Cost Stats (frontend):**
- This month: sum of fuel + maintenance costs for current month
- Monthly average: annual cost / 12

**FlexFuel E85 Rentability:**
- Equivalent E10 liters = E85 liters / (1 + overconsumption_pct / 100)
- E10 equivalent cost = equivalent E10 liters × latest E10 reference price at fill date
- Savings per fill = E10 equivalent cost - actual E85 cost
- Break-even = when cumulative savings >= kit cost

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
