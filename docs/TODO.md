# VroomVroom — TODO

Prioritized feature and improvement checklist. Edit, reorder, add, or delete freely.

**Priority**: P0 = critical, P1 = important, P2 = nice to have
**Effort**: S = small (<2h), M = medium (2-6h), L = large (6h+)

---

## Code Fixes & Improvements

- [ ] [#1] **Odometer monotonicity check** — `P0` `S`
  Prevent decreasing odometer entries that silently corrupt consumption calculations. Validate in `fuel_service.py:create_fuel_entry()`. Add optional override flag for legitimate resets.

- [ ] [#2] **Soft-delete for FlexFuel conversions & E10 prices** — `P1` `M`
  Add `is_active` column to `FlexfuelConversion` and `E10ReferencePrice` models. Filter active in queries. Change delete methods to soft delete. Migration needed.

- [ ] [#3] **FlexFuel service/endpoint tests** — `P1` `M`
  Create `tests/test_flexfuel.py`. Cover: conversion CRUD, duplicate prevention, E10 price CRUD, rentability calculation (savings, break-even, skipped fills, monthly averages).

- [ ] [#4] **Typed VehicleStats merge** — `P2` `S`
  Have `FuelService.get_fuel_statistics_by_vehicle()` return a typed dataclass/Pydantic model instead of plain dict.

- [ ] [#5] **Pydantic v2 migration: `.model_dump()` instead of `.dict()`** — `P2` `M`
  Replace `.dict(exclude_unset=True)` with `.model_dump(exclude_unset=True)` in all endpoint partial-update methods. Test every update endpoint.

- [ ] [#6] **`.env` in git history cleanup** — `P2` `S`
  `git filter-repo` to remove `.env` files from history, force push, rotate DB password. Low priority (private repo, homelab-only).

---

## Trip Planner (Route dialog — rework)

A unified **route planner dialog** (currently `RouteStationDialog.tsx`) combining two features:

### [#A1] Cheapest station on route — `P1` `L`

- Origin + destination city inputs (autocomplete via geo.api.gouv.fr) + GPS button for origin
- Fuel type selector, max detour selector (5 / 10 / 20 / 30 / 50 km)
- Fetch stations from gouvernement price API around the route corridor
- Filter by perpendicular distance to A→B segment, reject stations outside the A→B extent (t < 0 or t > 1)
- Sort by price; show detour distance, "Moins cher" badge, known-name override from history
- **Status:** partially implemented — core filtering works, UX needs polish (loading states, error handling, mobile layout)

### [#A2] Highway toll optimizer (autoroute-eco style) — `P1` `XL`

- Same origin + destination inputs as #A1 (shared state in the same dialog, two tabs or two sections)
- Compute route via a routing API (OSRM public instance or similar, no API key needed)
- Identify toll sections along the route using OpenStreetMap toll data or a toll dataset
- For each toll section: show name, cost, and whether bypassing it via free roads saves money given the vehicle's consumption and current fuel price
- Display: total toll cost, total detour cost if bypassed, net savings recommendation
- Vehicle-aware: use the selected vehicle's average consumption and current fuel price per liter
- **No paid API** — use OSRM + OSM toll way tags or a static French toll dataset

---

## Station & Refueling Features

- [ ] [#B1] **Station favorites** — `P2` `M`
  Mark stations as favorites. Star icon. Sort to top in lists. "Mes stations" filter. New model + CRUD backend needed.

- [ ] [#B2] **Refueling pattern report** — `P2` `S`
  Histogram: km between fills. Bar chart: fills by day of week. Pie chart: fills by fuel type. Average cost per fill badge. Pure client-side computation.

---

## New Graphs

- [ ] [#C1] **Consumption vs season scatter plot** — `P2` `S`
  Scatter: L/100km vs month, polynomial trend line overlay. Visual proof of winter consumption penalty. Client-side.
