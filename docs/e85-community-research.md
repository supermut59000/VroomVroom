# Étude de terrain — Communauté E85 (blogs & forums FR)

> 2026-10-30 · branche `android-local` · complétée par [market-study-android.md](market-study-android.md).
> Objectif : ce qui bloque les utilisateurs E85, ce qu'ils demandent, ce qu'aucun concurrent ne fait.

## Sources

| Source | Type | Indexée |
|---|---|---|
| super-ethanol.com/forum-e85 | forum E85 FR dédié — **15 300 membres, 24 800 posts, 32 forums** | ✅ (structure + extraits) |
| eflexfuel.forumactif.com | forum du fabricant eFlexFuel | ✅ partiel (inscription requise) |
| forum.hardware.fr — topic « rouleurs E85 » | forum généraliste, **topic de 830 pages** | ❌ 404 anti-bot — vu via extraits de recherche |
| eflexfuelfrance.com/blog | blog fabricant (mélange hiver, kit, amortissement) | ✅ |
| biosystem-france.fr | blog fabricant | ❌ injoignable (connection refused) |
| rpmkit.com/fr, calculover.com, tahatec.com | calculateurs web E85 (US, traduits FR) | ✅ |
| Apps : Super 85 (iOS), e85app.com (US), 85Blends (iOS), Ethanol Blend Calculator E85, Øctane | concurrents E85 | ✅ (fiches store) |
| forums Auto Plus, motorsport-passion, mx5france, dyaneclub | retours d'expérience utilisateurs | ✅ extraits |

Limites : les groupes Facebook E85 (grandes communautés) ne sont pas crawlables — à lire manuellement avant le lancement. Le corps des threads super-ethanol.com est en lazy-load : structure et sujets visibles, pas tous les posts.

## 1. Les bloquages (ce qui freine / fait peur)

1. **Le démarrage à froid — la peur n°1, chronique.**
   Tous les blogs fabricants ont un article dessus (eFlexFuel, Ethabox, Biosystem, biomotors, Boutique Flexfuel, roulezenpascher). En 2021, un changement de composition de l'E85 (vapeurs abaissées, taux éthanol minimum 75 %, « toutes stations ne sont pas concernées ») a déclenché une crise de démarrages à froid documentée sur le forum eFlexFuel. Exemples de terrain : rouleuse Auto Plus qui a **abandonné l'éthanol après des pannes à 5 °C** ; skieur mx5france rassuré à −12 °C avec kit homologué. Point d'éclair éthanol ~13–15 °C vs −40 °C essence.
   → **L'app doit répondre sans ambigüité : « est-ce que je peux démarrer, à quel % d'éthanol, cette semaine ? »** La recommandation anti-coincement de froid est le premier facteur de réassurance.

2. **Le taux réel d'éthanol de l'E85 — inconnu et variable.**
   Été : 75–85 % d'éthanol ; hiver : 60–75 % (jusqu'à 40 % de SP). Arrêté officiel : éthanol min 65/70/75, max 75/80/85 selon la saison. rpmkit : « le taux réel d'éthanol de votre E85 est la plus grande inconnue ». La communauté super-ethanol.com a une rubrique **« Tests E85 »** : ils mesurent le % réel station par station à la main.
   → Le calcul de mélange doit accepter un % E85 configurable (défaut 85, hiver 75) et idéalement un override par station.

3. **Le calcul du mélange à la main, à chaque plein.**
   Quatre outils existent déjà (Super 85 iOS, rpmkit, 85Blends, calculover) = besoin validé. Mais tous sont **stateless** : l'utilisateur ressaisit à chaque fois le niveau du réservoir et le % d'éthanol actuel (deviné). Le postulat de Super 85 : « Plus besoin de vous rappeler de combien de chaque carburant ».
   → **Personne ne part de l'historique réel des pleins.** C'est LE trou : notre algorithme fill-to-fill calcule l'état du réservoir exactement, sans saisie. C'est la différenciation n°1.

4. **La peur de la conversion / mauvaises installations.**
   « Méfie-toi de 80 % des pros qui n'y connaissent pas grand-chose » (motorsport-passion) ; coupures moteur, emplacement de sonde à rebrider (Ethabox), cartographies toutes faites.
   → Pas un problème d'app, mais l'app doit **rassurer par les chiffres** : surconsommation réelle mesurée, économies réelles, date de break-even.

5. **L'amortissement du kit — la question d'achat.**
   Chiffres du marché (blog eFlexFuel) : kit **700–1 000 € pose comprise**, rentabilité **~25 000 km**, économie **30–45 % du budget carburant**, surconsommation **+20–25 %** (Que Choisir : 15–25 %).
   → On l'a déjà (module rentabilité). À mettre en avant, pas à construire.

## 2. Les besoins (demandes concrètes de la communauté)

| Besoin | Preuve | Qui le fait aujourd'hui |
|---|---|---|
| Écran « à la pompe » : % cible → litres E85 + litres E10/SP95 à mettre | 4 outils existants = besoin validé ; Super 85 : 12 notes 4,3 ★ (iOS) | Super 85 (iOS), calcul web stateless |
| **Mémoire du réservoir** — ne pas ressaisir le mélange actuel | postulat explicite de Super 85 ; aucun concurrent ne l'a | **personne** |
| Taux réel d'éthanol par station | rubrique « Tests E85 » faite à la main sur super-ethanol.com | **personne** (dans une app) |
| Carte + prix des stations E85 (42 % des stations FR en ont) | Øctane (gratuit, 0 suivi de plein) | Øctane (carte seule) |
| Historique d'économies E85 vs E10 | avis Super 85 : « l'historique des pleins permet de se rendre compte des économies réalisées » = ce que les users citent | Super 85, eFlexApp (kit fermé) |
| Orientation saisonnière : % max hiver, que faire avant un **coincement de froid** | pratique utilisateur documentée : plein SP avant la vague de froid | blogs (texte), personne en app |
| Alerte météo / coincement | personne ne le fait dans la niche | **personne** |

## 3. Ce qui manque (gaps croisés sur tous les concurrents)

| Capacité | Super 85 (iOS) | eFlexApp | Øctane | 85Blends (iOS) | calculs web (rpmkit…) | **VroomVroom (projet)** |
|---|---|---|---|---|---|---|
| Calcul mélange **stateful** (à partir des pleins réels) | partiel (historique simple) | ✗ | ✗ | ✗ (saisie manuelle) | ✗ (saisie manuelle) | ✅ (fill-to-fill exact) |
| Règle hiver FR (75 %, 31/10–15/03) + reco | ✗ | texte blog | ✗ | ✗ | ✗ | ✅ |
| Rentabilité du kit (tout boîtier) | ✗ | kit eFlexFuel seulement | ✗ | ✗ | ✗ | ✅ |
| Conso E85/E10 séparée par segment | ✗ | perfs temps réel (BT) | ✗ | ✗ | ✗ | ✅ |
| % E85 réel configurable / par station | ✗ | ✓ (sonde BT, kit seul) | ✗ | ✗ | ✓ (saisie) | ⬜ **à ajouter** |
| Alerte coincement de froid (météo) | ✗ | ✗ | ✗ | ✗ | ✗ | ⬜ **à ajouter** |
| Données 100 % locales | probable | ✓ (BT) | ✗ (web) | ✗ | ✗ (web) | ✅ |
| Prix stations officiels FR | ✗ (saisie manuelle) | ✗ | ✅ | ✗ | ✗ | ✅ |
| Android | **✗ (iOS only)** | ✓ | ✓ | en dev | ✓ | ⬜ **notre terrain** |

Deux cases « ⬜ à ajouter » = les seules fonctionnalités neuves à construire. Tout le reste du moat existe déjà.

## 4. Chiffres de marché repris des blogs

- Kit E85 homologué : **700–1 000 €** pose comprise (eFlexFuel)
- Rentabilité : **~25 000 km** ; économie **30–45 %** du budget carburant ; surconsommation **+15 à +25 %** (eFlexFuel, Que Choisir)
- Composition E85 : été 75–85 % éthanol, hiver 60–75 % (décret : min 65/70/75, max 75/80/85)
- super-ethanol.com : **15 300 membres** (forum Le garage : 1 272 posts ; rubriques « Tests E85 », « Stations E85 », « Vos questions »)
- Hardware.fr : topic E85 de **830 pages** (audience généraliste massive, sujet éternel)
- France : 400 000–550 000 véhicules E85, 42 % des stations (voir market-study-android.md §1)

## 5. Ce qu'on fait — priorités pour `android-local`

**P0 — déjà construit, à mettre en avant (0 dev)** : calcul de mélange stateful + règle hiver FR, rentabilité du kit, conso E85/E10 séparée, 100 % local, prix officiels FR. C'est le pitch.

**P1 — fonctionnalités neuves à fort impact, peu coûteuses** (dans l'ordre) :
1. **Écran « À la pompe »** = 1er écran de l'app : % cible (défaut personnalisé, bande ± tolérance) → litres E85 + litres E10/SP95, calculé **sans aucune saisie** depuis l'historique ; bouton « enregistrer ces 2 pleins » (le pattern booster existe déjà dans la queue). C'est l'écran qui fait payer les 2,50 €.
2. **% E85 configurable** (défaut 85, préselection 75 en hiver selon la période) + override par station dans l'historique — couvre le gap « taux réel ».
3. **Coincement de froid** : open-meteo (gratuit, **sans clé API**) → « 4 °C prévus dimanche : plein E10, ou rester ≤ 75 % E85 ». Personne ne le fait dans la niche ; c'est le buzz du lancement.

**P2 — après la v1 Play** :
4. Carte des stations **avec prix E85** (le dataset gouv.fr contient déjà les prix E85 → simple filtre, pas de new endpoint).
5. % E85 réel par station validé par la communauté → nécessite un serveur partagé → **après** la version multi-user (ou rester local : saisie manuelle par station, P1.2 suffit).

**Lancement** (ordre d'impact) :
1. Forum **super-ethanol.com** — rubrique « Vos questions » : c'est LA communauté (15 300 membres), et c'est là qu'ils font leurs « Tests E85 » à la main.
2. Topic **Hardware.fr** (830 pages, indexé, éternel) — une réponse avec l'app dans un thread « démarrage froid » = trafic permanent.
3. Groupes Facebook E85 (à rejoindre manuellement avant le lancement — invisible au crawler).
4. Bioéthanol France / eFlexFuel (partnerships : leurs blogs font exactement le contenu qu'on automatise).

## 6. Limites de cette étude

- Hardware.fr (threads) et biosystem-france.fr non indexés (anti-bot / injoignable) — content via extraits de recherche uniquement.
- eFlexFuel forum partiel (login requis).
- Super 85 : 12 notes → traction réelle inconnue ; **iOS-only = le créneau Android FR est vide**, mais vérifier sa présence sur Play avant de publier (possibilité d'une sortie Android récente non indexée).
- Pas de données de volume de téléchargements des calculateurs web (rpmkit, tahatec).
- Communautés Facebook = gros volume probable, non auditable.
