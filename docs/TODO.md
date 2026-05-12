# VroomVroom — TODO

Prioritized feature and improvement checklist. Edit, reorder, add, or delete freely.

**Priority**: P0 = critical, P1 = important, P2 = nice to have
**Effort**: S = small (<2h), M = medium (2-6h), L = large (6h+)

---

## Code Fixes & Improvements

- [ ] [#6] **`.env` in git history cleanup** — `P2` `S`
  `git filter-repo` to remove `.env` files from history, force push, rotate DB password. Low priority (private repo, homelab-only).

---

## Trip Planner — `P1` `XL`

**Concept:** User enters a trip (origin + destination, or pastes a Google Maps share URL) and the app optimizes it with fuel and toll info.

**Input**
- Origin + destination text fields with city autocomplete (geo.api.gouv.fr) + GPS button for origin
- Optional: paste a Google Maps share URL (`maps.app.goo.gl/...` or `google.com/maps/dir/...`) and parse origin/destination from it automatically
- Vehicle selector (to use its consumption + last known fuel price)

**Step 1 — Route geometry**
- Fetch the actual road route from OSRM public API (`router.project-osrm.org/route/v1/driving`)
- Get full route polyline (geometry), total distance, estimated duration
- Display route on a small embedded map (Leaflet, no API key needed)

**Step 2 — Cheapest station on route**
- Fetch stations from the gouvernement fuel price API along the route corridor
- Filter stations by perpendicular distance to the actual OSRM polyline segments (not a straight line — use real road geometry)
- Show top 3–5 cheapest stations: price, detour distance, estimated savings vs. just stopping anywhere
- Highlight the recommended one (best price within acceptable detour)

**Step 3 — Toll optimizer**
- Parse toll sections from the OSRM route using OSM way tags (`toll=yes`) or a static French toll dataset
- For each toll section: show name, estimated cost, and a bypass route via OSRM with `avoid=toll`
- Compute whether bypassing is worth it: bypass_distance_extra × consumption × fuel_price vs. toll_cost
- Display: total toll cost on current route, recommended bypasses with net savings, revised total cost

**UX**
- Single dialog, three collapsible sections: Route summary / Stations / Tolls
- Everything computed client-side except the OSRM and fuel price API calls (no new backend needed)
- Current `RouteStationDialog.tsx` to be reworked into this — the straight-line corridor approach gets replaced by real OSRM geometry
