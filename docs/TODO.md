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

## Trip Planning Features

- [ ] [#A1] **Cheapest-station-on-route planner** — `P1` `L`
  Origin + destination inputs. Finds cheapest station within detour corridor. Shows: price, detour time, savings vs next station. New backend endpoint needed.

- [ ] [#A2] **Tolls planners** — `?` `XL`
  Origin + destination inputs. Finds the cheapest tolls that i can take on a route. Shows: price, detour time, savings. New backend endpoint needed. Use the same principle as https://www.autoroute-eco.fr/.

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
