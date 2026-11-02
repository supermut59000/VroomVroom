# Spec — Recréer le BlendCalculator dans son état du 15 août 2026 (commit `b398c72`)

Document à donner à un agent pour **refaire exactement** le comportement du calculateur
de mélange E85 tel qu'il existait au commit **`b398c72`** (« Implémentation terminée. »,
15 août 2026). Avant la refonte du 2 nov 2026 (4 saisons à bornes `c860a69`, cible
saison `a58b431`, retraits `51e7086`).

**Source de vérité absolue** — si le repo Forgejo est accessible, lire les 2 fichiers à
cet état et les recopier/adapter :

```bash
git show b398c72:frontend-react/src/lib/blend-math.ts          # 396 lignes, math pures
git show b398c72:frontend-react/src/components/flexfuel/BlendCalculator.tsx  # 493 lignes, UI
git show b398c72:frontend-react/src/lib/blend-math.test.ts     # tests de l'époque
```

Tout le reste de ce document définit le comportement en clair pour vérification.

---

## 1. Principe central de cet état : le « grade du jour » binaire

L'E85 a **une seule fraction d'éthanol par jour**, choisie par saison (pas d'intervalle
min–max, pas de 4 saisons, pas de cible adaptée à la saison — tout ça vient plus tard) :

```ts
export function e85EthanolFraction(date: string | Date = new Date()): number
// hiver  → 0.75
// sinon  → 0.85
```

Fenêtre « hiver » : **31 octobre inclus, 1er novembre → 15 mars inclus**.
Formule exacte : `month === 11 || month === 12 || month <= 2 || (month === 3 && day <= 15) || (month === 10 && day === 31)`.

Justification (commentaire d'origine) : l'E85 d'hiver fait 60–75 % d'éthanol ; on prend
le max obligatoire (75 %) comme borne conservatrice — surestimer l'éthanol recommande
plus de diluant, jamais moins. Les intersaisons gardent 85 % (stock d'été possible).

Fractions des autres carburants :

| type      | fraction éthanol |
|-----------|-----------------|
| essence (E10) | 0.10 |
| sp98      | 0.05 |
| diesel, gpl, electrique, hybride | 0.0 |

`fuelEthanolFraction(fuelType, date)` = e85 ? `e85EthanolFraction(date)` : table ci-dessus.

Constantes : `MIN_PUMP_LITERS = 5` (un plein de pompe fait au moins 5 L).
`DilutantType = 'e10' | 'sp98'`.

## 2. Entrées du composant

```tsx
<BlendCalculator conversion vehicle entries embedded? />
```

- `vehicle.tank_capacity` (défaut **50** si null),
- `conversion.conversion_date`, `conversion.target_ethanol_pct` (la « cible », ex. 75),
  `conversion.ethanol_tolerance_pct` (tolérance, ex. 3),
- `entries` : tous les FuelEntry du véhicule ; on n'utilise que ceux avec
  `fueling_date >= conversion_date`.
- État UI local : `dilutantType` (défaut `'e10'`), `currentOdo` (string, défaut vide →
  dernier odo connu), `intervalKm` (défaut `'300'`), `intervalOverrides` (par plein
  futur), `showFutureFills` (défaut false).
- `dilutantEthFraction = dilutantType === 'e10' ? 0.1 : 0.05` ; libellé « E10 » / « SP98 ».

**Garde d'entrée** : si `computeAvgConsumption` renvoie null (pas assez de pleins
complets depuis la conversion) → afficher seulement :
« Pas assez de données depuis l'installation du boîtier. Enregistrez au moins deux pleins
complets. » (Card complète si non embedded, paragraphe seul si embedded.)

En-tête de la Card (non embedded) : icône `FlaskConical` émeraude + titre « Mélange E85 »
+ sous-titre `Cible {target}% · {capacité} L · {consommation} L/100km`.

## 3. Math pures (dans `src/lib/blend-math.ts`, sans React/DOM)

### 3.1 `computeAvgConsumption(entries, conversionDate) → number | null`

Tri des entries : `(fueling_date, odometer_reading, is_full_tank ASC, id)` — un Partiel
précède son Plein au même stop pour qu'un booster s'absorbe dans le plein qui ferme le
segment. Méthode **pondérée par distance** : on ancre au 1er plein complet, on
accumule les litres (pleins et partiels) jusqu'au plein suivant,
`consommation = Σ litres × 100 / Σ km`. Renvoie null si aucune distance > 0.

### 3.2 `computeTankState(entries, conversionDate, tankCapacity) → { litersInTank, ethanolLiters, lastOdo }`

Méthode **exacte plein-à-plein** (miroir d'EthanolHistoryChart), sans estimation au
L/100km :

- Les entries partageant le même `(fueling_date, odometer_reading)` forment **un stop**
  (tri : date, odo, id).
- À chaque stop : `accLiters += Σ litres`, `accEthLiters += Σ litres × fraction(du jour de l'entry)`.
- Si le stop contient un Plein :
  - 1er plein connu → `ethFraction = accEthLiters / accLiters` (0 si accLiters = 0) ;
  - `accLiters >= tankCapacity` → le tank est entièrement remplacé : `ethFraction = accEthLiters / accLiters` ;
  - sinon (plein partiel « en réalité plein ») → mélange :
    `remainingOld = capacity − accLiters` ;
    `ethFraction = min((ethFraction × remainingOld + accEthLiters) / capacity, 1)`.
- Retour de l'état **au dernier plein** : `litersInTank = tankCapacity`,
  `ethanolLiters = ethFraction × tankCapacity`, `lastOdo = odo du dernier plein`.
- Pas encore de plein depuis la conversion : si des litres ont été pompés, on renvoie
  cet état brut ; sinon `{0, 0, 0}`.
- Les partiels *après* le dernier plein sont ignorés (absorbés par le prochain plein).

### 3.3 État courant à l'odomètre saisi (dans le composant)

```
distance = max(0, inputOdo − tankState.lastOdo)
consommé  = distance × avgConsumption / 100
remainingLiters = min(max(0, tankState.litersInTank − consommé), tankCapacity)
currentEthanolPct = (ethanolLiters / litersInTank) × 100   # la fraction ne bouge pas en roulant
ethanolLiters = (currentEthanolPct / 100) × remainingLiters
```

### 3.4 `computeThresholds(...) → { odoA, odoB, odoBNow, pureE85AlwaysSafe }`

Params : `remaining, ethFraction, tankCapacity, targetPct, tolerancePct,
dilutantEthFraction, avgL100km, fromOdo, e85EthFraction (défaut 0.85)`.
`targetMax = (target + tol)/100`, `target = target/100`, `eps = 0.001`.

Ordre des cas (court-circuit) :

1. `e85EthFraction <= targetMax` → **`pureE85AlwaysSafe: true`** (le grade du jour ne
   dépasse jamais la limite : odoA = odoB = null, odoBNow = false).
2. `avgL100km <= 0` ou `|ethFraction − e85EthFraction| < eps` (tank déjà au grade) →
   `odoA = null, odoB = null, odoBNow = true, pureE85AlwaysSafe = false`.
3. Sinon :
   - **odoA** — dernier km où un **plein E85 pur** tombe encore ≤ targetMax :
     `rA = capacity × (targetMax − f85) / (fEth − f85)` ; si `rA >= 0 && remaining > rA`
     → `odoA = round(fromOdo + (remaining − rA) × 100 / avgL100)`, sinon null.
   - **odoB** — 1er km où un mélange optimal (min-pompes de diluant → cible exacte)
     devient faisable : `denomB = f85 − fEth` ; si `denomB > eps` :
     `rB = (5 × (fDil − f85) − capacity × (target − f85)) / denomB` ;
     si `rB <= 0 || remaining <= rB` → `odoBNow = true`, sinon
     `odoB = round(fromOdo + (remaining − rB) × 100 / avgL100)`.
     Si `denomB <= eps` → `odoBNow = true`.

### 3.5 Max plein partiel E85 (dans le composant, `limitFill`)

La plus grosse quantité d'E85 ajoutable **maintenant** sans dépasser `targetMax` :

- Si `f85 <= targetFrac` : plein complet autorisé →
  `{liters: maxFill, resultPct: (eth + maxFill×f85)/capacity, isFull: true, addedKm}`.
- Sinon, si `fEth >= targetFrac` : null (déjà au-dessus, l'E85 ne peut qu'empirer).
- Sinon : `x = (remaining × targetFrac − eth) / (f85 − targetFrac)` ;
  `liters = min(x, maxFill)` ; `resultPct = (eth + liters×f85)/(remaining + liters)` ;
  `isFull = x >= maxFill − 0.5` ; `addedKm = round(liters × 100 / avgL100)`.

### 3.6 `computeWinterRec(...) → WinterRec` (recommandation principale, « mode hiver intelligent »)

Params : `remainingLiters, ethanolLiters, tankCapacity, targetPct, tolerancePct,
dilutantEthFraction, avgL100km, currentOdo, e85EthFraction (défaut 0.85)`.
`toAdd = capacity − remaining`.

1. **`toAdd < 5`** → `{type: 'tank_full', currentPct}`.
2. **E85 pur OK** : `afterE85Pct = (eth + toAdd × f85) / capacity <= targetMax` →
   `{type: 'pure_e85', e85Liters: round1(toAdd), resultPct, kmSafe, kmRelative}`.
   kmSafe : si `afterE85Pct < f85 − 0.001`,
   `rSafe = capacity × (targetMax − f85) / (afterE85Pct − f85)` ;
   si `0 <= rSafe < capacity` → `dist = (capacity − rSafe) × 100 / avgL100` ;
   `kmSafe = round(currentOdo + dist)`, `kmRelative = round(dist)`, sinon null.
3. **Mélange** : résoudre pour x litres de diluant + (toAdd − x) litres d'E85 →
   fraction cible exacte :
   `numerator = target × (remaining + toAdd) − eth − f85 × toAdd`
   `denominator = fDil − f85` ; `xIdeal = numerator / denominator`.
   Arrondis/contraintes **dans cet ordre** :
   - `xIdeal <= 0` → `x = 0` (retombe en pure_e85 avec kmSafe null) ;
   - `xIdeal < 5` → `x = 5` ;
   - sinon `x = round1(xIdeal)`, plancher 5 ;
   - si le reste E85 `toAdd − x < 5` → `x = ceil1(toAdd − 5)` (plafonner le diluant
     pour laisser 5 L d'E85 minimum) ; si `x < 5` → `x = 0`.
   Résultat : `e85 = round1(toAdd − x)` ;
   `resultPct = (eth + x×fDil + e85×f85) / (remaining + x + e85)` ;
   `withinTolerance = target−tol <= resultPct <= target+tol`.

Arrondis : `round1 = Math.round(v*10)/10` (Math.round, **pas** Math.ceil, depuis
`95185cd`).

### 3.7 `simulateFutureFills(...)` (planificateur « Pleins futurs »)

4 pleins simulés. Pour chaque intervalle :
- `consommé = intervalleKm × avgL100 / 100` ; `remAfter = max(0, rem − consommé)` ;
  `ethAfter = eth × remAfter/rem` ; odo cumulatif.
- `computeWinterRec` à cet odo ; mapping : pure_e85 → (0, e85Liters), blend →
  (dil, e85), tank_full → (0, 0, % actuel).
- `withinTolerance` recalculé sur le target ± tol.
- État suivant : `rem = min(remAfter + dil + e85, capacity)` ;
  `eth = min(ethAfter + dil×fDil + e85×f85, capacity)`.

## 4. Layout UI exact (ordre des blocs, dans `CardContent`, `space-y-3`)

1. **Sélecteur de diluant** — ligne « Diluant » + Select (h-8 w-24) : E10 / SP98.
2. **Les 2 cartes de seuils** (grille 2 colonnes, gap-2). Pas de ligne « grade » au
   dessus des cartes dans cet état — le grade n'apparaît que dans le texte des cartes
   (« Grade du jour 85 % ») et en pied (« E85 du jour : 85 % »).

   ### Carte A — « E85 pur » (bordure/ fond émeraude | jaune | neutre)
   Machine à états, **ordre d'évaluation** :
   - `pureE85AlwaysSafe` (émeraude) :
     « Toujours possible » / en gros **« Grade du jour {round(f85×100)}% »** /
     « Sous la limite de {target+tol}% ».
   - sinon `odoA !== null` (émeraude) : « Jusqu'au km » / **odoA** (fr-FR) /
     « dans ~X km » ; si `limitFill` : ligne séparée par bordure —
     « Plein complet: {liters} L → {pct}% · +{km} km » (si isFull) ou
     « Max: {liters} L → {pct}% · +{km} km ».
   - sinon `limitFill` (jaune) : « Partiel possible » / **{liters} L E85** /
     « → {pct}% · +{km} km ».
   - sinon (neutre) : « Fenêtre passée » / « E85 pur ≥ {target+tol}% ».

   ### Carte B — « Dilution {E10|SP98} » (bleu)
   - `pureE85AlwaysSafe` : « Inutile avec le grade actuel ».
   - `odoBNow` (bleu foncé) : « Maintenant » / **km {inputOdo}** /
     « 5 L+ {diluant} → {target}% ».
   - `odoB !== null` : « À partir du km » / **odoB** / « dans ~X km ».
   - sinon : « — ».

3. **Séparateur** : « Calculer pour un odomètre précis ».
4. **Input odomètre** (placeholder = dernier odo connu) + boutons **+50 / +100 / +200**
   (ajoutent au odo en vigueur).
5. **Carte recommandation** (`winterRec`) :
   - `tank_full` : « Réservoir presque plein. »
   - `pure_e85` (émeraude) : « **{L} L E85 pur** » / « Résultat : {pct}% — cible ≤
     {target+tol}% » / si kmSafe : « Dilution nécessaire vers le km {kmSafe} (dans ~
     {kmRelative} km) ».
   - `blend` (bleu) : si `currentEthanolPct > target+tol` : alerte orange « Taux actuel
     ({pct}%) au-dessus de la limite — dilution nécessaire » ; puis « **{dil} L
     {diluant} + {e85} L E85** » / « Résultat : {pct}% — cible ≤ {target+tol}% »
     (émeraude si withinTolerance, sinon orange).
6. **Bouton repliable** : « Pleins futurs ▾/▴ » (séparateurs filaires de part et
   d'autre). Déplié : ligne « Tous les [300] km » + tableau 4 lignes
   (# | km (avec boutons −/+ 50 par ligne, min 50) | Mélange | %).
   % émeraude si withinTolerance, sinon orange.
7. **Ligne de détails** (xs, muted) : `Restant : {L} L` · `Éthanol actuel : {pct}%` ·
   `E85 du jour : {round(f85×100)}%`.

Tous les km en `toLocaleString('fr-FR')`, pourcentages `.toFixed(1)`, litres `.toFixed(1)`.

## 5. Exemples de comportement à vérifier (acceptance)

Cible 75 %, tolérance 3 % (limite 78 %), tank 50 L, consommation 7 L/100km :

- **Été** (f85 = 85 % > 78 %) : tank à 10 % →
  - Carte A : « Partiel possible » ou « Jusqu'au km X » selon les litres restants ;
  - Carte B : « Maintenant » ou « À partir du km Y » ;
  - Recommandation : mélange E10 + E85, ou « X L E85 pur » si sous la limite.
- **Hiver** (f85 = 75 % ≤ 78 %) :
  - Carte A : « Toujours possible / **Grade du jour 75%** / Sous la limite de 78% » ;
  - Carte B : « Inutile avec le grade actuel » ;
  - Recommandation : plein E85 pur.
- **Hiver, cible 70 % tol 3 % (limite 73 % < 75 %)** : les seuils odoA/odoB
  réapparaissent même en hiver — c'est le comportement voulu de l'époque (grade
  conservateur unique, pas de repli « inutile » par saison).
- Tank déjà à ~85 % (réservoir 100 % E85 en été) → `odoBNow = true`, odoA null
  (cas `|eth − f85| < 0.001`), pas de crash (régression `4720986` du 13 juil.).

## 6. Contraintes de réimplémentation

- Math **pures** dans `frontend-react/src/lib/blend-math.ts`, UI dans
  `frontend-react/src/components/flexfuel/BlendCalculator.tsx` (shadcn/ui : Card,
  Input, Select ; lucide `FlaskConical` ; Tailwind ; libellés français).
- Props : `{ conversion, vehicle, entries, embedded? }` — le mode `embedded` renvoie
  le `content` nu (utilisé dans le dialog/wrapper), sinon la Card complète.
- **Aucun** : sélecteur de grade saisonnier à bornes, table `E85_SEASONS`, en-tête
  « Grade E85 — Hiver (…) », « Cible X % (été) », adaptation de la cible à la saison,
  bouton « À la pompe », seed de prix E10. (Tout ça appartient aux états de
  novembre 2026, hors périmètre.)
- Tests : recréer `blend-math.test.ts` (état `b398c72`, ~57 lignes de diff vs l'avant)
  — couvrir : e85EthanolFraction aux 3 bornes de saison, computeTankState (pleins
  purs/mixtes, stop multi-entries), computeThresholds (safe / odoA / odoBNow),
  computeWinterRec (tank_full / pure_e85 / blend min-5L / plafond), simulateFutureFills.
- Validation : `cd frontend-react && npm run build` (tsc -b && vite build) +
  `npm run test` (vitest) doivent passer.
