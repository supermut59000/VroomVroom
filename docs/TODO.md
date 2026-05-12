# VroomVroom — TODO

Prioritized feature and improvement checklist. Edit, reorder, add, or delete freely.

**Priority**: P0 = critical, P1 = important, P2 = nice to have
**Effort**: S = small (<2h), M = medium (2-6h), L = large (6h+)

---

## Code Fixes & Improvements

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
