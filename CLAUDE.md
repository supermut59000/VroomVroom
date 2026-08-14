# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session Initialization

**At the start of every conversation, read these two files before doing anything else:**
- [CONTEXT.md](CONTEXT.md) — current app context, recent decisions, and active feature state
- [SUMMARY.md](SUMMARY.md) — high-level summary of the project and its current status

## Project Overview

VroomVroom is a **vehicle management web application** for tracking vehicles, fuel consumption, mileage, and maintenance in a homelab environment. Full-stack: FastAPI backend + React 19 frontend, designed as a mobile-friendly PWA.

**Tech Stack:**
- Backend: Python 3.11+, FastAPI, SQLAlchemy 2.0, Pydantic 2.x, MariaDB/MySQL, Alembic (migrations)
- Frontend: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, TanStack React Query, Recharts
- Infrastructure: Docker Compose, Uvicorn ASGI server
- Tests: pytest + httpx (SQLite in-memory, 119 tests) + vitest (27 frontend tests)

## Quick Start

### Development Commands

```bash
# Start all services (backend + frontend)
docker-compose up -d

# View logs
docker logs vroomvroom-backend -f
docker logs vroomvroom-frontend -f

# Rebuild after code changes
docker-compose up -d --build

# Stop all services
docker-compose down

# Access points
# Frontend: http://localhost:3055
# Backend API: http://localhost:8055
# API Docs: http://localhost:8055/docs (Swagger UI)
```

### Local Development (without Docker)

```bash
# Backend
cd backend
pip install -r requirements.txt
python run.py  # Starts on port 8000

# Frontend (separate terminal)
cd frontend-react
npm install
npm run dev  # Vite dev server

# Type-check before committing (strict, unused imports/vars are errors).
# Use `tsc -b`: tsconfig.json is a solution file ("files": [] + references),
# so `tsc --noEmit` compiles NOTHING and passes on code that fails the build.
npm run build   # tsc -b && vite build — what Docker runs
```

## Database Migrations (Alembic)

```bash
# Apply all pending migrations
cd backend && .venv/bin/alembic upgrade head

# Generate a new migration after changing a model
cd backend && .venv/bin/alembic revision --autogenerate -m "describe change"

# Check current revision
cd backend && .venv/bin/alembic current
```

**Notes:**
- `alembic/env.py` reads `settings.database_url` automatically — no credentials in `alembic.ini`
- `compare_type=False` is set to avoid false-positive column-type diffs on custom SQLEnum columns
- The first migration (`4eba94125b27_init`) establishes Alembic tracking on the existing schema

## Architecture Overview

### Backend Structure (`backend/app/`)

```
app/
├── main.py              # FastAPI app, CORS, route registration
├── api/
│   ├── deps.py          # Dependency injection (get_db)
│   └── v1/
│       ├── api.py       # Router aggregation
│       └── endpoints/   # Route handlers
│           ├── vehicles.py
│           ├── fuel_entries.py
│           └── maintenances.py (stub)
├── core/
│   ├── config.py        # Settings (DB URL, CORS, logging)
│   └── database.py      # SQLAlchemy engine and session
├── models/              # SQLAlchemy ORM models
│   ├── vehicle.py
│   ├── fuel_entry.py
│   └── maintenance.py (stub)
├── schemas/             # Pydantic validation schemas
│   ├── vehicle.py
│   ├── fuel_entry.py
│   └── maintenance.py (stub)
├── services/            # Business logic layer
│   ├── vehicle_service.py
│   ├── fuel_service.py
│   └── maintenance_service.py (stub)
└── utils/
    ├── calculations.py  # Consumption calculations
    └── logger.py        # Logging configuration
```

### Frontend Structure (`frontend-react/` — the active frontend; `frontend/` is the retired vanilla JS version)

```
frontend-react/src/
├── App.tsx                  # ThemeProvider + ErrorBoundary + Dashboard
├── components/
│   ├── layout/Header.tsx    # Dark mode toggle, station prices button
│   ├── vehicles/            # VehicleCard, Add/Edit/Details dialogs, CostOfOwnershipSection
│   ├── fuel/                # FuelAdd/Edit/View dialogs, NearbyStationsList, StationPricesDialog
│   ├── maintenance/         # Maintenance dialogs
│   ├── flexfuel/            # BlendCalculator, conversion + E10 price dialogs
│   └── charts/              # Consumption, Price, MonthlyCost, Distance, Odometer,
│                            # EthanolHistory, FlexfuelRentability, RefuelingPattern, StationsMap
├── hooks/                   # React Query hooks (use-vehicles, use-fuel-entries, ...)
├── lib/                     # api.ts (fetch + timeout + X-API-Key), csv.ts, i18n.ts, constants.ts
└── types/index.ts           # All shared TypeScript types
```

## Database Schema

### Vehicles Table
```sql
CREATE TABLE vehicles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    brand VARCHAR(50) NOT NULL,             -- indexed
    model VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    license_plate VARCHAR(20) UNIQUE NOT NULL,  -- indexed
    initial_odometer FLOAT NOT NULL,
    tank_capacity FLOAT,
    fuel_type ENUM('essence','diesel','electrique','hybride','gpl'),
    acquisition_date DATE,
    purchase_price FLOAT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
);
```

### Fuel Entries Table
```sql
CREATE TABLE fuel_entries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    vehicle_id INT NOT NULL,                -- FK, indexed
    fuel_type ENUM('essence','diesel','electrique','hybride','gpl'),
    liters FLOAT NOT NULL,
    price_per_liter FLOAT NOT NULL,
    total_cost FLOAT NOT NULL,              -- calculated: liters × price_per_liter
    odometer_reading INT NOT NULL,
    station_name VARCHAR(100),
    location VARCHAR(100),
    fueling_date DATE NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);
```

**Note:** Maintenance table is stubbed but not implemented.

## API Endpoints

**Base URL:**
- Local: `http://localhost:8055/api/v1`
- Production: `https://carmanagementapi.home.ouiouibaguette.fr/api/v1`

### Vehicles (`/api/v1/vehicles`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | List vehicles (with filters: active_only, fuel_type) |
| POST | `/` | Create vehicle |
| GET | `/{vehicle_id}` | Get vehicle details |
| PUT | `/{vehicle_id}` | Update vehicle |
| DELETE | `/{vehicle_id}` | Soft delete (or force delete with `?force=true`) |
| GET | `/{vehicle_id}/stats` | Get statistics (consumption, costs, distance) |
| GET | `/{vehicle_id}/timeline` | Unified chronological feed: fuel + maintenance merged |
| POST | `/{vehicle_id}/archive` | Archive vehicle (set is_active=False) |
| GET | `/stats/batch` | All active vehicles' stats in one call (avoids N+1) |

### Fuel Entries (`/api/v1/fuel-entries`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/` | Create fuel entry |
| GET | `/` | List entries (filters: vehicle_id, fuel_type, date range, pagination) |
| GET | `/{entry_id}` | Get specific entry |
| PUT | `/{entry_id}` | Update entry |
| DELETE | `/{entry_id}` | Delete entry |
| GET | `/vehicle/{vehicle_id}` | Get all entries for vehicle |
| GET | `/vehicle/{vehicle_id}/latest` | Get most recent entry |
| GET | `/vehicle/{vehicle_id}/statistics` | Get fuel statistics |
| GET | `/vehicle/{vehicle_id}/consumption-history` | Get consumption over time (for charts) |

### Routing (`/api/v1/routing`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/matrix` | Road distance + driving time from one origin to many stations (OSRM proxy, 6 h per-pair cache, never 500s — returns null legs on provider failure) |

## Key Implementation Patterns

### Backend Patterns

**1. Service Layer Pattern**
```python
# Endpoints use services, not direct DB access
from app.services.vehicle_service import VehicleService

@router.get("/{vehicle_id}")
def get_vehicle(vehicle_id: int, db: Session = Depends(get_db)):
    service = VehicleService(db)
    vehicle = service.get_vehicle(vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle
```

**2. Dependency Injection for Database**
```python
# All endpoints use: db: Session = Depends(get_db)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**3. Pydantic Validation with Custom Validators**
```python
class VehicleBase(BaseModel):
    license_plate: str

    @field_validator('license_plate')
    def uppercase_license_plate(cls, v):
        return v.upper() if v else v
```

**4. Soft Delete Pattern**
```python
# Vehicles use is_active flag
vehicle.is_active = False  # Archive
# Force delete with: ?force=true query parameter
```

**5. Automatic Calculation Fields**
```python
# FuelEntry total_cost calculated automatically
def create_fuel_entry(self, fuel_entry_data: FuelEntryCreate):
    fuel_entry_data.total_cost = fuel_entry_data.liters * fuel_entry_data.price_per_liter
```

### Frontend Patterns

**1. API layer with timeout** — all requests go through `src/lib/api.ts`
```typescript
// 15-second AbortController timeout on every fetch
import { api } from '@/lib/api'
const vehicles = await api.get<VehicleList[]>('/vehicles/')
```

**2. Data fetching** — TanStack React Query hooks in `src/hooks/`
```typescript
// Batch stats avoids N+1: useAllVehicleStats() fetches once,
// useVehicleStats(id) uses initialData from the batch result
const { data: stats } = useVehicleStats(vehicle.id)
```

**3. Error boundaries** — `src/components/ErrorBoundary.tsx`
```typescript
// Wraps Dashboard in App.tsx, and each chart in FuelCharts.tsx
<ErrorBoundary><ConsumptionChart ... /></ErrorBoundary>
```

**4. Centralised strings** — `src/lib/i18n.ts`
```typescript
import { t } from '@/lib/i18n'
toast.success(t.fuel.addSuccess)
<p>{t.vehicle.stats.totalDistance}</p>
```

**5. Theme-aware colors** — use CSS custom properties, not hardcoded HSL
```typescript
// Defined in index.css :root and .dark blocks
const COLORS = { fuel: 'var(--color-chart-fuel)' }
```

## Important Calculations

### Fuel Consumption (L/100km)

**Location:** [backend/app/services/fuel_service.py:get_consumption_history()](backend/app/services/fuel_service.py)

```python
# Fill-to-fill method: segments anchor at FULL tanks only.
# Partial fills accumulate liters until the next full tank.
#
# For each segment (full tank → next full tank):
# - distance = full_odometer - previous_full_odometer
# - consumption = (accumulated_liters + full_liters) × 100 / distance
#
# Entries before the first full tank are display-only (no consumption).
# Sort order everywhere: (fueling_date, odometer, is_full_tank ASC, id)
# so a same-stop partial booster folds into the closing full's segment.
```

### Vehicle Statistics

**Location:** [backend/app/services/vehicle_service.py:get_vehicle_stats()](backend/app/services/vehicle_service.py)

```python
# Total distance (display) = last_odometer - initial_odometer
# Average consumption = DISTANCE-WEIGHTED: Σ segment_liters × 100 / Σ segment_km
#   (not a mean of per-segment values — long segments weigh more)
# Cost per km = total_fuel_cost / fill-to-fill distance (first→last entry)
# Average price = total_cost / total_liters (liters-weighted)
```

## Configuration Files

### Environment Variables (`backend/.env`)
```bash
# Database
DB_HOST=192.168.25.9
DB_PORT=3306
DB_USER=vehicleadmin
DB_PASSWORD=***
DB_NAME=vehicle_management

# API
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=False

# CORS (comma-separated)
CORS_ORIGINS=http://localhost:3055,https://carmanagement.home.ouiouibaguette.fr

# Routing (driving distance/time to fuel stations) — all optional
# Defaults to the public OSRM demo server. Switch to a self-hosted server
# (see deploy/valhalla/) without any code change.
ROUTING_PROVIDER=osrm          # osrm | valhalla
ROUTING_URL=https://router.project-osrm.org
ROUTING_PROFILE=driving        # OSRM profile
ROUTING_PROFILE_VALHALLA=auto  # Valhalla costing
ROUTING_TIMEOUT=8.0
ROUTING_CACHE_TTL=21600
ROUTING_MAX_BATCH=95           # destinations per provider request
ROUTING_MAX_CONCURRENCY=4
```

**Self-hosted routing:** [deploy/valhalla/](deploy/valhalla/) is a standalone
Valhalla stack (independent of VroomVroom — reusable by other projects). It
also exposes `/route`, `/isochrone`, `/trace_route` and more.

### Docker Compose Ports
- Frontend: 3055 → 3000 (container)
- Backend: 8055 → 8000 (container)

### Python Dependencies (`requirements.txt`)
```
fastapi==0.109.0
uvicorn[standard]==0.27.0
sqlalchemy==2.0.25
pydantic==2.5.3
pydantic-settings==2.1.0
pymysql==1.1.0
python-dotenv==1.0.0
```

## Development Guidelines

### When Adding New Features

1. **Database Model** → Create in `models/`
2. **Pydantic Schemas** → Create in `schemas/` (Base, Create, Update, Response)
3. **Service Layer** → Implement business logic in `services/`
4. **API Endpoints** → Add routes in `api/v1/endpoints/`
5. **Register Router** → Add to `api/v1/api.py`
6. **TypeScript types** → Add to `frontend-react/src/types/index.ts`
7. **React Query hook** → Add to `frontend-react/src/hooks/`
8. **Component** → Create in `frontend-react/src/components/<domain>/` (shadcn/ui, French labels)

### Code Style

**Backend:**
- Use type hints: `def get_vehicle(vehicle_id: int) -> Vehicle:`
- Service classes with `__init__(self, db: Session)`
- Pydantic schemas for all API contracts
- Raise HTTPException for errors (404, 400, 422)

**Frontend (React — `frontend-react/`):**
- TypeScript strict mode — run `npm run build` (`tsc -b && vite build`) before committing; unused imports/vars are build errors. `tsc --noEmit` is useless here (solution-style tsconfig, compiles nothing).
- React Query hooks in `src/hooks/`, no useEffect data fetching
- shadcn/ui components, Recharts for charts, Zod + react-hook-form for forms
- French UI strings

### Testing

```bash
# No system pytest / no venv — run inside Docker with live source mounted:
docker compose run --rm -v ./backend:/app backend sh -c \
  "pip install -q pytest pytest-asyncio httpx && python -m pytest tests/ -v --tb=short"

# backend/tests/: conftest.py (SQLite in-memory, per-test rollback),
# test_vehicles.py, test_fuel_entries.py, test_maintenances.py,
# test_flexfuel.py, test_auth.py

# Frontend (vitest — pure functions in src/lib/: blend-math.test.ts, station-sort.test.ts):
cd frontend-react && npm run test
```

## Current Feature Status

### Implemented ✅
- Vehicle CRUD with soft delete, archiving, insurance km tracking
- Fuel entry CRUD with offline queue, GPS capture, station autocomplete
- Statistics (distance-weighted consumption, costs, seasonal autonomy)
- Maintenance tracking with reminders (date + km)
- FlexFuel E85: conversion record, rentability, BlendCalculator, E10 reference prices
- Station price map (data.economie.gouv.fr)
- Charts: consumption, price, monthly costs, distance, odometer, ethanol %, refueling patterns
- CSV export (French formatting)
- API key auth, dark mode, PWA
- Backend test suite (119 tests) + frontend pure-function tests (27 vitest)

### Not Implemented ❌
- CI/CD (Forgejo Actions — planned)
- Multi-user support
- Photo upload for receipts
- Push notifications
- PDF export

## Common Tasks

### Add a New API Endpoint

```bash
# 1. Update model (if needed)
# backend/app/models/vehicle.py

# 2. Add schema
# backend/app/schemas/vehicle.py

# 3. Add service method
# backend/app/services/vehicle_service.py
def new_method(self, param):
    # business logic
    return result

# 4. Add endpoint
# backend/app/api/v1/endpoints/vehicles.py
@router.post("/new-endpoint")
def new_endpoint(data: Schema, db: Session = Depends(get_db)):
    service = VehicleService(db)
    return service.new_method(data)
```

### Add a Frontend Feature (React)

```typescript
// 1. Types — frontend-react/src/types/index.ts
export interface NewThing { id: number; name: string }

// 2. React Query hook — frontend-react/src/hooks/use-new-thing.ts
export function useNewThings() {
  return useQuery({
    queryKey: ['newThings'],
    queryFn: () => api.get<NewThing[]>('/new-things/'),
  })
}

// 3. Component — frontend-react/src/components/<domain>/NewThingCard.tsx
//    shadcn/ui components, French labels, ErrorBoundary if it's a chart
```

### Debug Database Issues

```bash
# Connect to MariaDB
docker exec -it mariadb mysql -u vehicleadmin -p vehicle_management

# Check tables
SHOW TABLES;
DESCRIBE vehicles;

# View recent entries
SELECT * FROM vehicles ORDER BY created_at DESC LIMIT 5;
SELECT * FROM fuel_entries ORDER BY fueling_date DESC LIMIT 10;

# Check foreign keys
SELECT * FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_NAME = 'fuel_entries';
```

## Production Deployment

**URLs:**
- Frontend: https://carmanagement.home.ouiouibaguette.fr
- Backend: https://carmanagementapi.home.ouiouibaguette.fr

**Reverse Proxy:** Likely Nginx or Traefik (not in repo)

**SSL:** Handled by reverse proxy (Let's Encrypt)

**Database:** External MariaDB at 192.168.25.9:3306

See [DEPLOYMENT.md](DEPLOYMENT.md) for full deployment instructions.

## Troubleshooting

### Backend won't start
```bash
# Check logs
docker logs vroomvroom-backend

# Common issues:
# - Database connection: Check .env file, verify DB is running
# - Port conflict: Check if 8055 is available
# - Dependency error: Rebuild image with --no-cache
```

### Frontend can't reach backend
```bash
# Check config.js environment detection
console.log(API_URL);  # In browser console

# Verify CORS settings in backend/.env
# CORS_ORIGINS must include frontend URL

# Check network in docker-compose
docker network inspect vroomvroom_vroomvroom-network
```

### Calculation errors
```bash
# Verify fuel entries have sequential odometer readings
SELECT vehicle_id, odometer_reading, fueling_date
FROM fuel_entries
WHERE vehicle_id = X
ORDER BY odometer_reading;

# Check for gaps or decreasing odometer values
```

## File Reference Quick Links

- Entry point: [backend/app/main.py](backend/app/main.py)
- Configuration: [backend/app/core/config.py](backend/app/core/config.py)
- Vehicle endpoints: [backend/app/api/v1/endpoints/vehicles.py](backend/app/api/v1/endpoints/vehicles.py)
- Fuel endpoints: [backend/app/api/v1/endpoints/fuel_entries.py](backend/app/api/v1/endpoints/fuel_entries.py)
- Frontend entry: [frontend-react/src/App.tsx](frontend-react/src/App.tsx)
- Main dashboard: [frontend-react/src/pages/Dashboard.tsx](frontend-react/src/pages/Dashboard.tsx)
- Docker config: [docker-compose.yml](docker-compose.yml)
