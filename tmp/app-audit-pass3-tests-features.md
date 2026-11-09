# App Audit — PASS 3: Tests + Features

**Repo:** VroomVroom (/home/supermut59000/Work/VroomVroom)
**Date:** 2026-08-22 · **Scope:** Phase 4 (tests) + Phase 5 (features), report-only, nothing fixed.
**Method:** Read CONTEXT.md (full), CLAUDE.md, docs/TODO.md, docs/gap-analysis.md, all 7 backend test files and 4 frontend vitest files. Ran both suites. Checked git log and decision ledger (project memories) before calling anything a bug or a stale test.

---

## Verdict (one sentence)

The suite is genuinely discriminating where it matters most (fill-to-fill math, weighted means, offline poison pills, routing), but the single most bug-prone block in the codebase — `_compute_seasonal_consumption` / autonomy stats, which had a multi-fix debug session on 2026-07-05 — has **zero** backend tests, and the odometer-decrease override, offline provider, batch/timeline endpoints, and all chart math run untested.

---

## Tests — what is already well-defended (do not re-audit)

These past bugs each have a regression test whose expected value differs between old and new behavior:

| Bug class (from CONTEXT.md session logs) | Test |
|---|---|
| Simple vs weighted consumption mean | `test_average_consumption_distance_weighted` (test_fuel_entries.py:249) — asserts 6.29, not simple mean 7.0 |
| Leading partial must not anchor a segment | `test_leading_partial_is_not_an_anchor` (test_fuel_entries.py:270) + frontend `computeAvgConsumption` "anchors at the first full tank" |
| Same-stop booster folding / `is_full_tank ASC, id` tiebreaker | frontend `computeAvgConsumption` "folds a same-stop booster… regardless of id order" (blend-math.test.ts) — old sort produced 8.0, new produces 9.0 |
| Partial fills accumulate to closing full | `test_partial_fills_accumulate` (test_fuel_entries.py:326) |
| Idempotent retry (client_request_id) | `test_client_retry_is_idempotent` (test_fuel_entries.py:28) |
| Poison pills (401/403/429 retry vs 400/404/409/422 park) | `isPermanentQueueStatus` (offline.test.ts) |
| Same-stop latest fill prefers full tank | `test_latest_same_stop_prefers_full_tank` (test_fuel_entries.py:179) |
| Pure-E85 tank crash + renderer contract (odoB null) | `computeThresholds` sweep test — a genuine mathematical-singularity sweep (blend-math.test.ts) |
| Cumulative vs per-step odometer in simulation | `simulateFutureFills` regression test (blend-math.test.ts) |
| Decreasing-odometer / chronology guards (reject path) | `test_create_fuel_entry_below_initial_odometer_rejected`, `test_update_rejects_out_of_sequence_odometer`, `test_update_allows_equal_odometer_blend_pair`, `test_update_initial_odometer_cannot_pass_existing_history` |
| Rentability formulas (equiv liters, savings, break-even, pre-conversion exclusion, most-recent-E10-price) | `TestFlexfuelRentability` — formula-pinned with exact expected values |
| Soft delete everywhere | vehicle, fuel, maintenance, conversion (recreatable), e10 price, rentability exclusion — all tested |
| Period stats formulas (weighted price, €/100km, anchor-in-period) | `TestPeriodStats` — 6 tests, exact numbers |
| Routing order/caching/batching/km↔m for both providers | `test_routing.py` — outstanding: order alignment, cache, GPS-drift cache hit, outage→nulls, 301-destination cap, cache bounded at 10 |
| Auth on/off, health 503, docs gated by DEBUG | `test_auth.py` — deliberate decisions encoded as tests, not violations |

**No stale tests found.** Every test asserts current behavior consistent with git/migration history; the two places where a test could look "wrong" (`test_custom_maintenance_type_accepted` = deliberate varchar migration; `test_docs_gated_by_debug`) explicitly document the decision in comments. This is the correct Phase 4 rule 2 behavior.

---

## Tests — findings ranked by impact

### T1 (P1) — `_compute_seasonal_consumption` / autonomy stats: zero backend tests
`backend/app/services/vehicle_service.py:234` (`_compute_seasonal_consumption`), `backend/app/schemas/vehicle.py:17-35` (`range_km*`, `e85_fraction`, `e10/e85_consumption`).
- **Why it matters:** CONTEXT.md's 2026-07-05 session documents the longest debug run in the project's history on exactly this code: `from_date` filter, drop-until-first-Plein anchoring, per-segment E85 normalisation, 5 L cushion, min/max. Multiple real bugs were fixed *in that session* — none left a regression test behind.
- **Concrete scenario:** vehicle with a conversion and a single fill-to-fill segment; if the "drop until first full tank on/after `from_date`" logic regressed, a leading partial anchors and `range_km` inflates (documented 26 L/100 km → 171 km "ville" failure mode). Nothing in the suite fails.
- **Fix shape:** 3–4 backend tests pinning exact numbers: (a) range formula `(tank−5)×100/avg`; (b) leading-partial-after-`from_date` not anchoring; (c) pre-conversion fills excluded from the season bucket; (d) per-segment normalisation vs average normalisation (two segments with different E85 fractions — the documented worked example in CONTEXT.md gives exact expected values).

### T2 (P1) — The odometer-decrease override success path is untested
`backend/app/services/fuel_service.py:35-52` (`allow_odometer_decrease=True`), same for update (`:158-188`).
- Only the **reject** path is tested (`test_create_fuel_entry_below_initial_odometer_rejected`, test_fuel_entries.py:58). The override itself — a documented 2026-08-14 feature ("historical correction only") — is never exercised. A regression that makes the override always-reject, or always-allow (silently swallowing real data-entry errors), passes the whole suite.
- **Fix shape:** one test creating an entry below the latest reading with `?allow_odometer_decrease=true` (expect 201), and one PUT with the override (expect 200).

### T3 (P2) — The 2026-05-27 chart bug class is untested (logic inline in components)
`frontend-react/src/components/charts/MonthlyCostChart.tsx`, `EthanolHistoryChart.tsx`, `DistanceChart.tsx`, `RefuelingPatternChart.tsx`.
- The booster-cost drop, ghost-fuel drift, gap-spreading, and plein-fold bugs were all real and fixed, but the logic lives inside React components with no vitest coverage. Only `blend-math.ts` (extracted separately) is tested.
- **Fix shape:** the project already has the precedent — extract the *already-proven-buggy* computations (monthly cost spread incl. booster handling; gap spreading; plein folding) into pure functions in `src/lib/` and test them, mirroring `blend-math.test.ts`. Do **not** test the components themselves (no RTL in the project — don't add it for this).

### T4 (P2) — Backend consumption-history same-stop tiebreaker has no discriminating test
`backend/app/services/fuel_service.py` (`get_consumption_history` / `get_fuel_statistics_by_vehicle`).
- The 2026-05-27 Bug 3 (backend non-deterministic sort for FlexFuel stops) is only caught by the **frontend** twin test (`computeAvgConsumption`). Backend tests use distinct odometers (`test_partial_fills_accumulate`). If the backend sort drifts from `(date, odometer, is_full_tank ASC, id)`, no backend test fails.
- **Fix shape:** one statistics test with a same-odo booster+full pair asserting the booster is consumed by the closing full (mirror the frontend 8.0→9.0 case with backend values).

### T5 (P2) — `/stats/batch` and `/timeline` endpoints untested
`backend/app/api/v1/endpoints/vehicles.py:150` (`stats/batch`), `:214` (`timeline`).
- Batch fallback is tested frontend-side (`shouldFetchIndividualStats`, vehicle-stats.test.ts) but the endpoint itself is not. Timeline merges fuel + maintenance; a soft-delete filter regression there would be silent (Phase 4 critical-path gap: soft-delete filtering in every query path).

### T6 (P2) — Offline provider behavior untested (core-value path)
`frontend-react/src/hooks/use-offline.tsx` (159 lines).
- Only the status classifier is tested. The documented behaviors — 60 s retry of transient failures, preserving entries added during an in-flight sync, server-down queueing, cross-tab idempotency (2026-08-10 / 08-14 sessions) — are untested. This is the app's entire reason to exist ("log a fill offline at the pump"). The core logic could be extracted to a testable pure module (queue state machine over an injected clock), or at minimum the reducer logic unit-tested.
- **Note the risk of touching this:** refactoring the provider to be testable is a behavior-preserving refactor; the existing integration behavior is documented in CONTEXT.md and must be kept.

### T7 (P3) — Frontend hooks with real bug history are untested
`use-vehicles` (active_only default, real bug 2026-04-15), `FuelEditDialog` fuel_type preservation (real bug 2026-04-15), `use-maintenance-reminders.ts` logic. React-Query hook logic and dialog submit logic have no tests; acceptable for a homelab app, but the two 2026-04-15 bugs are cheap to pin if the logic is ever extracted.

### T8 (P3) — Weak/conditional tests
- `test_rentability_monthly_avg_excludes_current_month` (test_flexfuel.py:201) is date-dependent and only asserts `is not None` — it can silently pass without testing the exclusion. Either pin it to a fixed fake date (freeze the clock) or assert the exact expected average.
- `test_pagination` (test_fuel_entries.py:195) covers page 1 of 2 but not page-beyond-end (an off-by-one returning 200 instead of empty is undetected).
- Zero-distance segment (two fulls at the same odometer → division by zero in consumption) is untested anywhere — the singularities are well-tested frontend-side for thresholds, not for the consumption path.

### T9 (P3) — Suite ergonomics (verified)
- Backend: the documented Docker command works as written — `docker compose run --rm -v ./backend:/app backend sh -c "pip install -q pytest pytest-asyncio httpx && python -m pytest tests/ -v --tb=short"` → **120 passed in 3.67 s** (verified today). Fast, per-test rollback, session-scoped schema.
- Frontend: `npm run test` → **32 passed in 473 ms** (vitest 4.1.10, verified today).
- Test-count claims in CLAUDE.md/CONTEXT.md (120 backend + 32 frontend) are accurate.
- Minor: `conftest.py` uses a file-backed `sqlite:///./test.db` — leaves a `test.db` file in `backend/` after runs (works, but a `:memory:` or tmp path would avoid stray artifacts).

---

## Features (Phase 5)

### Decision-ledger check (what not to propose)
- **Route/toll optimizer & full trip planner — REJECTED** (git `4909ca2` "remove trip planner entirely"; project memory records the rejection). Do not re-propose. A *pure fuel-cost estimator* (no routing, no map) is a different, smaller thing and remains viable (see F2).
- **Push notifications, photo upload, PDF export, multi-vehicle comparison, multi-user** — listed "Not Implemented", not formally rejected; the user's philosophy (single user, no over-engineering, no auth complexity) means: only build if the user asks. Do not put them on a recommended list.
- **Dev compose credentials exposure** — accepted risk, do not re-litigate.

### docs/gap-analysis.md staleness (generated 2026-05-12)
| Item | Status |
|---|---|
| #1 No odometer monotonicity check | **DONE** (2026-08-14) — stale |
| #2 Soft delete inconsistency (flexfuel hard delete) | **DONE** — conversion + E10 prices now soft-deleted and tested — stale |
| #3 `Vehicle.fuel_type` plain String vs docs' ENUM | **Still open** (model `vehicle.py:24` is `String(20)`; CLAUDE.md/architecture doc claim an ENUM). Doc/code disagreement; low impact for a single-user app, but the doc should be corrected or the model aligned. |
| #4 VehicleStats untyped dict merge | Still open, internal, low value — skip |
| #5 Pydantic `.dict(exclude_unset)` | **DONE** — no occurrences remain — stale |
| #6 No FlexFuel test coverage | **DONE** — 28 tests — stale |
| #7 `.env` in git history | Still open; tracked in docs/TODO.md #6 (P2) — leave as-is |

### Recommended features (ranked by value-to-effort, philosophy-fitting, all reuse existing data)

**F1 (P1, S) — Refuel-by / remaining-range badge on VehicleCard** (gap-analysis A1)
- Data already exists: `VehicleStats.range_km`, `days_since_last_entry` (`backend/app/schemas/vehicle.py:31-35`; stats already fetched per card via `useVehicleStats`). Frontend-only.
- Serve the core moment ("should I stop at this pump?"). Label it an estimate (5 L cushion, no live sensor). No push notifications, no calendar-date inference unless enough history exists.
- This is the single highest-value remaining mobile aid and costs a few hours.

**F2 (P2, S–M) — One-tap trip fuel-cost estimator (no routing)** (gap-analysis A2, reduced)
- Distance input + vehicle + fuel type → litres + €, using existing seasonal consumption and optional current price. Pure frontend math, no endpoint, no map, no tolls — explicitly *not* the rejected trip planner.
- Only worth building if F1 isn't enough; it reuses the same stats.

**F3 (P2, S) — Date-filtered CSV export** 
- Existing export (`src/lib/csv.ts`, Fuel/Maintenance dialogs) is all-history; a start/end period filter reuses everything already loaded. Small, honest for reimbursements/annual review.

**F4 (P2, S) — Next-service summary in the maintenance reminder surface**
- Reuses `use-maintenance-reminders.ts` and existing Maintenance types: show latest service + next date/km compactly. No scheduler, no notifications.

**F5 (P2, M) — Safety rail: regression tests for `_compute_seasonal_consumption`** (same as T1)
- The cheapest "feature" with the biggest correctness payoff: pin the autonomy formulas before anyone touches them again. If any autonomy work happens next, this test must come first.

**F6 (P3, S) — Fix the doc drift** (#3 above + gap-analysis header)
- Update the architecture doc to state `vehicles.fuel_type` is a plain string in the ORM (migration may differ), or align the model. One-line doc edit either way.

**Not recommended now:** range circle overlay on the station map (A3 — nice but M effort, needs the map + stats wiring, lower value than F1 for the same workflow), multi-vehicle comparison, fuel budget/market-price history/calendar heatmap (gap-analysis tail items — configuration burden for a single user).

---

## What is already well-defended (summary)
- Fill-to-fill math (weighted mean, anchoring, accumulation) — dual-tested backend + frontend, discriminating fixtures.
- Blend math singularities — swept, including the crash that previously blanked the app.
- Offline classification of permanent vs transient failures.
- Idempotent retries; chronology guards; soft delete in every query path that is tested; routing order/caching/unit conversion (best-tested surface in the repo).
- Auth on/off and health/503 behavior; deliberate decisions encoded as tests.
- Both suites run in seconds and the documented commands are accurate.

## Open risks / known approximations
- Chart and offline-provider logic is untested because it's embedded in components/hooks — the fix shape (extract pure logic, don't add RTL) is a suggestion, not a decision.
- T8's date-dependent rentability test can silently pass; it should be pinned, but it is not masking a known bug today.
- Nothing in this pass was fixed; all findings are report-only.
