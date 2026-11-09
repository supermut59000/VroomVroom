# VroomVroom — Palette officielle (Mode Jour / Mode Nuit)

Fondée sur l'échelle de gris **Zinc** (neutre, moderne, douce pour les yeux)
+ touches de couleur **pastel**.
Source de vérité du thème : `frontend-react/src/index.css` (`:root` = jour, `.dark` = nuit).
Chaque valeur est marquée **B** (donnée par le brief utilisateur) ou **D** (dérivée du brief).

**Règle : toute couleur visible dans l'app vient de ce fichier.** Les composants ne
contiennent aucun hex ni classe de hue Tailwind en dur (sauf les exceptions documentées
en section 6).

## 1. La Fondation (échelle de gris Zinc)

| Rôle | Mode Jour | Mode Nuit | Variable(s) CSS |
|---|---|---|---|
| Fond général | `#f4f4f5` **B** | `#09090b` **B** | `--background` |
| Surfaces (cartes, modales, popovers) | `#fbfbfb` **B** | `#18181b` **B** | `--card`, `--popover` (+ `-foreground`) |
| Bordures et séparateurs | `#e4e4e7` **B** | `#27272a` **B** | `--border`, `--input` |
| Texte principal | `#18181b` **B** | `#fbfbfb` **B** | `--foreground` |
| Texte secondaire (dates, unités « L », « km ») | `#52525b` **B** | `#a1a1aa` **B** | `--muted-foreground` |
| Zones atténuées / surbrillance | `#f4f4f5` **D** | `#27272a` **D** | `--muted`, `--accent`, `--secondary` |

## 2. Interactions

La primaire est **neutre** (échelle zinc) : la couleur ne vit que dans les touches
sémantiques (section 3), les tags (section 4) et les graphiques (section 5).
(L'indigo `#4f46e5` d'une première version a été écarté par l'utilisateur.)

| Rôle | Mode Jour | Mode Nuit | Variable(s) CSS |
|---|---|---|---|
| Primaire (boutons, focus ring) | `#18181b` **D** | `#fbfbfb` **D** | `--primary`, `--ring` |
| Primaire au survol | `#27272a` **D** | `#e4e4e7` **D** | (Tailwind `hover:`) |
| Erreur / suppression | `#ef4444` **D** | `#ef4444` **D** | `--destructive` |

## 3. Touches sémantiques (solides : bandes latérales, pastilles, marqueurs, barres)

| Rôle | Mode Jour | Mode Nuit | Variable CSS |
|---|---|---|---|
| Éthanol (vert sauge/menthe) — badge E85, stations « moins cher », icônes E85 | `#81c784` **B** | `#a5d6a7` **B** | `--ethanol` |
| Plein partiel (orange pêche) — **bande latérale** des entrées partielles, pastilles de compteur, favoris | `#ffb74d` **B** | `#ffcc80` **B** | `--partial` |

Règle du **plein partiel** : la couleur vient de la **bande latérale gauche**
(`border-l-4 border-l-[var(--partial)]`) de la carte d'entrée ; la puce « Partiel »
reste **neutre** (outline, texte atténué).

## 4. Pastilles / tags (fond teinté + texte)

Jour : fond pastel clair + texte foncé de la même teinte (contraste ≥ 4.5:1).
Nuit **D** : voile translucide de la teinte + texte pastel clair.

| Tag | Fond jour / Texte jour | Fond nuit / Texte nuit **D** | Variables |
|---|---|---|---|
| Éthanol (E85, réussites, « rentabilisé ») | `#e8f5e9` / `#2e7d32` **B** | `rgba(165,214,167,.14)` / `#a5d6a7` | `--tag-ethanol-bg/-text` |
| Partiel / attention (assurance, maintenance à venir, avertissements) | `#fff3e0` / `#ef6c00` **B** | `rgba(255,204,128,.14)` / `#ffcc80` | `--tag-partial-bg/-text` |
| Info (essence/E10, froid, infobox) — de `#7baaf7` **D** | `#eef3fd` / `#4763a8` | `rgba(123,170,247,.14)` / `#90c5ff` | `--tag-info-bg/-text` |
| Lilas (diesel, sync offline) — de `#b39ddb` **D** | `#ede7f6` / `#5e35b1` | `rgba(179,157,219,.16)` / `#d1c4e9` | `--tag-lilas-bg/-text` |
| Turquoise (électrique) — de `#4db6ac` **D** | `#e0f2f1` / `#00695c` | `rgba(77,182,172,.14)` / `#80cbc4` | `--tag-teal-bg/-text` |
| Rose (GPL) — de `#f48fb1` **D** | `#fdeef4` / `#b03a70` | `rgba(244,143,177,.14)` / `#f8bbd0` | `--tag-rose-bg/-text` |

Mapping des types de carburant (`FUEL_TYPE_COLORS`) : essence/SP98 = info,
diesel = lilas, électrique = turquoise, hybride = partiel, GPL = rose, E85 = éthanol.

## 5. Palette des graphiques (pastels mates)

Teintes douces « poudrées », distinguables (daltonisme), saturation adoucie.
Utilisées par les courbes (`--chart-1..4`) et le donut « Coût de possession »
(`--color-chart-*`).

| Rôle | Mode Jour | Mode Nuit **D** (éclairci) | Variables |
|---|---|---|---|
| Bleu Ciel Cendré (consommation globale / carburant) | `#7baaf7` **B** | `#90c5ff` | `--chart-1`, `--color-chart-fuel`, `--c-blue` |
| Lilas / Lavande (achat, 2ᵉ série) | `#b39ddb` **B** | `#d1c4e9` | `--chart-2`, `--color-chart-purchase`, `--c-lilas` |
| Turquoise d'Eau (secondaires, prévisions / maintenance) | `#4db6ac` **B** | `#80cbc4` | `--chart-3`, `--color-chart-maintenance`, `--c-teal` |
| Rose Poudré (prix/dépenses, à la place du rouge alerte / frais fixes) | `#f48fb1` **B** | `#f8bbd0` | `--chart-4`, `--color-chart-fixed`, `--c-rose` |

`--chart-5` (jaune) conservé pour une éventuelle 5ᵉ série.

**Séries par type de carburant** (`FUEL_COLOR`, 7 teintes distinguables **D**) :
E85 = `--ethanol`, essence = `--c-blue`, SP98 = `--partial`, diesel = `--c-lilas`,
GPL = `--c-rose`, électrique = `--c-teal`, hybride = `--muted-foreground` (neutre).
Lignes neutres (prévisions, seuils) = `--muted-foreground` ; anomalies = `--destructive` ;
lignes d'alerte (tolérance, moyenne à dépasser) = `--partial`.

## 6. Toasts (sonner) + exceptions documentées

- **Toasts** : variables sonner (`--success-*`, `--warning-*`, `--error-*`, `--info-*`)
  mappées sur la palette — success = éthanol, warning = partiel, info = bleu,
  error = `#ef4444` **D** (le rouge d'erreur est le seul rouge de l'app).
- **Glisser-déposer (SwipeableCard)** : panneau « Modifier » = `--c-blue` plein + texte `#18181b`,
  panneau « Supprimer » = `--destructive` (les deux actions gardent des couleurs distinctes).
- **Bouton Google Play** (paramètres) : dégradé `#003087 → #0070e0 → #009cde` —
  identité de marque Play Store, hors palette (logo officiel).
- **Attribution Google Maps** (`#4285F4`) : exigée par le composant map, hors palette.
- **Header / bande de statut** : `--background` + `backdrop-blur` (suit la palette) ;
  horloge/icônes dessinées par Android au-dessus du WebView, jamais floutées.

## 7. Rappels d'application

- Les boîtes KPI des dialogs (`Bilan de période`, `Coût de possession`) utilisent `--card`
  : blanc cassé sur fond gris en jour, gris foncé sur fond noir en nuit (jamais gris sur gris).
- Tout nouveau composant s'habille avec les variables ci-dessus (jamais de hex en dur dans
  les composants, sauf exceptions de la section 6).
