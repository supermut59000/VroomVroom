# Spec — Alerte froid E85 + Filtre stations E85 + Écran « À la pompe »

> 2026-10-30 · **`main` (version serveur) d'abord, repris tel quel dans `android-local`**.
> Contrainte UI : **même tête dans les deux versions** — la couche React est identique ; seule la couche notification diffère, derrière une abstraction.
> Règle de gating : les **spécialités E85** (alerte froid, écran « à la pompe ») ne s'affichent que si au moins un véhicule a un enregistrement de conversion FlexFuel. Le **filtre stations E85** n'est PAS gated (recherche utile à tous).

## État des lieux (vérifié dans le code)

- `hooks/use-nearby-stations.ts` fetch **déjà** `e85_prix` pour toutes les stations (`StationPrices.e85: number | null`) → le filtre E85 est du pur front, zéro risque dataset.
- Sélecteur de ville existant dans `StationPricesDialog.tsx` (debounce + `geo.api.gouv.fr/communes` + `<datalist id="commune-suggestions">`, ~90 lignes) → à extraire.
- `useFlexfuelConversion(vehicleId)` existe (404 = pas de conversion) mais est par-véhicule → le Header a besoin d'un flag global (voir §2.4).
- La règle hiver (31/10–15/03, max 75 % éthanol) existe déjà côté calculs de mélange → on la réutilise, pas une nouvelle constante.

---

## Fonction 1 — Filtre « stations avec E85 »

### UI
- **`StationPricesDialog`** : chip/toggle « Avec E85 » dans la barre d'outils (à côté du sélecteur de carburant), désactivé par défaut. Quand activé : seules les stations avec `prices.e85 != null` sont listées.
- **`NearbyStationsList`** (dans FuelAddDialog après GPS) : même toggle, même comportement.

### Implémentation
- `use-nearby-stations.ts` : `fetch(lat, lon, fuelType?, radiusKm?, e85Only?)` → après parse, `e85Only ? parsed.filter(s => s.prices.e85 != null) : parsed`. Aucune nouvelle requête Opendatasoft, aucune `where` (la pagination existante cap à 300 stations, le filtre ne fait que réduire l'affichage).
- L'état du toggle vit dans chaque composant appelant (2 `useState`), pas dans le hook.

### Fichiers touchés
| Fichier | Changement |
|---|---|
| `frontend-react/src/hooks/use-nearby-stations.ts` | param `e85Only` + filter |
| `frontend-react/src/components/fuel/StationPricesDialog.tsx` | toggle + state |
| `frontend-react/src/components/fuel/NearbyStationsList.tsx` | toggle + state |
| `frontend-react/src/lib/i18n.ts` | `stations.withE85: 'Avec E85'` |

### Tests (vitest)
- Hook : station sans E85 masquée avec `e85Only`, conservée sans ; prix E85 restant lisible après filtre.
- Rendu des 2 composants avec toggle on/off (harnais `renderWithProviders` existant, fixtures déjà en place).

### Impact
**0 backend, 0 migration, 0 nouveau endpoint.** Risque : quasi nul (données déjà fetchées).

---

## Fonction 2 — Alerte froid (spécialité E85, gated)

### 2.1 UX
- **Header** : icône flocon, visible seulement si `hasE85Vehicle` (voir 2.4). Ouvre le `ColdAlertDialog`.
- **`ColdAlertDialog`** (même tête que les autres dialogs shadcn) :
  - toggle « Activer l'alerte froid »
  - **Ville** : `CommuneSelector` extrait (reprend à l'identique le sélecteur de la recherche de stations : saisie ville ou code postal, datalist, coordonnées renvoyées)
  - **Heure de la notification** : input time, défaut `06:45` (démarrage matin)
  - **Seuil de froid** : input °C, défaut `5` (configurable)
  - « Tester maintenant » : fetch de la prévision + affichage du conseil (même message que la notification)
  - Aperçu : « Prochaine vérification : demain 06:45 à Lyon »
  - Note de limitation visible : « L'alerte nécessite que l'app ait été ouverte depuis la veille. »

### 2.2 Données
- **open-meteo** : `GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=temperature_2m&forecast_days=2&timezone=auto` — gratuit, **sans clé API**, CORS navigateur OK. Appel direct depuis le front (comme gouv.fr) : **0 backend**.
- Précision prévision 24–48 h suffisante pour un seuil « ≤ 5 °C » ; les messages disent « prévu ».

### 2.3 Logique pure — `src/lib/cold-alert.ts` (nouveau, 100 % testé)
- **Config** (localStorage `vv_cold_alert`, même shape dans les 2 versions) :
  `{ enabled: boolean, city: { name, cp, lat, lon }, time: 'HH:MM', thresholdC: number }`
- `nextOccurrence(config, now): Date` — prochaine occurrence de l'heure configurée (aujourd'hui si pas dépassée, sinon demain).
- `advice(tempC, date): { level: 'cold' | 'ok', message: string, maxEthanol: 75 | 85 }` :
  - `tempC > thresholdC` → `ok` (pas de notification)
  - `tempC <= thresholdC` **et** période hiver (31/10–15/03, constante existante du blend calculator) → `« {ville} {heure} : {temp}°C prévu — plein E10 conseillé (E85 ≤ 75 % en cette période) »`
  - `tempC <= thresholdC` hors hiver → `« {ville} {heure} : {temp}°C prévu — plein E10 conseillé avant de sortir »`

### 2.4 Gating — flag `has_flexfuel`
- **Backend** : `VehicleStats` gagne `has_flexfuel: bool`. Dans `get_stats_batch` : une seule requête `SELECT vehicle_id FROM flexfuel_conversions` → set, flag par véhicule (0 requête supplémentaire par véhicule). Dans `get_vehicle_stats` : même logique par véhicule (la requête conversion existe déjà ailleurs, une ligne).
- **Frontend** : le Header lit `useAllVehicleStats()` (déjà fetché) → `hasE85Vehicle = stats.some(s => s.has_flexfuel)`.

### 2.5 Notification — `src/lib/notify.ts` (nouveau, la seule brique qui diffère)
Une interface `notifyColdAlert(payload)` avec détection de plateforme :

| | **`android-local` (Capacitor)** | **`main` (PWA / navigateur)** |
|---|---|---|
| Mécanisme | `@capacitor/local-notifications` : à l'ouverture de l'app (et à la sauvegarde de la config), si la prévision de demain à l'heure configurée ≤ seuil → **notification locale planifiée à l'heure exacte** avec le message | À l'ouverture de l'app : même vérification → `new Notification(...)` **immédiate** (la veille au soir, ou le matin si l'app est ouverte avant) + **banner persistant** dans le Dashboard jusqu'à la date passée |
| Permission | permission Android notifications (demandée à l'activation) | `Notification.requestPermission()` à l'activation ; refusée → banner seul |
| Bonus | — | SW `background sync` best-effort (Android Chrome) — non garanti, traité comme un bonus silencieux |
| Limitation v1 (documentée) | si l'app n'est pas ouverte depuis 1 j, pas de notification | pas de push à l'heure exacte en app fermée (vrai push = VAPID/FCM → **P2, pas fait**) |

La détection : `window.Capacitor?.isNativePlatform?.()` → chemin natif ; sinon navigateur. Les 2 chemins partagent `cold-alert.ts` et le message exact → **même tête, même phrase**.

### 2.6 Fichiers
| Fichier | Statut |
|---|---|
| `frontend-react/src/lib/cold-alert.ts` | **nouveau** (logique pure + storage) |
| `frontend-react/src/lib/notify.ts` | **nouveau** (abstraction navigateur / Capacitor) |
| `frontend-react/src/components/flexfuel/ColdAlertDialog.tsx` | **nouveau** |
| `frontend-react/src/components/fuel/CommuneSelector.tsx` | **nouveau** (extrait de StationPricesDialog, qui passe à l'utiliser — comportement identique) |
| `frontend-react/src/components/layout/Header.tsx` | modifié (icône flocon gated + ouverture dialog) |
| `frontend-react/src/components/fuel/StationPricesDialog.tsx` | modifié (CommuneSelector extrait) |
| `frontend-react/src/pages/Dashboard.tsx` | modifié (banner alerte froid) |
| `frontend-react/src/lib/i18n.ts`, `src/types/index.ts` | modifiés (keys + `has_flexfuel`) |
| `backend/app/schemas/vehicle.py`, `backend/app/services/vehicle_service.py` | modifiés (`has_flexfuel`) |
| `frontend-react/package.json` | **android-local seulement** : `@capacitor/local-notifications` (+ commit des 2 lockfiles — règle bun/npm du prod build) |

### 2.7 Tests
- **vitest** : `cold-alert.ts` (période hiver/été, seuil égal/passé, `nextOccurrence` au jour et au lendemain, messages exacts) ; `notify.ts` (branching Capacitor vs navigateur, mocks) ; `ColdAlertDialog` (rendu, gating invisible sans conversion, sauvegarde config) ; `CommuneSelector` (comportement inchangé après extraction — les tests StationPricesDialog existants doivent passer sans modification de comportement).
- **pytest** : `has_flexfuel` dans le batch (1 véhicule avec conversion + 1 sans) et dans les stats unitaires.

### 2.8 Impact / risques
- **0 migration, 0 endpoint nouveau.** Backend : 1 champ de schema + 1 requête dans le batch.
- **Privacy** : la ville (coordonnées communes) est envoyée à open-meteo → à déclarer dans la politique de confidentialité / data safety (à côté de l'OSRM déjà déclaré).
- **open-meteo** : offre gratuite non-commerciale (~10k req/jour) ; app partagée = chaque téléphone = chaque IP, pas de bottleneck.
- **Extract CommuneSelector** : le plus risqué des 2 features (composant testé qui bouge) — les tests StationPricesDialog existants font la garde-fou.

---

## Fonction 3 — Écran « À la pompe » (spécialité E85, gated par conversion)

> Objectif : le flow en une main à la pompe — **quoi mettre, puis l'enregistrer**, sans quitter l'écran.
> **Pour expérimenter** : ne remplace PAS le `BlendCalculatorDialog` existant (il reste tel quel) — c'est un 2e point d'entrée, plus direct. Si après 2 semaines d'usage il n'apporte rien, le coût de retrait = 1 composant + 1 bouton.
> **Zéro algorithme nouveau** : tout existe déjà dans `src/lib/blend-math.ts` (testé) : `computeTankState` (état du réservoir), `computeWinterRec` (les 3 recommandations), `computeThresholds` (odoA/odoB), `e85EthanolFraction` (période hiver), `MIN_PUMP_LITERS`.

### UX (mobile-first, une main)

Nouveau dialog `PumpFillDialog`, point d'entrée = bouton **« À la pompe »** sur la carte du véhicule au Dashboard (à côté de l'entrée BlendCalculator existante), affiché seulement si conversion.

3 blocs empilés :
1. **Réservoir** (sans saisie) : « 42,3 L restants · 78 % d'éthanol » — `computeTankState` sur les entrées du véhicule. Si aucun Plein depuis la conversion : message d'onboarding « faites un plein pour initialiser le calcul ».
2. **Ce que tu mets** — `computeWinterRec` + bande cible de la conversion (target ± tolérance) :
   - au-dessus de la cible → « E85 15,0 L seulement — tu dilues au prochain plein »
   - pur E85 OK → « Plein E85 — OK jusqu'à [odoA] km »
   - mélange → « Étape 1 — E10 : 5,0 L, puis Étape 2 — E85 : 44,9 L » (l'ordre pompe diluant-avant est déjà correct dans le calcul)
3. **Enregistrer** (1 tap « ✓ Enregistrer ces pleins ») :
   - mini-forme inline : odomètre (défaut = dernier plein), prix E85/L (défaut = dernier prix E85), prix E10/L (défaut = prix de référence E10 global du jour — mécanisme existant), GPS + station (mêmes boutons que FuelAddDialog)
   - champs litres **éditables** (si l'utilisateur s'écarte de la recommandation)
   - génère **2 entrées** (pattern déjà implémenté et testé : même date/odometer/stop, `client_request_id` propre à chaque entrée pour l'idempotence, compatible queue offline) via `useCreateFuelEntry` × 2 :
     - diluant : `fuel_type: 'e10'` (ou diluant de la conversion), `is_full_tank: false`
     - E85 : `fuel_type: 'e85'`, `is_full_tank: true`
     - (reco mono-carburant → 1 seule entrée)
   - après : « Réservoir : 81 % d'éthanol · prochain mélange vers [odoB] km » + invalidation des queries existantes.

### Réutilisé (zéro code nouveau)
- `blend-math.ts` : état, reco, seuils (pur, testé)
- `useCreateFuelEntry` + queue offline (`kind: fuel-create`)
- prix de référence E10 (global, par date)
- GPS + autocomplete stations (NearbyStationsList existant ; si > 40 lignes de dupliqué avec FuelAddDialog, extraire un composant `StationFields` — sinon laisser tel quel)

### Code nouveau
| Fichier | Statut |
|---|---|
| `frontend-react/src/components/flexfuel/PumpFillDialog.tsx` | **nouveau** (orchestre blend-math + mutations) |
| `frontend-react/src/lib/pump-fill.ts` | **nouveau** — helper pur `buildBlendPayloads(winterRec, form) → FuelEntryCreate[]` (1 ou 2 entrées) |
| `frontend-react/src/pages/Dashboard.tsx` (+ carte véhicule) | modifié — bouton « À la pompe » gated |
| `frontend-react/src/lib/i18n.ts` | modifié — keys `pump.*` |
| Backend | **aucun** |

### Tests (vitest)
- `pump-fill.ts` : reco au-dessus → 1 entrée E85 (`is_full_tank: true`) ; reco mélange → 2 entrées (flags, même date/odometer, `client_request_id` distincts, diluant depuis la conversion, prix E10 depuis la référence) ; reco pure → 1 entrée.
- `PumpFillDialog` : onboarding (aucun Plein), rendu des 3 cas reco, édition des litres, échec transport → les 2 entrées en queue offline (harnais existant), invalidation post-enregistrement.
- Régression : `blend-math.test.ts` + tests BlendCalculator existants verts sans modification.

### Impact
0 backend, 0 migration, 0 endpoint. **~1–2 jours.** Tout l'algorithme est déjà testé → le risque est dans l'orchestration UI, couvert par le harnais existant.

---

## Ordre d'exécution (`main` d'abord)

1. **Filtre E85 stations** (½ j) — indépendant, livrable seul.
2. **`has_flexfuel`** backend + tests (½ j).
3. **`cold-alert.ts` + `notify.ts` (chemin navigateur) + tests** (1 j).
4. **Extraction `CommuneSelector` + `ColdAlertDialog` + Header + banner + i18n** (1–2 j).
5. **Écran « À la pompe »** : `pump-fill.ts` + `PumpFillDialog` + bouton Dashboard + tests (1–2 j) — indépendant des fonctions 1/2, testable dès la v1 pour juger de son intérêt.
6. `npm run build` + `npm run test:full` (unit + e2e + prod build) + pytest.
7. **`android-local`** : plugin Capacitor local-notifications + chemin natif de `notify.ts` + AAB (½ j — la logique est déjà testée sur main).

**Total : ~5–6 jours sur `main`, ½ j de reprise sur `android-local`.**
