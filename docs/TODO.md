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

**Concept:** User enters a trip (origin + destination) and the app optimizes it: cheapest fuel station on the route + toll bypass analysis. Results shown on a map + shareable back to Google Maps.

---

### Input

- Origin + destination text fields with city autocomplete (geo.api.gouv.fr) + GPS button for origin
- Vehicle selector (used for consumption + last known fuel price in toll calculations)
- Optional: paste a `google.com/maps/dir/Origin/Destination` URL and auto-fill the two fields from it (short `maps.app.goo.gl` URLs can't be parsed in-browser due to CORS — only the long format works)

---

### Step 1 — Route geometry (OSRM)

- Call OSRM public API: `router.project-osrm.org/route/v1/driving/{lon,lat};{lon,lat}?geometries=geojson&overview=full`
- Get full route polyline (GeoJSON), total distance, estimated duration
- Display the route on a **MapLibre GL map** using the same `Map` / `MapMarker` / `MapControls` components from `src/components/ui/map.tsx` (same setup as "Carte des stations" in FuelCharts)
  - Route drawn as a GeoJSON line layer on the map
  - Origin/destination markers
  - Station markers (green = cheapest, grey = others)
  - Toll section markers (orange = bypassable with savings, red = not worth bypassing)

---

### Step 2 — Cheapest station on route

- Fetch stations from the gouvernement fuel price API around the route
- Filter stations by perpendicular distance to the **actual OSRM polyline segments** (not a straight line — iterate over each polyline segment)
- Show top 3–5 cheapest within the corridor: price, detour distance, estimated savings vs filling up randomly
- Highlight the recommended one on the map and in a results list below

---

### Step 3 — Toll optimizer

- Identify toll sections on the OSRM route via OSM way tags (`toll=yes`) or a static French toll dataset
- For each toll section: fetch a bypass route from OSRM using `exclude=toll` (or routing around it via a waypoint)
- Compute: `bypass_extra_km × vehicle_consumption × fuel_price` vs `toll_cost` → net savings or net loss
- Display: toll sections list with cost + bypass recommendation, revised total trip cost
- On the map: toll sections highlighted in orange (bypassable) or grey (not worth it)

---

### Step 4 — Share back to navigation app

**VroomVroom → Google Maps (primary)**
- Extract ~8–10 key waypoints from the OSRM polyline (before/after each toll section + evenly spaced)
- Build a `https://www.google.com/maps/dir/wp1/wp2/.../wpN` URL and show a "Ouvrir dans Google Maps" button
- The waypoints force Google Maps to follow the same road, minimizing routing divergence

**GPX export (secondary)**
- Export the full OSRM polyline as a `.gpx` file for apps that support it (OsmAnd, Waze, etc.)
- One-click download button

**UX note:** Add a disclaimer "Itinéraire calculé via OpenStreetMap — peut légèrement différer de Google Maps" since OSRM and Google use different datasets.

---

### UX structure

Single dialog (`RouteStationDialog.tsx` reworked), with:
1. Input form (top)
2. MapLibre map (full-width, ~350px tall) showing route + markers
3. Three collapsible sections below the map: **Résumé du trajet** / **Station recommandée** / **Péages**
4. Share buttons at the bottom

No new backend endpoints needed — everything is client-side (OSRM + gouvernement fuel API + OSM toll data).
