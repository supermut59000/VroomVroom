# VroomVroom — Vision & Technical Context

This file is meant to be fed to an AI at the start of a new session to restore full context.
Last updated: 2026-03-30

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
- Record conversion (date, kit cost, overconsumption %, brand, installer)
- Global E10 reference price history (date + price/L, shared across vehicles)
- Rentability calculation: savings per E85 fill = (E85_liters / overconsumption_factor × E10_ref_price) - actual_E85_cost
- Charts: cumulative savings line (Y axis = max(kit_cost, total_savings) × 1.1), monthly savings bars, summary cards

### Station price map
- Standalone dialog (header button): nearby stations from gouv.fr API, adjustable radius 2-50km
- Sort by price (cheapest highlighted green) or distance
- Shows all 6 fuel type prices per station
- In FuelAddDialog/FuelEditDialog: after GPS capture, shows clickable list → auto-fills form

### Charts (in graphs popup)
- **ConsumptionChart**: L/100km per fill-up over time (line). Backend computes with partial-fill accumulation.
- **PriceChart**: €/L per fill-up over time (line) with average reference line.
- **MonthlyCostChart**: stacked bars fuel + maintenance per month. Toggle: €/mois ↔ €/100km. Both modes show 3-month projection as faded bars (avg of last 3 months).
- **DistanceChart**: km per month (bar) + projected annual km badge.
- **InsuranceKmChart**: absolute odometer progression vs insurance km limit (line). Reference line at `insurance_km_limit + years_elapsed × annual_increase`. Dotted projection forward at current monthly rate. Badge uses backend `insurance_km_remaining` (authoritative). Only renders if `vehicle.insurance_km_limit` is set. Uses **allEntries** (never filtered) for correct base odometer.
- **StationsMap**: clusters GPS fill points within 100m radius, Leaflet map.
- **FlexfuelRentabilityChart**: cumulative savings line vs kit cost reference line. If break-even not reached: dotted projection line extending at `monthly_average_savings` rate until kit cost is hit. Badge shows projected break-even month. Monthly savings bar chart.

#### Insurance km calculation (mirrors backend exactly)
```
current_limit = insurance_km_limit + floor(years_since_start_date) × annual_increase
insurance_km_remaining = current_limit − last_odometer_reading
```
The limit is a **cumulative total odometer threshold**, not a per-year quota reset each year.

#### Monthly cost projection method
Average of last min(3, N) real months → append 3 future months with same avg, rendered as `fillOpacity=0.35` bars. ReferenceLine marks the boundary between real and projected data.

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

## Pending / Ideas for Future Sessions

- **Photo receipts** — snap a photo of pump receipt / maintenance invoice, attach to entry
- **Push notifications** — PWA push when maintenance is due or insurance km limit approaching
- **Multi-vehicle comparison** — side-by-side stats
- **CI/CD** — GitHub Actions: lint, test, build, deploy on push to master
- **Test coverage for FlexFuel** — no tests yet for flexfuel service/endpoints
- **Fix `test_invalid_maintenance_type`** — maintenance_type accepts any string, should be enum-validated
