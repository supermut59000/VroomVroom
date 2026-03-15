# VroomVroom — App Summary & Session History

Last updated: 2026-03-12

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
│   │   │           └── maintenances.py
│   │   ├── core/
│   │   │   ├── config.py           # Settings from .env
│   │   │   ├── database.py         # SQLAlchemy engine/session
│   │   │   └── enums.py            # FuelType enum (single source)
│   │   ├── models/                 # SQLAlchemy models with FK + relationships
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
│   │   │   └── maintenance/MaintenanceViewDialog.tsx  # CSV export button
│   │   ├── hooks/
│   │   │   ├── use-vehicles.ts     # Batch stats + initialData pattern
│   │   │   ├── use-fuel-entries.ts
│   │   │   ├── use-maintenances.ts
│   │   │   └── use-maintenance-reminders.ts  # Reminder logic
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
