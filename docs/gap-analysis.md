# VroomVroom — Gap Analysis

What could be improved and what new features/graphs could be added.
Generated: 2026-05-12

---

## Code & Architecture Issues

### #1 — No odometer monotonicity check
**Impact**: Decreasing odometer entries silently corrupt consumption calculations. Fuel consumption goes negative or zero, breaking charts and stats.
**Location**: `backend/app/services/fuel_service.py:create_fuel_entry()`
**Fix**: Before inserting, query the vehicle's latest odometer. If new reading < latest, raise `HTTPException(400, "Le kilometrage ne peut pas diminuer")`. Possibly allow an override flag for odometer resets (engine swap, etc.).
**Effort**: Small

### #2 — Soft delete inconsistency
**Impact**: Vehicles, fuel entries, and maintenances use soft delete (`is_active=False`). FlexFuel conversions and E10 reference prices use hard delete (`db.delete()`). Inconsistent UX and no undo for FlexFuel data.
**Location**: `backend/app/services/flexfuel_service.py:delete_conversion()`, `delete_e10_price()`
**Fix**: Add `is_active` column to `FlexfuelConversion` and `E10ReferencePrice` models, filter active in queries, change delete methods to soft delete. Migration needed.
**Effort**: Medium

### #3 — Vehicle.fuel_type stored as plain String
**Impact**: Inconsistent with `FuelEntry.fuel_type` which uses `SQLEnum`. Potential for value mismatch between ORM and DB.
**Location**: `backend/app/models/vehicle.py`
**Fix**: Change `Column(String(20))` to `Column(SQLEnum(FuelType))` matching FuelEntry. Requires migration if DB ENUM doesn't exist on vehicles table.
**Effort**: Medium

### #4 — VehicleStats dict merge is untyped
**Impact**: `VehicleService.get_vehicle_stats()` calls `FuelService.get_fuel_statistics_by_vehicle()` which returns a plain `dict`, then merges additional fields. No type safety, no IDE support, fragile to refactors.
**Location**: `backend/app/services/vehicle_service.py`
**Fix**: Have `FuelService.get_fuel_statistics_by_vehicle()` return a typed dataclass or Pydantic model instead of dict.
**Effort**: Small

### #5 — Pydantic v1 `.dict(exclude_unset=True)` usage
**Impact**: Works in v2 but generates deprecation warnings. Will break on Pydantic v3.
**Location**: All endpoint files that do partial updates (`fuel_entries.py`, `maintenances.py`, `vehicles.py`, `flexfuel.py`)
**Fix**: Replace `.dict(exclude_unset=True)` with `.model_dump(exclude_unset=True)`.
**Effort**: Medium (search-replace, but requires testing every update endpoint)

### #6 — No FlexFuel test coverage
**Impact**: 0 tests for flexfuel service, endpoints, BlendCalculator logic, or E10 price lookups. Rentability calculation has complex edge cases (missing E10 prices, skipped fills, break-even detection).
**Location**: `backend/tests/` — no `test_flexfuel.py` exists
**Fix**: Create `test_flexfuel.py` covering: conversion CRUD, duplicate prevention, E10 price CRUD, rentability calculation (savings, break-even, skipped fills, monthly averages, edge cases).
**Effort**: Medium

### #7 — `.env` credentials in git history
**Impact**: DB credentials (`mathis`/`mathis`, `192.168.25.46`) in commit `3836c24`. Low priority since repo is private and credentials are homelab-only, but still a cleanup item.
**Fix**: `git filter-repo --path backend/.env --path backend/.env.local --invert-paths` + force push + rotate DB password.
**Effort**: Small

---

## New Features — Trip Planning

### Feature A1 — "Need to refuel by" prediction badge
**Use case**: On the dashboard, see at a glance when you'll need to refuel based on current tank and driving patterns.
**UI**: Badge on VehicleCard similar to maintenance reminders. States: green (>7 days), orange (3-7 days), red (<3 days), "now" (in reserve).
**Data needed**:
- `VehicleStats.range_km` (already computed — current estimated range with 5L cushion)
- Average km/month from DistanceChart logic (already computed client-side)
- `days_since_last_entry` (already in stats)
**Backend change**: None — or add `estimated_days_to_refuel` to VehicleStats for convenience.
**Frontend change**: New badge in VehicleCard, new section in VehicleDetailsDialog showing "Distance parcourue depuis le dernier plein / autonomie restante".
**Effort**: Small

### Feature A2 — Trip cost estimator dialog
**Use case**: Before a trip, estimate fuel cost for a given distance with the selected vehicle.
**UI**: Dialog with: vehicle selector, distance input (km), optional "depart" / "arrivee" city names, compute button. Shows: estimated liters, estimated cost, number of stops needed. Tabs for different fuel types (E85 vs E10 vs SP95).
**Data needed**:
- Seasonal consumption per vehicle (already in VehicleStats)
- Current fuel prices from gouv.fr API (already fetched in StationPricesDialog)
- Tank capacity (already on vehicle)
**Backend change**: None strictly needed — all data exists. Could add `POST /vehicles/{id}/trip-estimate` returning cost/liters/stops for a given distance.
**Frontend change**: New `TripEstimatorDialog.tsx` component, button to open from VehicleCard.
**Effort**: Medium

### Feature A3 — Range overlay on Stations Map
**Use case**: When looking at stations, see which ones are within your current tank range (and which require a mid-trip refuel).
**UI**: In StationPricesDialog and StationsMap, draw a semi-transparent circle centered on user's GPS with radius = `range_km * 1000` meters. Stations outside the circle are grayed out or shown with a warning icon. Badge: "X stations dans votre autonomie".
**Data needed**: `VehicleStats.range_km` (already computed), user GPS (already captured).
**Frontend change**: Add circle layer to leaflet map in `StationsMap.tsx` and `StationPricesDialog.tsx`. Filter stations by distance <= range_km.
**Effort**: Medium

### Feature A4 — "Cheapest station on my route" planner
**Use case**: You're driving from A to B. Which station along the way has the cheapest fuel for your car? Is the detour worth it?
**UI**: Dialog with: origin input (GPS or city search, same as StationPricesDialog), destination input (same autocomplete), vehicle selector. Computes: cheapest station within X km of the direct route, price, detour distance/time, fuel savings vs closest station. Map showing route line + station pin.
**Data needed**:
- Station prices from gouv.fr API (already fetched)
- Vehicle consumption (already in VehicleStats)
- City geocoding from geo.api.gouv.fr (already used)
- Route geometry (would need OSRM or similar — or approximate with haversine + orthodromic corridor)
**Backend change**: New endpoint `POST /fuel-entries/stations/on-route` accepting lat1/lon1/lat2/lon2, fuel_type, max_detour_km. Returns stations within corridor sorted by price.
**Effort**: Large (requires route corridor algorithm or external routing API)

---

## New Features — Station & Refueling

### Feature B1 — Station favorites
**Use case**: Mark frequently-used stations as favorites. They appear first in nearby station lists and get a star icon.
**UI**: Star button on each station in StationPricesDialog and NearbyStationsList. Favorite stations sorted to top. "Mes stations" filter toggle.
**Data needed**: New table `favorite_stations` (or localStorage key).
**Backend change**: New CRUD for `FavoriteStation` model (id, station_id, custom_name, lat, lon, fuel_types). `GET /fuel-entries/stations/favorites`, `POST/DELETE`.
**Effort**: Medium

### Feature B2 — Fuel budget tracking
**Use case**: Set a monthly fuel budget, track actual spending against it, get alerts when over budget.
**UI**: Budget input in vehicle settings. Progress bar on VehicleCard showing current month spend vs budget. Alert when >90%. New chart: budget vs actual bars per month with cumulative over/under line.
**Data needed**: Monthly fuel cost (already computed in MonthlyCostChart), budget value (new field on Vehicle or separate table).
**Backend change**: Add `monthly_fuel_budget` field to Vehicle model/schema. New endpoint or extend stats to include budget comparison.
**Effort**: Medium

### Feature B3 — Refueling pattern report
**Use case**: Understand your refueling habits — what days of the week, what times, average km between fills, typical cost per fill.
**UI**: New section or dialog with: histogram of km between fills, bar chart of fills by day of week, pie chart of fills by fuel type, average cost per fill badge.
**Data needed**: Fuel entries (already fetched). All computation is client-side aggregation.
**Backend change**: None.
**Effort**: Small

---

## New Graphs

### Graph C1 — Range gauge on VehicleCard
**What**: Donut or semi-circle gauge showing current estimated range as % of full-tank range.
**Data**: `VehicleStats.range_km` (current) vs `(tank_capacity - 5) * 100 / best_season_consumption` (max possible). Both already computed.
**Chart**: CSS or Recharts PieChart with `startAngle={180} endAngle={0}` for gauge effect.
**Effort**: Small

### Graph C2 — Market price vs paid price overlay
**What**: Line chart of gouv.fr API prices for your fuel type over time, overlaid with dots of your actual paid prices per fill. Shows if you consistently pay above or below market.
**Data**: gouv.fr API prices (already fetched, would need historical storage or periodic polling). Your fill prices (already in FuelEntry).
**Chart**: Recharts ComposedChart with Line (market avg) + Scatter (your fills).
**Effort**: Medium (requires storing or caching historical API prices)

### Graph C3 — Refueling interval distribution histogram
**What**: Histogram of km driven between consecutive fills. X axis = km buckets (0-100, 100-200, ..., 700+). Y axis = number of times. Shows your typical refueling behavior.
**Data**: Fuel entry odometer readings (already fetched). Compute diffs between consecutive entries.
**Chart**: Recharts BarChart with no gaps (histogram style).
**Effort**: Small

### Graph C4 — Fuel cost calendar heatmap
**What**: GitHub-style contribution heatmap showing daily fuel spending. Darker green = spent more that day. Reveals patterns (road trip months, weekly commute spikes).
**Data**: Fuel entries with dates and costs (already fetched).
**Chart**: Custom grid or Recharts with color scale. Could use a dedicated heatmap library or build with div grid + CSS.
**Effort**: Medium

### Graph C5 — Consumption vs season scatter plot
**What**: Scatter plot of L/100km (Y) vs month (X) with polynomial trend line overlay. Visual proof of winter consumption penalty.
**Data**: ConsumptionDataPoint array (already computed per fill). Group by month, plot each point.
**Chart**: Recharts ScatterChart + LineChart (trend line). Trend line computed client-side with simple linear or polynomial regression.
**Effort**: Small

### Graph C6 — Station price history
**What**: For a selected station (or your most-used stations), line chart of price/L over time from your fill history. Compare multiple stations on one chart.
**Data**: Fuel entries filtered by station_name (already fetched).
**Chart**: Recharts LineChart with multiple series (one per station). Toggle to show/hide stations.
**Effort**: Medium

### Graph C7 — Trip cost projection (after trip estimator exists)
**What**: Bar chart comparing estimated vs actual cost for planned trips. Only relevant if trip planner is built first.
**Data**: Trip estimates + actual fill costs on trip dates.
**Chart**: Recharts BarChart with paired bars (estimated/actual).
**Effort**: Medium (depends on Feature A2)

### Graph C8 — Portfolio allocation donut
**What**: Donut chart showing total cost breakdown by vehicle (how much of your fleet budget each car consumes).
**Data**: VehicleStats.total_fuel_cost + maintenance total cost per vehicle (already available).
**Chart**: Recharts PieChart like CostOfOwnershipSection but across all vehicles.
**Effort**: Small

---

## Data Flow: Current vs Potential

### What's already computed (no backend changes needed for many features)
- `VehicleStats.range_km` — current estimated range
- `VehicleStats.spring/summer/autumn/winter.range_km` — seasonal range
- `VehicleStats.last_odometer` — current odometer
- `VehicleStats.days_since_last_entry` — recency of last fill
- `DistanceChart` monthly km rate (computed client-side)
- `ConsumptionDataPoint[]` — per-fill consumption with dates and odometers
- Station prices from gouv.fr API (real-time, not historical)
- Fuel prices per fill (in FuelEntry)
- Maintenance costs and schedules

### What would need new backend work
- Station price history (store periodic snapshots or cache API responses)
- Favorite stations (new model + CRUD)
- Fuel budget (new field on Vehicle or new model)
- Route-based station search (corridor algorithm or routing API integration)
- Market price aggregation (historical API polling)

### What's purely frontend (zero backend changes)
- Range gauge, refueling interval histogram, consumption scatter, cost calendar
- Refueling pattern report (day of week, km between fills stats)
- Range overlay on existing station map (just add a circle + filter)
- "Need to refuel by" prediction (compute from existing stats + monthly rate)
- Portfolio allocation donut
- Trip cost estimator (distance * consumption * price/L — simple multiplication)
