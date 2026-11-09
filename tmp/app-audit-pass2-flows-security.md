# App-audit PASS 2 — Flows + Security (VroomVroom)

Date: 2026-08-21 · Scope: end-to-end flows (fuel capture, station prices/routing, maintenance reminders) + security posture calibrated to a personal homelab PWA behind a reverse proxy.

## Verdict

The core pump-capture flow is exceptionally well-defended (idempotent offline queue, degraded-transport fallback, surfaced outcomes), but the app ships with **authentication effectively disabled** (empty `API_KEY` in the real `.env.docker`, and no way for the built frontend to send a key) — the entire CRUD API is open to whoever can reach it, and the docs claim a protection that is off.

---

## Flows

### F1 — HIGH · Fuel *edit* and maintenance add/edit have no degraded-transport path: raw error + input loss on server-down
- **Evidence:** `frontend-react/src/components/fuel/FuelEditDialog.tsx:119-120` → `toast.error(e instanceof Error ? e.message : 'Erreur lors de la mise à jour')`; same shape at `MaintenanceAddDialog.tsx:81-82`. Only `FuelAddDialog.tsx` (~line 195-200) catches non-`ApiError` (timeout/DNS/refused) and falls back to `addToQueue`.
- **Scenario:** LTE is up, homelab is down (the exact case the create path handles). User edits a mistyped fill at the pump → `mutateAsync` throws `TypeError: Failed to fetch` / abort-timeout → English raw error toast, dialog stays open, nothing preserved beyond the current form state, no queue offered. If the user navigates away or reloads, the correction is lost. Same for adding maintenance while the backend is unreachable.
- **Fix shape:** Reuse the offline queue for updates — an update is naturally idempotent (targets `entry_id`), so `PUT /fuel-entries/{id}` replayed is safe; add `{mode:'update', id, data}` queue items and replay on sync. Minimal alternative: French message + keep form open + explicit "Réessayer / Mettre en file d'attente" choice. Backend already tolerates replay via entry-id targeting.

### F2 — MED · E10 reference price auto-capture silently skipped for offline E85 fills
- **Evidence:** `FuelAddDialog.tsx` (~lines 160-185): the auto-capture of `stationE10PriceRef.current` runs only in the online success branch of `onSubmit`. The offline branch (line 151-157) and the queued-on-transport-failure branch queue only the fuel payload — the E10 price dies with the ref.
- **Scenario:** User is offline at a station whose E10 price is known (from the station list) and fills E85. The fill syncs later, but no E10 reference price is recorded for that date → the rentability/flexfuel charts silently miss a reference point, and there is no visible indication.
- **Fix shape:** Stash `stationE10PriceRef.current` inside the queue item (extend `QueuedFuelEntry` with optional `e10Price`) and record it at sync time with the same date-dedup guard. Or accept as a documented limitation — the reference feed degrades slowly, never corrupts.

### F3 — LOW/MED · Poison-pill variant: 401/403/429 retried every 60 s forever with no escalation
- **Evidence:** `use-offline.tsx:95-102` — only `[400,404,409,422]` are rejected; every other status (incl. 401, 403, 429) is pushed to `transientFailures` and retried on the fixed 60 s timer (`use-offline.tsx:143-145`), no retry cap, no backoff.
- **Scenario:** API key rotated/expired (or, post-F8, a proxy returns 403 permanently): entries sit in the queue forever, retried once a minute indefinitely, with only the purple "N pleins en attente" banner as a signal. A permanent 401 is indistinguishable from a transient outage.
- **Ledger check:** CONTEXT.md 2026-08-14 documents this as deliberate ("retains 401, 403 and 429 responses for retry"). Reported as accepted-with-a-knob: add a consecutive-failure counter → toast alert + stop auto-retry after N attempts (keep manual sync), without changing which statuses are permanent.
- **Fix shape (if ever revisited):** `syncQueue` already returns `{synced, failed, rejected}` — surface `failed > 0 && consecutiveFailures >= 3` as a persistent alert instead of silent timer retries.

### F4 — LOW · Service worker caches all personal API data unbounded, no expiry
- **Evidence:** `frontend-react/public/sw.js:29-42` — every GET matching `/api/` or `carmanagementapi` is `caches.put` into `DATA_CACHE`; cache entries are only ever removed on `activate` for *old cache names*, never by age/volume. Includes fuel entries with GPS coordinates, prices, maintenance, vehicles.
- **Scenario:** Personal device, so impact is small; but the data copy is permanent in the browser's Cache Storage and is served to the origin without any auth context. If the app is ever exposed to other users or the device is shared, this becomes a leak channel.
- **Fix shape:** Bound `DATA_CACHE` (evict entries older than N days, or cap by count) — a 30-line addition in `activate` or on `put`. Otherwise document as accepted (offline support is a core feature).

### F5 — LOW · Falsy filter guards: `vehicle_id=0` bypasses filtering and returns all rows
- **Evidence:** `backend/app/services/fuel_service.py:109` (`if vehicle_id:`), same at 225, 275-284; `maintenance_service.py:70,162` — and `if fuel_type:` / `if start_date:` / `if end_date:` use the same falsy pattern. `vehicle_id=0` or an empty `fuel_type` string silently disables the filter.
- **Scenario:** `GET /api/v1/fuel-entries/?vehicle_id=0` returns every fuel entry for every vehicle instead of none. Single-user app → the same user sees their own data, so impact is cosmetic today — but it is the over-broad-guard class, it contradicts the `ge=1` semantics everywhere else, and it is one future multi-vehicle-auth check away from a real leak.
- **Fix shape:** `if vehicle_id is not None:` and `if fuel_type is not None:` (one-line guards).

### F6 — Well-defended (verified, no change needed)
- **Degraded transport:** create path queues on ANY non-`ApiError` (timeout, DNS, refused), not just `navigator.onLine` — `FuelAddDialog.tsx` catch branch; confirmed both `online` and `offline` event paths plus 60 s timer and reconnect-triggered sync in `use-offline.tsx:130-146`.
- **Idempotency:** `client_request_id` (UUID) on every payload, DB `unique` constraint (`fuel_entry.py:45` + Alembic `e5f6a7b8c9d0`), pre-check + `IntegrityError` fallback both return the existing row — duplicate delivery of the same fill cannot double-count.
- **Confirmations don't lie:** the decreasing-odometer `confirm()` maps end-to-end to `allow_odometer_decrease=true` on the POST and is carried in the queued payload (`FuelAddDialog.tsx`, `use-offline.tsx` QueuedFuelEntry).
- **Queue concurrency:** items added during an in-flight sync survive (filter is by `attempted` id set, `use-offline.tsx:104-107`).
- **Outcomes surfaced:** purple banner shows pending count (`OfflineBanner.tsx`), sync/reject toasts, cache invalidated for all fuel/stats query keys after successful sync (`use-offline.tsx:109-119`, keys match `use-fuel-entries.ts` / `use-vehicles.ts`).
- **Routing:** backend never 500s on provider failure, null legs, failures never cached (`routing_service.py`), per-pair TTL cache with lock + eviction, batch ≤ 95, concurrency 4; frontend `use-station-routes.ts` `retry:false`, empty-map fallback to straight-line haversine — verified in `StationPricesDialog.tsx:195-240`.
- **Station prices:** paged (offset loop to 300, page 100) against the data.gouv API, French error string, `radiusKm` bounds via `within_distance`.

---

## Security

Calibration: personal homelab app, single user, LAN + possibly internet-exposed hostnames (`carmanagement.home.ouiouibaguette.fr` / `carmanagementapi.home.ouiouibaguette.fr` appear in CORS). Verdicts below assume the API may be reachable from the internet via reverse proxy.

### Actionable

#### S1 — HIGH · API authentication is effectively OFF in the deployed configuration
- **Evidence:**
  - `backend/.env.docker` (the real env file both compose files load): `API_KEY=` **empty**. `deps.py:11-14`: `if not settings.API_KEY: return` → `verify_api_key` passes every request.
  - The frontend has **no way to send a key**: `getHeaders` (`frontend-react/src/lib/api.ts`) only adds `X-API-Key` when `import.meta.env.VITE_API_KEY` is set at build; nothing sets it — `frontend-react/Dockerfile` has no `ARG`/`ENV` for it, `docker-compose.prod.yml` has no `build.args`, no `VITE_*` anywhere in repo build config. Grep across Dockerfiles/compose/sh confirmed zero occurrences.
- **Scenario:** Anyone who can reach `:8055` or the reverse-proxied `carmanagementapi.home.ouiouibaguette.fr` can `POST /api/v1/fuel-entries/`, `PUT/DELETE` entries, vehicles, maintenance, and use the routing proxy — full read/write of the user's personal vehicle/fuel/GPS data. If the hostname is internet-resolvable, this is internet-writable data.
- **Doc drift:** CLAUDE.md and the auth tests (`tests/test_auth.py` exists, auth code is correct when a key IS set) claim "API key auth" as the deployed model — the capability exists but is not wired into the actual deployment.
- **Fix shape (when the user wants auth on):** (a) set a real `API_KEY` in `.env.docker`; (b) pass `VITE_API_KEY` at frontend build (`ARG VITE_API_KEY` + `ENV` in Dockerfile, `build.args` in compose); (c) restart both services. Minimal alternative that fits the homelab philosophy: keep auth off deliberately and document it (this is legitimately acceptable **only** if the proxy/network restricts access — see accepted list).
- **Note for the ledger:** verify whether `*.home.ouiouibaguette.fr` is LAN-internal DNS only, or internet-reachable. This determines whether S1 is "open to the LAN" (acceptable) or "open to the internet" (urgent).

#### S2 — LOW · No security headers shipped by the app
- **Evidence:** `frontend-react/nginx.conf` sets only gzip + cache headers — no `Content-Security-Policy`, no `X-Frame-Options`, no `X-Content-Type-Options`, no HSTS; `main.py` adds none either, and no doc says the reverse proxy owns them.
- **Scenario:** A single XSS (or injected third-party content) on the origin runs with full access to `localStorage` (offline queue holds liters/prices/GPS/notes) and Cache Storage (all API data). There is no CSP line of defense.
- **Fix shape:** In nginx.conf add `Content-Security-Policy: default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org https://basemaps.*; style-src 'self' 'unsafe-inline'; connect-src 'self' https://data.economie.gouv.fr https://geo.api.gouv.fr https://carmanagementapi...; font-src 'self' data:` (Tailwind injects inline styles, so `style-src 'unsafe-inline'` is required) plus `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. ~10 lines. Low priority for a homelab, cheap to add.

### Accepted for this threat model (deliberate or documented)

- **S3 — Secrets in git history:** `git log --all` shows `backend/.env.docker` and `backend/.env.local` were committed (initial commit `bc45564`, modified `4b0dd41`, since removed from tracking). Values found in history: `DB_USER/DB_PASSWORD=mathis` (the bundled dev MariaDB default — **accepted per decision ledger** "root docker-compose.yml is development-only; user accepts its exposed/default local database credentials"), `DB_PASSWORD=mystuff` (placeholder in a deleted doc), `API_KEY=change-me-in-production` (placeholder). **No real production credentials in history.** Residual: `mathis/mathis` is forever in the git history — fine for a private repo; if the repo is ever made public, rotate the dev DB password and scrub history (the pending `docs/TODO.md` .env-cleanup item relates).
- **S4 — `/` and `/health` are unauthenticated:** deliberate (Docker healthchecks hit `/health`); `/health` correctly returns 503 on DB loss. The `/` root returns a name+version banner — negligible. `/docs`, `/redoc`, `openapi.json` are gated on `DEBUG` (currently `False` in `.env.docker`) — good.
- **S5 — API key would be baked into the JS bundle if enabled:** inherent to a static frontend + shared-key model; the real control for this app is network reachability. Acceptable for homelab.
- **S6 — Service-worker cache of personal data (F4) and plaintext localStorage queue:** standard PWA offline trade-off on a personal device; no API key or password is stored in localStorage (key comes from build-time env only).
- **S7 — No rate limiting / no request size limit beyond Pydantic schema bounds:** single-user; routing matrix is capped at 300 destinations with bounded batches, so even the heaviest call is bounded. Acceptable; not currently even reachable by third parties only because of S1's state.

### What is already well-defended (security)

- **AuthZ wiring when enabled:** the whole `/api/v1` router is behind `verify_api_key` (`api/v1/api.py:7`), timing-safe `hmac.compare_digest`, `auto_error=False` with a French 403 detail.
- **Injection:** sort/order params are enum-whitelisted (`FuelEntryOrderBy` in `fuel_entries.py:24-34`, `MaintenanceOrderBy` in `maintenances.py:24`), `order` regex-constrained to `^(asc|desc)$`; no raw `getattr` on user input anywhere (verified grep across services). Vehicles endpoint has no sort params at all.
- **Input validation:** Pydantic bounds everywhere (`schemas/fuel_entry.py` liters `gt=0 le=200`, price `le=10`, odometer `le=9999999`, lat/lon ranges, string max_lengths; `schemas/routing.py` coordinate ranges + `max_length=300`); pagination capped (`per_page le=500`, `page ge=1`).
- **CORS:** explicit origins (`localhost:3055`, the two prod hostnames), no wildcard, methods/headers allow-listed.
- **Errors:** `str(e)` is only used for French domain-validation messages mapped to 4xx (`ValueError → 422/404`); unexpected errors log with `logger.exception` and return the generic French 500 "Erreur interne du serveur" — no stack traces or `repr` leak to clients.
- **Dependencies:** `requirements.txt` fully pinned (`fastapi==0.109.0`, etc.), `bun.lock` committed, session log 2026-08-14: `npm audit` reports zero vulnerabilities.
- **Health/monitoring:** `/health` 503s when MariaDB is down so Docker/HA-monitoring fires.
- **SSRF posture:** routing proxy uses a fixed `ROUTING_URL` from settings (existing LAN Valhalla at 192.168.25.25:8002, per decision ledger); coordinates are the only user-controlled input — no arbitrary-target fetch.

---

## What is already well-defended (summary — do not re-audit)

1. Offline fuel-create: idempotent (client_request_id + unique constraint + IntegrityError fallback), survives server-down via any-failure queueing, preserves entries added during sync, distinguishes permanent (400/404/409/422 → rejected + toast) from transient.
2. Confirmation flags survive the queue end-to-end (`allowOdometerDecrease`).
3. Sync outcomes surfaced: pending banner, success/reject toasts, targeted query invalidation.
4. Routing degrades gracefully at every layer (never 500, null legs, straight-line fallback, no retry hammering, bounded batches, cache never poisoned by failures).
5. Maintenance reminders: latest-per-type, one badge, overdue-first.
6. Backend validation bounds + enum-whitelisted sorting + capped pagination; timing-safe key compare; docs gated on DEBUG; pinned deps; no real prod secrets in git history; explicit CORS.

## Approximations worth documenting rather than fixing

- F3 (401/403/429 eternal retry) — accepted by design; flag if it ever produces support friction.
- F2 (offline E10 reference loss) — degrades a bonus metric slowly; acceptable unless the user starts logging many fills offline.
- S1's severity hinges on whether `*.home.ouiouibaguette.fr` resolves outside the LAN — worth a 5-minute check, not code.
