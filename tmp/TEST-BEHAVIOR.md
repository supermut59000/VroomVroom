# VroomVroom — Spec de comportement (temporaire)

Fichier temporaire de référence : chaque action utilisateur (clic, soumission,
refresh, perte de connexion) et le résultat attendu. Les tests du dépôt
verrouillent cette table. À supprimer ou promouvoir dans CONTEXT.md après revue.

## 1. File d'attente hors-ligne (régression de la panne 2026-08)

| Action | Résultat attendu |
|---|---|
| 2 pleins ajoutés pendant que le serveur est down | Les 2 entrent dans `vv_offline_queue` (localStorage), toast info « enregistré hors-ligne », dialog fermée, aucun POST |
| Le serveur redémarre + refresh PWA | La file est relue intacte (`{id, payload}`) : `loadQueue()` ne perd aucun item au rechargement |
| Le serveur revient (event `online`) | Sync automatique : POST `/fuel-entries/` par item, `client_request_id` conservé (idempotent — pas de doublon), file vidée, toast « synchronisé » |
| Item corrompu parmi d'autres | Seul l'item corrompu est sauté, le reste de la file survit (jamais de wipe total) |
| Format legacy `{id, data}` (pré-discrimination) | Migré en `fuel-create`, `client_request_id` assigné si absent, conservé si présent |
| Stockage non-parseable ou non-tableau | File vide retournée, pas d'exception |
| Sync avec refus 4xx permanent (400/404/409/422) | L'item est retiré de la file (pas de retry infini) |
| Sync avec 401/403/429/5xx/transport | Retry après 60 s (escalade après 3 échecs) |
| Déconnexion pendant la session | Aucun sync tenté, file intacte |

## 2. PWA / service worker (`public/sw.js`)

| Action | Résultat attendu |
|---|---|
| `install` | `skipWaiting()` appelé (mise à jour immédiate) |
| `activate` | Anciens caches supprimés, `vroomvroom-react-v1` + `vroomvroom-data-v1` conservés, `clients.claim()` |
| GET API, réseau OK | Réponse réseau retournée + mise en cache (network-first) |
| GET API, fetch pendante > 4 s | Timeout → réponse du cache de données |
| GET API, hors-ligne sans cache | `503 { offline: true, error: 'No cached data' }` (jamais de crash) |
| GET API, réponse non-OK (500) | Propagée, **pas** mise en cache |
| Cache de données > 300 entrées | L'entrée la plus ancienne est évacuée (bornée) |
| Asset hashé (`/assets/*.js`) | Cache-first, aucun fetch |
| Tuile carte | Cache-first |
| Navigation SPA hors-ligne | Fallback sur le `/` mis en cache |
| POST/PUT/DELETE | Non interceptés par le SW |

## 3. Client API (`lib/api.ts`)

| Action | Résultat attendu |
|---|---|
| GET/POST/PUT/DELETE | URL = `API_URL + path`, méthode correcte, body JSON + `Content-Type` sur POST/PUT, aucun body sur GET/DELETE |
| `X-API-Key` | Envoyé uniquement si `VITE_API_KEY` est défini |
| Réponse 204 | Résout `undefined` (soft delete) |
| Non-2xx JSON | `ApiError(status, body.detail)` |
| Non-2xx non-JSON | `ApiError(status, 'Erreur {status}')` |
| Échec transport (serveur down) | `TypeError` propagée telle quelle (≠ ApiError) → le dialogue passe en file hors-ligne |
| Fetch pendante > 15 s | Abandon `AbortError` |

## 4. Véhicules (`VehicleAddDialog`, Dashboard)

| Action | Résultat attendu |
|---|---|
| Clic « Ajouter un véhicule » | Dialog avec champs marqués `*`, date d'acquisition optionnelle |
| Soumission valide | POST `/vehicles/`, toast succès, dialog fermée, véhicule affiché |
| Soumission invalide (Zod) | Pas de POST, dialog ouverte, message d'erreur par champ |
| Plaque déjà existante (409) | Toast erreur avec le `detail` du serveur, dialog ouverte |
| Dashboard, 2 véhicules | Cartes des deux, stats batch en **1 seul** appel `/vehicles/stats/batch` (pas de N+1) |
| Refresh du Dashboard | Rechargement via React Query, mêmes données |
| Clic archivage | `is_active=false` (soft delete), véhicule masqué par défaut |

## 5. Pleins de carburant (`FuelAddDialog`)

| Action | Résultat attendu |
|---|---|
| Ouverture du dialog | Titre, date = aujourd'hui, type pré-rempli depuis le dernier plein, bouton « Stations proches » |
| GPS OK + stations proches | La station la plus proche avec prix valide est **auto-sélectionnée** (nom + prix dans le formulaire) |
| GPS en erreur | Message d'erreur GPS, formulaire utilisable manuellement |
| Soumission en ligne | POST `/fuel-entries/` avec `client_request_id` (UUID), toast succès, dialog fermée |
| Soumission hors-ligne | File + toast info, pas de POST |
| « Serveur injoignable » (TypeError alors qu'on est en ligne) | File + toast info (même sécurité que hors-ligne) |
| Rejet serveur (422) | Toast erreur avec `detail`, dialog **ouverte**, rien en file |
| Compteur < dernier relevé | `confirm()` ; accepté → POST avec `?allow_odometer_decrease=true` ; refusé → rien |
| Type incompatible (Diesel sur une essence) | Avertissement affiché, soumission possible (choix utilisateur) |
| Plein E85 sur véhicule FlexFuel, station auto-sélectionnée | Le prix E10 de la station est capturé : `e10Price` dans le payload **et** (en ligne) POST `/flexfuel/e10-prices` dédupliqué par date |
| Plein E85 hors-ligne | `e10Price` stivé dans le payload de la file ; aucun POST E10 ; la sync l'enregistrera plus tard |
| Refresh pendant la saisie | Les champs non soumis sont perdus (comportement accepté) ; les pleins déjà ajoutés sont en BDD |

## 6. Maintenance (`MaintenanceAddDialog`)

| Action | Résultat attendu |
|---|---|
| Soumission valide | POST `/maintenances/`, toast succès, dialog fermée |
| Champ requis vide | Pas de POST, dialog ouverte (pas d'UI d'erreur par champ — comportement connu) |
| Rejet 400 du serveur | Toast erreur avec `detail`, dialog ouverte |
| Hors-ligne | File `maintenance-create` + toast info |
| Rappels | Date + km prises en compte pour les alertes à venir |

## 7. FlexFuel E85 (dialogs)

| Action | Résultat attendu |
|---|---|
| Prix de référence E10 — liste | Prix affichés ; état vide « Aucun prix enregistré » |
| Ajout prix | POST `/flexfuel/e10-prices` (nombre parsé) ; prix non positif rejeté côté client |
| Suppression prix | DELETE `/flexfuel/e10-prices/{id}` |
| Conversion — création | POST `/flexfuel/vehicles/{id}/conversion` avec `vehicle_id` |
| Conversion — édition | Formulaire pré-rempli, PUT **sans** `vehicle_id`, bouton « Supprimer » (confirm → DELETE) |
| Coût kit vide | Blocqué par Zod, pas de POST |
| BlendCalculator, `vehicleId=null` | Dialog restée fermée |
| BlendCalculator, pas de conversion | Message « Aucune conversion FlexFuel enregistrée pour ce véhicule. » |
| BlendCalculator, conversion présente | Ligne cible (ethanol %) calculée et affichée |

## 8. Prix des stations (`StationPricesDialog`, depuis le Header)

| Action | Résultat attendu |
|---|---|
| Clic « Prix des stations » (Header) | Dialog ouverte, GPS capturé automatiquement |
| GPS OK | Liste des stations dans le rayon, badge « GPS actif », badge « moins cher » sur la moins chère |
| Tri distance | Plus proche d'abord ; « à vol d'oiseau » affiché si pas de legs routiers (fallback) |
| GPS en erreur | « GPS indisponible — recherchez une ville ci-dessus. » + bouton « Réessayer » |
| Saisie d'une ville (300 ms debounce) | Fetch `geo.api.gouv.fr/communes?nom=…`, suggestions dans le `datalist` |
| API stations en erreur (500) | « Impossible de charger les prix des stations », pas de lignes |
| Aucune station dans le rayon | « Aucune station trouvée dans un rayon de 5 km. » |
| Clic sur l'étoile d'une station | Favori basculé dans `vroomvroom-fav-stations` (localStorage), étoile dorée, favoris remontés en tête |

## 9. Thème (Header)

| Action | Résultat attendu |
|---|---|
| Rendu initial | Titre « VroomVroom », boutons stations + thème ; dialog stations fermée |
| Clic thème (light) | Classe `dark` sur `<html>` (next-themes, persistance `vroomvroom-theme`) |
| Clic thème (dark) | Retour light (allers-retours stables) |
| Échap dans la dialog stations | La referme (Radix, pas de bouton X dédié) |

## 10. Graphiques (8 composants Recharts)

| Action / état | Résultat attendu |
|---|---|
| Consommation < 2 pleins complets | « Pas assez de données (minimum 2 pleins complets nécessaires) » |
| Consommation ≥ 2 points | SVG + moyenne pondérée par distance |
| Prix < 2 entrées | « Pas assez de données » |
| Distance / Habitudes, vide | Rien rendu (null) — pas de graphique vide |
| Odomètre | « Progression kilométrique » + SVG (stats via hook) |
| Éthanol, capacité réservoir vide | « Renseignez la capacité du réservoir » |
| Rentabilité FlexFuel, 0 plein E85 | « Aucun plein E85 enregistré depuis la conversion… » |
| Rentabilité, ≥ 2 points | SVG courbe d'économies cumulées |

## 11. Export CSV

| Action | Résultat attendu |
|---|---|
| Clic export (carburant) | Blob avec BOM UTF-8, séparateur `;`, en-tête FR, dates triées, prix 3 décimales, `is_full_tank` → Oui/Non |
| Clic export (maintenance) | En-tête maintenance, cellules nulles vides |
| Champs contenant `;` ou `"` | Enclos entre guillemets, `"` doublés |
| Nom du fichier | `{marque}_{modele}` avec espaces → tirets |
