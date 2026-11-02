# Plan — Grade E85 saisonnier à bornes (min / max)

> 2026-11-02 · ✅ Validé et implémenté (commit suivant) : été 85–85, intersaisons 65–75,
> hiver 60–75, calculs au MAX.

## Problème actuel

Le calculateur utilise **un grade unique par période** (`e85EthanolFraction` :
85 % ou 75 %), affiche « Grade du jour 75 % », et **masque tous les km de seuils
en hiver** (grade 75 % ≤ limite 82 % → « E85 pur toujours possible » /
« dilution inutile »). C'est le comportement de la version serveur (même
composant) — mais ce n'est pas ce que tu veux lire.

## Ce que tu veux

1. **4 saisons** (pas 2), avec leurs dates exactes :
   - 1ᵉʳ mai → 30 septembre : **85 %**
   - 1ᵉʳ octobre → 31 octobre : **intersaison, 75 %**
   - 31 octobre (1ᵉʳ nov) → 15 mars : **hiver, jusqu'à 40 % d'essence → 60 % d'éthanol**
   - 16 mars → 30 avril : **intersaison**
2. **Un affichage à bornes** : le **mini et le max** d'éthanol de chaque saison
   (les stations ne sont pas obligatoirement au taux nominal — l'app doit
   « s'adapter », ex. 75 % nominal → 65 % possible en bas de fourchette).
3. Le **taux exact** lu en un coup, pas un « grade du jour » flou.

## Modèle de saisons proposé (⚠️ à confirmer — les max sont des hypothèses)

| Saison | Période | Min éthanol | Max éthanol |
|---|---|---|---|
| Été | 1 mai – 30 sept | **85 %** | **85 %** |
| Intersaison (automne) | 1 oct – 31 oct | **65 %** | **75 %** |
| Hiver | 1 nov – 15 mars | **60 %** (max 40 % essence) | **75 %** |
| Intersaison (printemps) | 16 mars – 30 avril | **65 %** | **75 %** |

Intervalles confirmés (4/4 recommandations validées par l'utilisateur) :
- **Été = [85, 85]** : taux fixe.
- **Intersaisons = [65, 75]** : « si ça passe de 85 à 75, adapte 75 → 65 ».
- **Hiver = [60, 75]** : 60 % minimum (40 % essence max), max 75 %.

## Règle de calcul

- **Tous les calculs de sécurité** (E85 pur possible ? dilution ? km de seuils ?)
  utilisent le **MAX de la saison** — philosophie existante : surestimer l'éthanol
  recommande plus d'essence, jamais moins (sécurité démarrage à froid).
- **L'affichage** montre toujours l'intervalle [min, max] + nom de saison + période.
- Conséquence : les km de seuils (odoA « jusqu'au km », odoB « à partir du km »)
  n'apparaissent que quand le **max de la saison dépasse ta limite** (cible 77 + tol
  5 = 82 %) → **en été uniquement** (85 > 82). En intersaison/hiver (max 75 ≤ 82),
  la dilution est structurellement inutile : l'affichage le dit avec les bornes
  (« inutile : max de la saison 75 % ≤ 82 % ») au lieu de rien dire.
- La ligne « Au grade d'été (85 %) » ajoutée hier est **supprimée** (remplacée par
  l'affichage borné de la saison courante).
- « Plein E85 : ~X km d'autonomie » inchangée (capacité ÷ conso E10 × (1+surconso)).

## Affichage cible (mockups)

**Intersaison / hiver (max 75 ≤ 82) :**
```
GRADE E85 — Intersaison (1 oct → 31 oct) : 65 – 75 % d'éthanol

┌──────────────────────────────┬──────────────────────────────┐
│ E85 PUR                      │ DILUTION E10                 │
│ Toujours possible            │ Inutile                      │
│ Grade saison : 65 – 75 %     │ Max saison 75 % ≤ limite     │
│ (max 75 % ≤ 82 %)            │ 82 %                         │
│ Plein E85 : ~417 km          │                              │
└──────────────────────────────┴──────────────────────────────┘
```

**Été (max 85 > 82) — les km de seuils reviennent :**
```
GRADE E85 — Été (1 mai → 30 sept) : 85 % d'éthanol

┌──────────────────────────────┬──────────────────────────────┐
│ E85 PUR                      │ DILUTION E10                 │
│ Jusqu'au km 1 650            │ À partir du km 1 775         │
│ dans ~350 km                 │ dans ~475 km                 │
│ Grade saison : 85 %          │ 5 L E10 → cible 77 %         │
│ Plein E85 : ~417 km          │                              │
└──────────────────────────────┴──────────────────────────────┘
```

**À la pompe (recommandation)** : le texte de mélange affiche le grade borné,
ex. « 30,0 L E85 : plein direct (grade 65–75 % ≤ cible 82 %) ».

## Fichiers modifiés

1. `src/lib/blend-math.ts` — `e85EthanolFraction()` remplacé par
   `e85Season(date): { key: 'ete'|'intersaison'|'hiver', label, periode, min, max }` ;
   wrapper `e85EthanolFraction = (d) => e85Season(d).max` conservé pour
   `fuelEthanolFraction` (historique éthanol).
2. `src/components/flexfuel/BlendCalculator.tsx` — ligne « GRADE E85 — saison :
   min–max % », cartes à bornes, suppression de `summerRef`.
3. `src/components/flexfuel/PumpFillDialog.tsx` — recommandation au max de saison +
   mention bornée.
4. `src/lib/cold-alert.ts` — `isWinterWindow` = `e85Season().key === 'hiver'` ;
   message avec l'intervalle réel (« grade E85 60–75 % en cette période »).
5. Tests — bornes de saison (30 avril/1 mai, 30 sept/1 oct, 31 oct/1 nov,
   15 mars/16 mars), affichage calculateur + pompe, message froid.

## Addendum — cible adaptée à la saison (confirmée même jour)

Le taux cible est saisi **sur l'échelle de l'été** (85 % = max d'été) :
`seasonalTarget(input, season) = input + (max_saison − 85)`. Ex. 75 saisi → 75 en
été, **65 en intersaisons/hiver**. Le réglage enregistré ne change jamais ; la
tolérance reste absolue. Tous les calculs (seuils km, dilution, dépassement) et
les limites affichées utilisent la cible saison → avec 75/3, limite d'hiver 68 %
< max E85 hiver 75 % : les km de seuils et la dilution s'affichent toute l'année
(capture réelle : « Fenêtre passée » + « Maintenant »). Implémenté dans
`a58b431` + `f3f3a5c`.

## Ce qui ne change PAS

- Conso plein-à-plein, rentabilité (prix E10 enregistrés), attribution E85 par
  plein, stats backend (le backend ne connaît pas le grade — parité intacte).
- Les dates exactes des saisons sont codées dans une seule table
  (`E85_SEASONS`) — modifier une date = une ligne.
