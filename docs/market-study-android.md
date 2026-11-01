# Étude de marché — VroomVroom Android (version locale)

> Branche : `android-local` — créée le 2026-10-30.
> Distribution (révisée 2026-10-30) : **Google Play en canal principal** — les 25 $ d'inscription sont acceptés. F-Droid = canal secondaire optionnel.
> Objectif : publier la version 100 % stockage local (pas de serveur, pas d'auth) + paiement one-time 2,50 €.
> Complément : [e85-community-research.md](e85-community-research.md) — étude de terrain sur les blocages, besoins et gaps de la communauté E85 FR.

---

## 1. La cible

Le marché n'est pas « les apps de carburant », c'est **les propriétaires E85 francophones** :

| Fait | Chiffre | Source |
|---|---|---|
| Véhicules flex-E85 en France (origine + boîtier homologué) | **400 000 → 550 000** (croissance record 2025) | Bioéthanol France, sept. 2025 ; L'Automobiliste, oct. 2025 |
| Part de l'E85 dans l'essence vendue en France | ~7 % (2025) | L'Automobiliste |
| Stations E85 | 3 973 = **42 % de toutes les stations** | Bioéthanol France |
| Seule voiture neuve E85 d'origine vendue | Ford Kuga Flexifuel : 7 341 immat. janv.–août 2025 (+25 %) | Autoactu / Bioéthanol France |
| Taxation | hausse des taxes E85 **abandonnée** au budget 2026 | L'Automobiliste, 2025-10-21 |

L'E85 est mainstream en France, pas une niche dans la niche. Le pool d'utilisateurs actifs réalistes (E85 + veut tracker ses économies + trouve l'app) : **400 à 5 000 utilisateurs** selon le bouche-à-oreille. C'est le plafond du business.

## 2. La concurrence

### 2.1 Tracking carburant générique — ne pas y concourir frontalement

| App | Traction | Prix | Faiblesse exploitable |
|---|---|---|---|
| **Fuelio** | 136 000+ avis Play, 4,2 ★ | Premium 3,99–14,99 € par tranche ; 4,99 $/mois ou 17,99 $/an (iOS) | Prix des stations participatifs (pas l'officiel FR), cloud-first, **aucune logique E85/mélange** |
| **Drivvo** | 5 M+ téléchargements, 4,8 ★ / 114 000 avis | Gratuit + Premium (abonnement) | 79 langues = générique ; **pas de flexfuel du tout** |
| **FuelSaver** (Android) | montée en 2026 | Gratuit illimité ; Premium 0,99–2,99 € (retire les pubs seulement) | Générique, import depuis Fuelio, pas d'E85 |
| Simply Auto / aCar / Serval (DE) / Tankoguide (DE) | intermédiaires | freemium | pas de focus FR ni E85 |

Conclusion : le générique est saturé et bien défendu. Y entrer, c'est mourir dans le bruit.

### 2.2 E85 / FlexFuel — notre terrain

| App | Ce qu'elle fait | Prix | Ce qu'elle ne fait PAS |
|---|---|---|---|
| **eFlexApp** (eflex.eco) | cockpit E85 temps réel (éthanol, temp., codes défaut) **par Bluetooth, mais uniquement avec le kit eFlexFuel** | Gratuit (réservé aux clients du kit) | ne couvre pas les ~250 000 autres boîtiers du marché ; pas de suivi de consommation ni de coût |
| **Øctane** | carte temps réel des stations E85 (data.gouv.fr) | Gratuit | carte seulement : aucun plein, aucune consommation, aucun amortissement |
| **Ethanol Blend Calculator E85** | calculatrice de mélange E85/essence | Gratuit avec pubs, 5 000+ DL | calcul isolé, pas d'historique, **pas de règle hiver FR (75 %)** |
| **E85 Mix Calculator** | idem | 4,0 ★ / 72 avis | idem |
| **My Cars** (davagdroid) | dépenses auto + flexfuel (mélange manuel, pensé Brésil) | gratuit/option payante | E85 FR marginal, pas de saisonnalité |
| **Car Control** (Innovatek) | stations + pleins + OBD2, **100 % données locales** | à vérifier | pitch local validé MAIS pas de calcul de mélange, pas d'amortissement de kit, pas de règles E85 FR |

### 2.3 Le trou dans le marché

**Personne ne fait la boucle complète E85 à la française** :
calcul de mélange avec la contrainte hiver (75 % du 31/10 au 15/03), amortissement du kit,
consommation E85/E10 séparée, prix officiels des stations FR, et données 100 % locales.
Chaque concurrent fait 20 % de ça, mal ou pour un pays différent.

## 3. Différenciation — ce qu'on construit et ce qu'on dit

Pitch en une phrase (listing, forums, README) :
> **« L'app E85 complète pour la France. Vos données ne quittent jamais votre téléphone. »**

Les 6 piliers, dans l'ordre où ils doivent être présentés :

1. **Règle E85 hiver FR** — recommandation de mélange automatique (75 % max en hiver, 85 % sinon, seuils 31/10–15/03). Aucun concurrent ne gère la spécificité éthanol/hiver française. C'est le moat.
2. **Calculateur de mélange exact** — état du réservoir calculé fill-to-fill (pas d'estimation par consommation moyenne), bande cible configurable (ex. 77 % ± 5), volume minimum pompe (5 L).
3. **Rentabilité du kit** — amortissement du boîtier (~770 €), date de break-even, économie cumulée E85 vs prix E10 de référence. eFlexApp le fait pour SON kit ; nous pour n'importe quel kit.
4. **Consommation E85/E10 séparée** par segment + coût réel du litre mélangé.
5. **100 % local** — marche sans réseau à la pompe (le cas d'usage n°1), pas de compte, pas de serveur, pas de RGPD à gérer. Pitch validé par le marché (Car Control).
6. **Prix des stations officiels** (data.economie.gouv.fr) — plus fiable que le participatif de Fuelio, gratuit, sans clé.

Ce qu'on **ne fait pas** (ne pas diluer le pitch) : pas d'OBD2, pas de gestion de flotte, pas de 190 pays, pas de covoiturage.

## 4. Distribution (Play principal, F-Droid optionnel)

| Canal | Coût | Rôle |
|---|---|---|
| **Google Play** | 25 $ one-time | Canal principal : discoverability (recherche « E85 » sur le store Android — le créneau FR y est vide, Super 85 étant iOS-only), confiance, Play Billing. |
| **GitHub Releases** (repo public) | 0 € | APK signé versionné, transparence, canal de sideloading + preuve d'activité pour F-Droid. |
| **Landing self-hostée** (`*.home.ouiouibaguette.fr`, SSL déjà en place) | 0 € | Landing FR avec captures + lien Play + lien APK direct. |
| **F-Droid** (optionnel) | 0 € | 2e canal pour les utilisateurs « données locales ». Conditions d'inclusion vérifiées le 2026-10-30 : 100 % FLOSS requis (Apache-2.0), pas de tracking/Play Services (✅ l'app n'en a aucun), précompilés Node.js autorisés (build Vite OK), pas d'API keys (✅ gouv.fr public), app ID `fr.ouiouibaguette.vroomvroom`, activity ≥ 3 mois prouvable via l'history git publique. |

### Paiement one-time

**Play Billing non-consuméable « Débloquer Pro » — 2,50 €** (~2,13 € nets, cut 15 % sur les premiers 1 M$).
L'entitlement est vérifiée localement par Play (fonctionne offline). Aucune clé externe nécessaire.

Fallback F-Droid/sideloading (Play Billing y est interdit) : **Gumroad** (merchant of record, 0 € d'avance, 10 % + 50 ¢/vente, API de vérification de clés) + cache offline de l'entitlement — à implémenter seulement si/que la version F-Droid est engagée.

## 5. Monétisation et revenus projetés (honnêtes)

**Design freemium** (la fonction payante = exactement le moat E85) :

| Version | Contenu |
|---|---|
| **Gratuite** | tracking carburant générique, **1 véhicule**, prix des stations, maintenance, offline. Suffisante pour évaluer l'app. |
| **Pro — 2,50 € one-time** | véhicules illimités + **tout le module E85** : calculateur de mélange, règle hiver, historique éthanol, rentabilité du kit, consommation E85/E10 séparée. |

Revenus projetés (one-time, 2,50 € − 15 % Play ≈ **2,13 € nets/clé**) :

| Scénario | Clés vendues / an | Revenu net |
|---|---|---|
| Réaliste bas (annonces forums + bouche-à-oreille lent) | ~100 | **~210 €** |
| Réaliste haut (retombée sur super-ethanol.com / Hardware.fr + listing Play qui tourne) | ~500–750 | **~1 050–1 600 €** |
| Irréaliste (ne pas s'y mettre) | > 2 000 | ~4 200 €+ |

Verdict : **petit complément de revenu, pas un business**. Le vrai rendement : un produit public visible sur le store Android (créneau E85 FR vide), de la réputation dans la commu E85, et la possibilité de monter le prix ou d'ajouter une offre Pro+ plus tard.

**Lancement (révisé 2026-10-30)** : l'app sort **gratuite + don optionnel** (objectif affiché : couvrir les 25 $ du compte Play) ; l'offre Pro 2,50 € ci-dessus n'est activée qu'après traction (≥ 100 installs à J+30). Voir [strategie-partage.md](strategie-partage.md).

## 6. Prérequis et risques

1. **Ouvrir la source = publier l'history git** (GitHub public / F-Droid). Credentials `.env` (`mathis`/`mathis`, DB 192.168.25.46) présents dans l'history (commit `3836c24`, déjà documenté dans CONTEXT.md).
   **Obligatoire avant toute publication de source** : `git filter-repo --path backend/.env --path backend/.env.local --invert-paths` + force push + **rotation du mot de passe DB**. Une publication Play seule avec repo privé n'expose rien — mais le canal GitHub Releases/F-Droid, si.
2. **Build reproductible Capacitor** : vérifier tôt avec `fdroidserver` (déterminisme du build Vite + assets). C'est le risque technique n°1 de la publication.
3. **Pas de sync multi-appareils** : téléphone perdu = données perdues. À assumer dans le listing F-Droid et la landing. Atténuation existante : export CSV déjà implémenté — le mettre en avant.
4. **GPS envoyé à un tiers** : routage via `router.project-osrm.org` (public). Déclarer (politique de confidentialité + anti-feature NetworkMessages). Option : laisser l'URL configurable pour un OSRM auto-hébergé.
5. **5 fichiers modifiés non commités** dans l'arbre (fix B1/B2 de la session 2026-10-17) : les committer sur `master` avant de commencer le travail sur `android-local`, sinon le portage TS sera fait sur un état flou.
6. **2,50 € = prix d'impulsion** : le panier moyen est faible par construction ; ne pas espérer de volume. Le prix n'est pas le levier, la distribution dans la commu E85 l'est.

## 7. Plan d'exécution (minimal, sur `android-local`)

1. Committer le travail en attente sur `master` (risque §6.5).
2. **Portage des 4 services backend en TS** (~1 600 lignes Python : `fuel_service`, `vehicle_service`, `flexfuel_service`, `maintenance_service`) + portage des tests discriminants (223 tests backend = référence de comportement) en vitest. C'est la seule vraie pièce neuve. **1–2 semaines.**
3. **Adaptateur local** : `lib/api.ts` → store IndexedDB avec la même interface Promise (seules ~7 fichiers d'appel changent) ; fusion de la queue offline. **3–5 jours.**
4. **Coque Capacitor** (sans aucun SDK Google Play), icônes/splash, AAB+APK. **2–3 jours.**
5. **Gating Pro** : Play Billing non-consuméable (2,50 €), cache offline de l'entitlement. **3–4 jours.**
6. **Publication Play** : AAB signé, compte Play Console (25 $), listing FR/EN (pitch : « L'app E85 complète pour la France. Vos données ne quittent jamais votre téléphone. »), data safety (position GPS → OSRM public), politique de confidentialité. **2–4 jours.**
7. **Lancement** : forum super-ethanol.com (15 300 membres — cible n°1, voir étude de terrain), topic Hardware.fr (830 pages), groupes Facebook E85, Bioéthanol France. Ordre et arguments détaillés dans e85-community-research.md §5.
8. (Optionnel) **F-Droid** : Apache-2.0 + `git filter-repo` + rotation DB + recipe fdroidserver ; clé Gumroad en fallback pour ce build.

**Total : ~5–7 semaines à temps partiel** pour une v0.1 publique, 25 $ dépensés (Play).

## Sources

- Bioéthanol France — Données Superéthanol-E85 (sept. 2025) : bioethanolfrance.fr (PDF)
- Bioéthanol France — Conf. de presse bilan 28/01/2025 : bioethanolcarburant.com (PDF)
- L'Automobiliste — « E85 : la hausse des taxes abandonnée dans le Budget 2026 », 2025-10-21
- Autoactu via Automobile Magazine — ventes Kuga Flexifuel, 2025-10-07
- Fuelio : Google Play (FR) + App Store ; pricing via prix-des-carburants.com/blog/fuelsaver-vs-fuelio-comparatif (2026-09-28)
- Drivvo : drivvo.com (5 M+ DL, 4,8 ★)
- eFlexApp : eflex.eco/eflexapp ; Øctane : data.gouv.fr/reuses/octane
- Ethanol Blend Calculator E85 / E85 Mix Calculator / My Cars : fiches Google Play
- F-Droid Inclusion Policy : f-droid.org/docs/Inclusion_Policy (consulté 2026-10-30)
- Gumroad pricing + license keys : gumroad.com/pricing, gumroad.com/help/article/76-license-keys
