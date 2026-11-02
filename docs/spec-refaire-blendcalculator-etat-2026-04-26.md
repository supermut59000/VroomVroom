# Spec — Recréer le BlendCalculator dans son état d'avril 2026 (commit `ae51eef`)

Document à donner à un agent pour **refaire exactement** le calculateur de mélange E85
tel qu'il existait à la fin d'avril 2026 (dernier commit avril : `ae51eef`,
26 avril 2026). C'est l'état **avant** toute notion de saisonnalité/grade d'E85.
À comparer avec `docs/spec-refaire-blendcalculator-etat-2026-08-15.md` (état `b398c72`) —
la table de différence est en §6.

**Source de vérité absolue** — à cet état, **il n'existe pas de `src/lib/blend-math.ts`** :
toute la logique est inline dans le seul composant :

```bash
git show ae51eef:frontend-react/src/components/flexfuel/BlendCalculator.tsx   # 692 lignes, tout est là
```

Contexte historique : cet état est le résultat des commits
`a7a230e` (13 avr. — mode hiver intelligent + alerte taux élevé), `ce0282d`
(14 avr. — deux seuils km), `95185cd` (Math.round pas Math.ceil), `f652003`
(16 avr. — plein partiel E85 limité + planification de trajet) et `ae51eef`
(26 avr. — mode toute l'année + boutons +50/+100/+200).

---

## 1. Principe central de cet état : E85 = 85 % toute l'année

**Aucune saisonnalité.** La fraction d'éthanol est une constante, dure :

```ts
const ETHANOL_FRACTION: Record<string, number> = {
  e85: 0.85,
  essence: 0.05,   // NOTE: en avril « essence » = 5 % (pas encore de distinction E10/SP98)
  diesel: 0.0, gpl: 0.0, electrique: 0.0, hybride: 0.0,
}
const MIN_PUMP_LITERS = 5
type DilutantType = 'e10' | 'sp95'   // NOTE: c'est « sp95 » / libellé « SP95 »
```

Conséquence directe (et le bug vécu à l'époque) : en hiver, avec une cible 75 % +
tolérance 3 % (limite 78 %), le calculateur considère que l'E85 fait 85 % > 78 % →
il annonce « Fenêtre passée » / « Partiel possible » et impose de la dilution,
alors qu'un E85 d'hiver (75 %) y serait resté sous la limite. C'est ce défaut qui
a motivé la refonte du 15 août (`b398c72`).

## 2. Entrées du composant

```tsx
<BlendCalculator conversion vehicle entries embedded? />
```

Identiques à l'état d'août : `vehicle.tank_capacity` (défaut 50),
`conversion.conversion_date` / `target_ethanol_pct` / `ethanol_tolerance_pct`,
`entries` filtrées à `fueling_date >= conversion_date`.
État local : `dilutantType` (défaut `'e10'`), `currentOdo` (string, défaut vide),
`tripKm` (string, défaut vide) — **pas** d'`intervalKm`/`intervalOverrides`/`showFutureFills`
(le « Pleins futurs » n'existait pas encore, ajouté le 10 mai).
`dilutantEthFraction = dilutantType === 'e10' ? 0.1 : 0.05` ; libellé « E10 » / « **SP95** ».

Garde d'entrée identique : sans `avgConsumption` → « Pas assez de données depuis
l'installation du boîtier. Enregistrez au moins deux pleins complets. »
(En-tête Card : « Mélange E85 » / « Cible {target}% · {capacité} L · {conso} L/100km » ;
le composant sans données s'intitule « Calculateur de mélange E85 ».)

## 3. Math (toutes inline dans le composant)

### 3.1 `computeAvgConsumption(entries, conversionDate) → number | null`

- Tri **simple** : `(fueling_date, id)` — pas de tie-break odomètre ni is_full_tank.
- Segments plein→plein : les litres s'accumulent (pleins et partiels) entre deux pleins ;
  à chaque plein, `value = accLiters × 100 / dist` si `dist > 0`.
- **Moyenne simple des valeurs de segments** (PAS pondérée par distance).
  → c'est le défaut corrigé le 5 juil. (`c6798f4`) : en août, c'est
  `Σ litres × 100 / Σ km` avec ancre au 1er plein.

### 3.2 `computeTankState(entries, conversionDate, avgL100km, tankCapacity) → TankState`

Méthode **estimative au L/100km** (pas plein-à-plein exact) — parcourt chaque entry :

- `distance = max(0, odo_entry − prevOdo)` ; `consommé = distance × avgL100 / 100` ;
  `remaining = clamp(litersInTank − consommé, 0, capacity)` ;
  `ethFracBefore = ethanolLiters / litersInTank` (0 si vide).
- **Plein** : `actualRemaining = min(remaining, max(0, capacity − e.liters))` ;
  `litersInTank = capacity` ;
  `ethanolLiters = min(ethFracBefore × actualRemaining + e.liters × frac(fuel), capacity)`.
- **Partiel** : `litersInTank = min(remaining + e.liters, capacity)` ;
  `ethanolLiters = min(ethFracBefore × remaining + e.liters × frac(fuel), litersInTank)`.
- `lastOdo =` odo de la dernière entry.

En août (`b398c72`), cette fonction passe au **plein-à-plein exact** (stops groupés
par date+odo, litres = essence brûlée entre pleins, sans estimation L/100km) et perd
le paramètre `avgL100km`.

### 3.3 État courant à l'odomètre saisi

Identique aux deux états : `distance = max(0, inputOdo − lastOdo)` ;
`remaining = clamp(litersInTank − distance × avg/100, 0, capacity)` ;
`currentEthanolPct = fraction du tank` (invariant en roulant).

### 3.4 `computeThresholds(...) → { odoA, odoB, odoBNow }` — **3 champs seulement**

Aucun `pureE85AlwaysSafe`. `eps = 0.001`, **0.85 en dur partout**.

1. `avgL100 <= 0 || |ethFraction − 0.85| < eps` →
   `{ odoA: null, odoB: null, odoBNow: false }` ← **état piégé : crash UI** (voir §4) ;
   corrigé le 13 juil. (`4720986`) en passant `odoBNow: true`, puis supprimé
   structurellement en août via le grade saisonnier.
2. Sinon :
   - `rA = capacity × (targetMax − 0.85) / (ethFraction − 0.85)` ;
     `odoA = round(fromOdo + (remaining − rA) × 100 / avgL100)` si `rA >= 0 && remaining > rA`
     sinon null.
   - `denomB = 0.85 − ethFraction` ; si `denomB > eps` :
     `rB = (5 × (dilFrac − 0.85) − capacity × (target − 0.85)) / denomB` ;
     `rB <= 0 || remaining <= rB` → `odoBNow = true`, sinon
     `odoB = round(fromOdo + (remaining − rB) × 100 / avgL100)`.
     Si `denomB <= eps` → `odoBNow = true`.

Même algèbre qu'en août — seul le grade (0.85 fixe vs `e85EthFraction()`) et l'état
`pureE85AlwaysSafe` changent.

### 3.5 Max plein partiel E85 (`limitFill`)

- `denom = 0.85 − targetFrac` ; **si `denom <= 0` → null** (pas de branche
  « plein complet toujours OK » — elle n'apparaît qu'en août avec le grade).
- Si `ethFrac >= targetFrac` → null.
- `x = (remaining × targetFrac − ethanol) / denom` ; `liters = min(x, maxFill)` ;
  `resultPct = (ethanol + liters × 0.85) / (remaining + liters)` ;
  `isFull = x >= maxFill − 0.5` ; `addedKm = round(liters × 100 / avgL100)`.

### 3.6 `computeWinterRec(...) → WinterRec`

Même structure et même ordre de cas qu'en août (tank_full → pure_e85+kmSafe → blend),
mais en **litres entiers** (état d'avant `111564e` du 10 mai) :

- `e85Liters = Math.round(toAdd)` (pas `round1`) ;
- `x = Math.round(xIdeal)` (pas `round1`) ;
- plafond : `x = Math.ceil(toAdd − 5)` (pas `ceil1`) ; `e85 = Math.round(toAdd − x)`.
- kmSafe : même formule, avec `f < 0.85 − 0.001` et `rSafe = capacity × (targetMax − 0.85)/(f − 0.85)`.

### 3.7 Planification de trajet (« Trajet prévu ») — **spécifique à avril, supprimée le 10 mai**

`tripKm` saisi → `rangeNowKm = round(max(0, remaining − 5) × 100 / avgL100)`
(le « − 5 » = réserve de sécurité). Si `rangeNowKm < tripDistance`, afficher les
options :

- « + {round(limitFill.liters)} L E85 (plein|partiel) » → `rangeAfter = round(max(0, remaining + limitFill.liters − 5) × 100 / avgL100)` ;
- si `winterRec.type === 'blend'` : « + {dil} L {diluant} + {e85} L E85 » → même formule avec le volume total du mélange.

Chaque ligne : `~{km} km` + « ✓ » (émeraude) si `rangeAfter >= tripDistance`, sinon « ✗ » (orange).

## 4. Layout UI exact (ordre des blocs, `space-y-3`)

1. **Sélecteur de diluant** — « Diluant » + Select h-8 w-24 : **E10 / SP95**.
2. **Les 2 cartes de seuils** (grille 2 colonnes). Aucun texte de grade.

   ### Carte A — « E85 pur » (émeraude | jaune | neutre), litres **entiers**
   - `odoA !== null` (émeraude) : « Jusqu'au km » / **odoA** / « dans ~X km » ;
     si `limitFill` : « Plein complet: **{Math.round} L** → {pct **0 décimales**}% · +{km} km »
     ou « Max: … ».
   - `limitFill` (jaune) : « Partiel possible » / **{Math.round} L E85** / « → {pct 0 déc.}% · +{km} km ».
   - sinon (neutre) : « Fenêtre passée » / « E85 pur ≥ {target+tol}% ».
   - **Pas d'état « Toujours possible / Grade du jour »** (introduit en août).

   ### Carte B — « Dilution {E10|SP95} » (bleu)
   - `odoBNow` : « Maintenant » / **km {inputOdo}** / « 5 L+ {diluant} → {target}% ».
   - sinon : « À partir du km » / **`odoB!`** / « dans ~X km ».
   - ⚠️ Dans l'état piégé (§3.4 cas 1 : `odoA = odoB = null, odoBNow = false` —
     tank ≈ 85 % d'éthanol, ou conso ≤ 0), le code affiche
     `odoB!.toLocaleString('fr-FR')` sur `null` → **crash du composant**
     (« Cannot read properties of null »). C'est le bug corrigé par `4720986`
     (13 juil.). À recréer tel quel seulement si on veut l'état strict d'avril.
   - **Pas d'état « Inutile avec le grade actuel » ni « — »** (introduits en août).

3. **Séparateur** « Calculer pour un odomètre précis ».
4. **Input odomètre** + boutons **+50 / +100 / +200**.
5. **Carte recommandation** (`winterRec`) — mêmes 3 variantes qu'en août
   (tank_full / pure_e85 / blend + alerte orange « Taux actuel (…) au-dessus de la
   limite »), mais litres **entiers** sans `.toFixed(1)` : « {n} L E85 pur »,
   « {n} L {diluant} + {n} L E85 ».
6. **« Trajet prévu »** — séparateur + input distance (placeholder « Distance (km) »)
   + bloc options §3.7. (**Absent de l'état d'août.**)
7. **Ligne de détails** : `Restant : {L} L` · `Éthanol actuel : {pct}%` —
   **pas de « E85 du jour : 85 % »** (introduit en août).

## 5. Exemples de comportement (acceptance)

Cible 75 %, tolérance 3 % (limite 78 %), tank 50 L, conso 7 L/100km :

- **Tank à 10 % (plein E10 récent), été OU hiver — c'est le même** :
  - `afterE85Pct = (5 + 45 × 0.85)/50 ≈ 73,25 % ≤ 78 %` → « X L E85 pur » avec
    kmSafe (dilution nécessaire vers le km Y).
  - Carte A : odoA ou « Partiel possible » ; Carte B : odoB / « Maintenant ».
- **Tank à 80 % (réservoir ~100 % E85)** : état piégé → **crash** en avril
  (c'est le symptôme qui a mené au fix du 13 juil. `4720986`).
- **Hiver réel, E85 à 75 % en réalité** : le calculateur ne le sait pas — il
  traite tout E85 comme 85 % → sur-recommande de la dilution. Limite assumée de
  l'époque.

## 6. Diff entre l'état d'avril (`ae51eef`) et l'état d'août (`b398c72`)

| Aspect | Avril (`ae51eef`) | Août (`b398c72`) |
|---|---|---|
| Fichiers | 1 composant 692 lignes, tout inline | `lib/blend-math.ts` (396 lg, pur + tests) + composant 493 lg |
| **Grade E85** | **0.85 fixe toute l'année** | **`e85EthanolFraction(date)` : 0.75 du 31 oct au 15 mars, 0.85 sinon** |
| « essence » | fraction 0.05, pas de SP98 | essence (E10) 0.10 + sp98 0.05 distincts |
| Diluant proposé | E10 / **SP95** | E10 / **SP98** |
| Conso moyenne | moyenne simple des segments, tri (date, id) | **pondérée par distance**, tri (date, odo, is_full ASC, id), ancre 1er plein |
| État du réservoir | **estimatif au L/100km** par entry | **exact plein-à-plein** (stops date+odo, litres = essence brûlée) |
| Seuils | `{odoA, odoB, odoBNow}` — état « tank ≈ 85 % » → **crash** | + `pureE85AlwaysSafe` ; état tank ≈ grade → « Maintenant » (fix `4720986`) |
| Carte A | 3 états (seuil / partiel / fenêtre passée), litres entiers, 0 décimales | **4 états** (+ « Toujours possible / **Grade du jour 85 %** / Sous la limite de X % »), litres 1 décimale |
| Carte B | 2 états (+ crash) | **3 états** (+ « Inutile avec le grade actuel ») |
| `limitFill` | `denom <= 0` → null | branche grade-safe → « Plein complet » autorisé |
| Recommandation | litres **entiers** (`Math.round`) | litres **décimaux** (`round1`) — depuis `111564e` 10 mai |
| Fin du form | **« Trajet prévu »** (distance + options ✓/✗) | **« Pleins futurs »** (4 pleins simulés, bornes ±50 par ligne) — depuis `111564e`/`8e8ff63` 10 mai |
| Détails (pied) | Restant + Éthanol actuel | + **« E85 du jour : 85 % »** |
| Comportement hiver (cible 75/3) | impose la dilution (E85 vu à 85 %) | « Toujours possible — Grade du jour 75 %, sous la limite de 78 % » |

**En une phrase** : août = avril + (grade saisonnier binaire 85/75 qui rend l'hiver
cohérent) + (math exactes et testées) + (fix crash tank plein d'E85) +
(décimales + Pleins futurs à la place de Trajet prévu, apport du 10 mai).
