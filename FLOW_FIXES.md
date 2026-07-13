# Flow fixes — tracking (2026-07-13 audit)

Temp working file for the pump-flow findings from the /app-audit pass.
Delete once everything is ✅ and deployed.

| # | Finding | Status | Solution implemented |
|---|---------|--------|----------------------|
| 1 | "Continuer ?" confirm is a lie — nothing passes `allow_odometer_decrease` to the backend, legitimate backfills 422 | ✅ | `FuelAddDialog` sets `allowOdometerDecrease: true` when the user confirms a lower reading; `useCreateFuelEntry` and the offline queue's `syncQueue` both map it to `POST /fuel-entries/?allow_odometer_decrease=true` (flag stripped from the body). Queued entries carry the flag (`QueuedFuelEntry`). |
| 2 | Offline queue poison pill — permanent 422s retried forever, silently; sync results never surfaced | ✅ | `use-offline.ts` `syncQueue`: `ApiError` with 4xx = permanent → dropped from queue + 10 s error toast naming the lost entry (liters + date + reason); network/timeout/5xx = transient → kept for retry. Success surfaces "N plein(s) synchronisé(s)" and invalidates all fuel/vehicle query caches (UI was left stale before). |
| 3 | Online-but-server-down loses the fill — queue only engaged when `navigator.onLine` was false | ✅ | `FuelAddDialog` catch block: `ApiError` (server answered, rejected) → error toast with the reason; anything else (timeout, DNS, connection refused — LTE up, homelab down) → entry queued + "Serveur injoignable — plein mis en file d'attente" toast. The fill is never lost. |
| 4 | E10 auto-capture dedup race — `!e10Prices?.some(...)` passes while the list is still loading → duplicate reference price possible | ✅ | Guard now requires `e10Prices != null` (list loaded) before capturing; while loading, capture is skipped (it's best-effort anyway). |
| 5 | Prod auth ambiguity (frontend can't send a key; API likely open behind proxy) | ✅ accepted | **Risk accepted by user (2026-07-13) — LAN-only exposure. No change.** |
| 6 | No frontend tests — pure blend-math functions untested (today's crash lived there) | ✅ | Blend math extracted from `BlendCalculator.tsx` to `src/lib/blend-math.ts` (pure, no React). `src/lib/blend-math.test.ts`: 15 vitest tests incl. the 0.85-singularity crash regression, a renderer-contract sweep (`odoBNow=false ⇒ odoB≠null` over the whole fraction range), distance-weighted vs simple-mean discrimination, same-stop booster tiebreaker, cumulative-odo planner regression. Run: `npm run test` (vitest). **CI: run alongside backend pytest when Forgejo Actions gets wired.** |

## Deployment notes

- Frontend-only changes — no migration, `docker compose -f docker-compose.prod.yml up -d --build` is enough.
- New dev dependency: `vitest` (frontend-react). CI job to add later: `cd frontend-react && npm ci && npm run test && npm run build`.
