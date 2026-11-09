# Code Context

## Scope and verdict
Read-only feature audit of the current React/FastAPI surfaces, `docs/TODO.md`, and `docs/gap-analysis.md`. The app already covers the pump-critical loop well (offline fuel capture, GPS/stations, maintenance, stats, charts, FlexFuel, routing). The best remaining features are small mobile workflow aids that reuse existing data; avoid the rejected route/toll optimizer and broad fleet/finance expansion.

## Candidate feature gaps (ranked)

### P1 — Refuel-by / remaining-range badge on the vehicle card
- **User value:** At a glance, answer “when should I refuel?” after the last fill, without opening charts. Particularly useful on mobile before a trip.
- **Current reuse:** Backend already exposes `VehicleStats.range_km`, `last_odometer`, and `days_since_last_entry` (`frontend-react/src/types/index.ts:116-128`; schema `backend/app/schemas/vehicle.py:123-145`). The dashboard already fetches stats per card (`frontend-react/src/components/vehicles/VehicleCard.tsx:36-39, 77-163`). Distance/month and seasonal range calculations already exist in `DistanceChart.tsx` and `VehicleDetailsDialog.tsx`.
- **Minimal shape:** A clearly labelled “autonomie estimée” / “km restants” badge or details row, with an uncertainty note and no aggressive notification. Do not infer a precise calendar date unless enough recent distance history exists.
- **Effort:** S (frontend only, likely `VehicleCard.tsx`, optionally a small pure helper under `src/lib/`).
- **Risk/ceiling:** Current `range_km` is a full-tank estimate with a 5 L reserve cushion, not a live tank sensor. Present it as an estimate; no push notifications needed.
- **Source:** `docs/gap-analysis.md` Feature A1; code references above.

### P1 — Range overlay in the station map/list
- **User value:** When searching stations, show which stations are reachable within the vehicle’s estimated range. This directly improves the existing “where can I refuel?” mobile workflow, especially in unfamiliar areas.
- **Current reuse:** Station origin, distances, route legs, map view, and vehicle-independent station dialog already exist (`frontend-react/src/components/fuel/StationPricesDialog.tsx:75-105, 180-219, 377-470`; `StationsMapView.tsx`). `VehicleStats.range_km` is already available from `useVehicleStats` (`frontend-react/src/hooks/use-vehicles.ts:25-41`).
- **Minimal shape:** Optional vehicle selector only when the user wants range context; draw a range circle and add a count/badge. Keep stations visible outside the circle with an explicit warning rather than filtering them out.
- **Effort:** M (UI state + map circle/layer + wiring vehicle stats; no backend).
- **Risk/ceiling:** A circle is straight-line range while road routing is already available. Label it “rayon estimé” and retain road distance/time as the decision metric; do not claim guaranteed reachability.
- **Source:** `docs/gap-analysis.md` Feature A3; `StationPricesDialog.tsx` and `use-vehicles.ts` references above.

### P1 — One-tap trip fuel-cost estimator (not a route planner)
- **User value:** Before a known-distance trip, estimate litres and fuel cost for the selected car/fuel type. Useful and bounded without turning the app into a route/toll product.
- **Current reuse:** Seasonal and overall consumption/range are already computed (`backend/app/schemas/vehicle.py:10-34, 123-145`; `frontend-react/src/types/index.ts:72-114`). Current station prices are fetched in `use-nearby-stations.ts` and displayed by `StationPricesDialog.tsx`; vehicle cards/details already provide natural entry points (`Dashboard.tsx:107-153`).
- **Minimal shape:** A small dialog with distance, vehicle, fuel type, consumption assumption, and optional current price. Show estimated litres and €; omit stops, route geometry, tolls, and persistence.
- **Effort:** S–M (frontend-only calculation and dialog; no endpoint required).
- **Risk/ceiling:** A price from “nearby stations” is not necessarily the trip price. Make price editable and label the result estimate; do not add a backend API until actual usage justifies it.
- **Source:** `docs/gap-analysis.md` Feature A2; `Dashboard.tsx`, `VehicleStats` types/schema, and station-price surfaces above.

### P2 — Maintenance cost/interval visibility as a focused “next service” view
- **User value:** Existing reminders identify overdue/upcoming maintenance, but a compact view of the latest service, next due date/km, and cost helps the owner decide what needs attention without opening the full history.
- **Current reuse:** Reminder grouping and latest-entry semantics already exist in `frontend-react/src/hooks/use-maintenance-reminders.ts`; maintenance CRUD/history dialogs are wired in `Dashboard.tsx:126-143`; maintenance fields include next date and odometer (`frontend-react/src/types/index.ts:166-211`).
- **Minimal shape:** Enhance the existing reminder badge/details sheet rather than introducing a maintenance scheduler. Show the next due criterion and latest cost/provider when available.
- **Effort:** S (frontend-only).
- **Risk/ceiling:** Avoid recurring-task automation or push notifications; reminder logic already handles date/km and should remain the source of truth.
- **Source:** `VehicleCard.tsx:167-193`, `use-maintenance-reminders.ts`, `Maintenance` types.

### P2 — Date-filtered CSV export for fuel and maintenance history
- **User value:** Existing CSV export is useful for reimbursement, resale, or annual review, but exporting all history can be noisy. A start/end period makes the current export more practical without new storage.
- **Current reuse:** Export UI exists in `FuelViewDialog.tsx` / `MaintenanceViewDialog.tsx`; CSV formatting is centralized in `frontend-react/src/lib/csv.ts`; both dialogs already load their full records.
- **Minimal shape:** Add optional period controls to the existing export action; default remains “all history.”
- **Effort:** S.
- **Risk/ceiling:** Keep French formatting and existing schema; no PDF export (explicitly not implemented and not needed for the homelab workflow).
- **Source:** `CLAUDE.md` frontend structure and current feature status; `src/lib/csv.ts`, `FuelViewDialog.tsx`, `MaintenanceViewDialog.tsx`.

## Existing gap-analysis items not recommended now
- **Trip planner / cheapest station on route / toll optimizer (A4):** rejected in history (`git` commit `4909ca2` removed trip planner; project memory records route/toll optimizer rejected). Do not re-propose unless the user explicitly revisits it.
- **Station favorites (B1):** already implemented locally via `frontend-react/src/hooks/use-favorite-stations.ts` and used by both `StationPricesDialog.tsx` and `NearbyStationsList.tsx`. The gap document is stale here; do not implement a duplicate backend model without a concrete need.
- **Refueling pattern report (B3) and interval histogram (C3):** already implemented in `frontend-react/src/components/charts/RefuelingPatternChart.tsx` and mounted by `FuelCharts.tsx:157`.
- **Ethanol history, monthly costs, odometer, stations map, cost of ownership, period stats:** already implemented in the current chart/details surfaces; gap-analysis entries are historical, not actionable feature gaps.
- **Fuel budget, market-price history, calendar heatmap, portfolio donut:** lower value for a single-user app. They add ongoing configuration/history complexity and are less important than pump-flow clarity.

## Documentation drift
`docs/gap-analysis.md` (generated 2026-05-12) still lists odometer monotonicity, FlexFuel test coverage, and station favorites as gaps, while current context/history says those were addressed or station favorites were implemented. This is not a feature recommendation; the parent should avoid treating that document as current backlog. `docs/TODO.md` contains only the accepted `.env` history cleanup, not feature work.

## Start Here
`frontend-react/src/components/vehicles/VehicleCard.tsx` and `frontend-react/src/components/fuel/StationPricesDialog.tsx`: together they are the two highest-value mobile entry points, and both can reuse existing stats/station data without backend schema changes.

## Acceptance report
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Five ranked feature candidates include concrete user value, reusable existing code, effort, risks, and exact source paths/line ranges; rejected and already-implemented items are explicitly excluded."
    }
  ],
  "changedFiles": [
    "/home/supermut59000/Work/VroomVroom/tmp/app-audit-features-subagents.feature-scout.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "Read docs/gap-analysis.md, docs/TODO.md, Dashboard.tsx, VehicleCard.tsx, StationPricesDialog.tsx, RefuelingPatternChart.tsx, use-vehicles.ts, types/index.ts, schemas/vehicle.py, and searched current feature references",
      "result": "passed",
      "summary": "Read-only feature surfaces and backlog reviewed."
    }
  ],
  "validationOutput": [
    "No source files edited; report written to the authoritative output path."
  ],
  "residualRisks": [
    "Range and refuel timing are estimates based on fill history, not live tank telemetry.",
    "docs/gap-analysis.md is stale and may cause duplicate proposals if not refreshed."
  ],
  "noStagedFiles": true,
  "diffSummary": "Added only the requested read-only feature-audit report artifact.",
  "reviewFindings": [
    "P1: VehicleCard lacks a clearly surfaced estimated refuel/range cue despite existing range and odometer stats.",
    "P1: StationPricesDialog lacks vehicle-aware range context despite existing station map, routing, and vehicle stats.",
    "P1: No bounded distance-to-fuel-cost estimator exists; this can reuse existing frontend data without route-planner scope creep.",
    "P2: Maintenance reminders do not expose a compact latest/next service cost context.",
    "P2: Existing CSV exports have no date-range selection."
  ],
  "manualNotes": "Do not re-propose the rejected trip/toll planner or station favorites backend model; both conflict with current code/history."
}
```