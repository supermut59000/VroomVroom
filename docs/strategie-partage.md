# Stratégie de partage — lancement VroomVroom E85

> 2026-10-30 · branche `android-local` · complète market-study-android.md (distribution) et e85-community-research.md (cible).
> **Décision (2026-10-30) : lancement sans campagne forum.** Publication Google Play uniquement — la distribution, c'est la recherche du store : « E85 » / « superéthanol » sur le store Android FR est quasi vide, on les détient tout seuls. Le plan forum/don ci-dessous devient le **plan B**, déclenché si < 20 installs à J+30.
> Pitch de l'app : gratuit, pas de pub, pas de compte, pas de tracking, données 100 % locales.

## 1. Principes

1. **Membre avant de marketer.** Un compte qui existe depuis 2 semaines, qui a répondu à des sujets techniques, puis qui présente une app = crédible. Un compte créé hier qui post une app = spam, et on se fait virer.
2. **L'expérience d'abord, l'app ensuite.** L'app est la réponse à des problèmes que la communauté connaît déjà. On raconte les siens (véritables), puis on donne l'outil.
3. **Un seul post par forum, texte adapté.** Pas de cross-posting identique.
4. **Gratuit + don transparent.** « Financer le compte Play (25 $) » est un objectif petit, concret, vérifiable → les gens paient vraiment. Pas de « soutenez mon projet » vague.
5. **Honnêteté sur les limites** (pas de sync multi-appareils, v1, données locales) — cette communauté repère le marketing à 10 km et punit dur.
6. **Positionnement : complément, pas concurrent.** eFlexFuel et les autres fabricants font l'éducation technique (leurs blogs font le travail de pédagogie) ; l'app fait le calcul. On ne jette jamais de pierre sur un fabricant.

## 2. Le don (0 € d'avance)

- **Ko-fi** (ou BuymeACoffee) : 0 € d'abonnement, ~5–10 % de frais par don. Un lien dans les posts, sur la landing, et un écran « Soutenir » dans l'app.
- Alternative : Stripe Payment Link (2,9 % + 30 ¢) si Ko-fi déçoit.
- **Objectif affiché sur la landing** : jauge « 37 € / 50 € » (25 $ Play + marge), mise à jour manuelle. Quand c'est atteint → on le dit publiquement dans le thread (« c'est fait, merci ») = capital de confiance pour la suite.
- **Plus tard** (seulement si traction, voir §7) : l'offre Pro 2,50 € via Play Billing (market-study-android.md §5). Le pitch de lancement reste 100 % gratuit.

## 3. Calendrier

| Quand | Action |
|---|---|
| **J–14** | Compte sur super-ethanol.com. Lire les règles du forum (auto-promo, rubriques). Répondre 3–5 fois dans « E85 Hiver » / « Tests E85 » / « Le garage » avec de la vraie expertise (règle hiver 75 %, calcule de mélange, surconsommation) — **sans parler de l'app**. |
| **J0** (features spec-alerte-froid-et-filtre-e85.md en place) | **Post #1 : l'expérience** (brouillon §4). |
| **J+7** | **Post #2 : l'app** (brouillon §5) — en réponse au post #1 si le fil vit, sinon nouveau sujet dans la même rubrique. |
| **J+14** | Hardware.fr, topic E85 (830 pages) : répondre au dernier thread « démarrage à froid » ou thread applis existant, version courte du pitch. |
| **J+21** | Groupes Facebook E85 (manuel, texte adapté — pas le même que le forum). |
| **J+30** | Bilan KPI (§7) + post « ce qui arrive » (P2 : % E85 réel par station, carte des stations E85) pour relancer le fil. |

## 4. Post #1 — l'expérience (super-ethanol.com)

**Titre** : `REX — Corsa E 2017 5 portes 1.4 [code moteur] : conversion l'hiver dernier, 5 coups de clé le matin, et le mélange au papier-crayon`

Texte (voix utilisateur, polie le 2026-10-30) :

> Bonjour,
>
> Je suis d'habitude un simple lecteur ici, mais suite à la récente chute des températures et au stress lié au démarrage à froid qui s'ensuit, j'aimerais partager mon retour d'expérience sur ma belle petite Corsa E 2017 (5 portes, 1.4 [code moteur] — un moteur très vieux de conception).
>
> J'ai fait la conversion l'hiver dernier, juste avant la flambée des prix de l'E10. Et même si je m'étais renseigné sur tous les forums que j'avais trouvés, je me suis quand même pris la claque des 5 coups de clé le matin, en me demandant pourquoi j'avais mis 800 € dans un kit bas de gamme Norauto.
>
> Puis, après de longues discussions avec le mécanicien, j'ai compris mon erreur : c'est mon vieux moteur qui a besoin de mélanger, même avec un kit FlexFuel. Le froid + un plein de « vrai » E85, et le démarrage se fait au troisième coup.
>
> Du coup j'ai commencé à faire mes mélanges, un peu comme tout le monde au début : papier et crayon. Combien de litres d'essence avant l'E85 pour rester dans la bande que je veux, combien de % d'éthanol il reste dans le réservoir, combien d'autonomie ça me laisse… avec le taux d'éthanol de la pompe qui n'est jamais le même selon la saison et la station, les calculs s'empilent vite.
>
> C'est comme ça que l'idée m'est venue de me coder une petite application maison : le suivi de ma voiture, mais surtout l'aide au passage à la pompe — le pourcentage de mélange, la perte d'autonomie, et l'évolution du taux d'éthanol dans le réservoir au fil du temps, sans tout ressaisir à chaque plein.
>
> [OPTIONNEL — à garder, crédibilise le REX : Pour donner une idée : conso ~6,6 L/100 en E10, ~7,9 en E85 (soit +20 % de surconsommation, dans la fourchette annoncée), et le kit s'est rentabilisé en [X mois / X km].]
>
> Je finis de la coder en ce moment. Je ferai un retour ici avec des captures quand elle sera prête — et oui, elle sera gratuite.

À remplir avant publication : le **code moteur réel** (EJY = 1.4 16v 95 ch, EJ4 = 8V — un code faux disqualifie le post) et les chiffres du bloc optionnel.

Pourquoi ce texte plutôt qu'un REX « propre » : l'arc « kit bas de gamme blâmé → le mécano qui m'éclaire → papier-crayon → l'app » est auto-dépreciant et honnête, c'est le ton que le forum récompense ; la conclusion amène l'app comme une réponse naturelle au problème, pas comme une pub.

Règles : aucun lien, aucun nom d'app avant le post #2 ; si on demande « mais c'est quoi ? » → « je la montre quand elle sera prête, elle n'est pas finie ».

## 5. Post #2 — l'app

**Titre** : `L'app dont je parlais : calcul de mélange E85 sans deviner, alerte froid, stations E85 — gratuite et 100 % locale`

Contenu :
1. **3–4 captures d'écran** : écran « à la pompe » (le calcul avec les litres), l'alerte froid configurée, la liste stations filtrée E85, la rentabilité du kit.
2. **Ce qu'elle fait** (5 puces) :
   - le % d'éthanol du réservoir est calculé depuis **vos pleins réels** (méthode plein-à-plein) — rien à ressaisir, on ne devine plus le mélange actuel ;
   - recommandation de mélange avec la règle hiver française (75 % du 31/10 au 15/03) ;
   - **alerte froid** : vous choisissez votre ville et l'heure, elle vous prévient le matin si la prévision passe sous votre seuil (avec le conseil plein E10) ;
   - recherche de stations avec prix officiels, **filtre « avec E85 »** ;
   - rentabilité du boîtier, consommation E85/E10 séparée, maintenance.
3. **Ce qu'elle ne fait pas** : pas de compte, pas de cloud, **pas de sync multi-appareils** (export CSV fourni), pas d'OBD, pas d'abonnement.
4. **Téléchargement** : lien Play + lien APK direct + landing.
5. **Le don** : « L'app est gratuite et sans pub. Si elle vous a rendu service, vous pouvez contribuer librement — l'objectif affiché est de couvrir le compte Google Play (25 $) et l'hébergement : [lien Ko-fi]. »
6. **L'accroche technique** (cette communauté adore) : un paragraphe de 3 lignes expliquant le calcul fill-to-fill et pourquoi il est plus juste que les calculateurs qui demandent « quel est votre % actuel ? ».

## 6. Landing self-hostée (0 €)

Sur le domaine `*.home.ouiouibaguette.fr` (SSL déjà en place) :
- 3 captures, badge Play + bouton APK, widget don + **jauge de progression** (37/50 €) ;
- pitch en 2 phrases : « L'app E85 complète pour la France. Vos données ne quittent jamais votre téléphone. » ;
- « Comment le calcul marche » (3 lignes, crédibilité technique) ;
- FAQ courte : sync ? (non, export CSV) · iOS ? (PWA installable, pas de native) · % E85 par station ? (paramétrable, v2 communautaire) · prix ? (gratuit, don libre).

## 7. KPI — bilan à J+30

| Indicateur | Cible |
|---|---|
| Installs (Play + APK) | ≥ 50 |
| Réponses aux posts | ≥ 10 |
| Dons (plan B seulement) | — par défaut ; ≥ 3 si le plan B est déclenché |
| Signalements / demandes de modération | 0 |

**Décisions** :
- < 20 installs à J+30 → **déclencher le plan B** : post #1 (expérience, §4) puis post #2 (app, §5) sur super-ethanol.com, puis Hardware.fr ; don Ko-fi (objectif 50 €) seulement si la traction forum le justifie.
- ≥ 100 installs → préparer l'offre Pro 2,50 € (Play Billing) + la roadmap P2 de l'étude de terrain.
- Quel que soit le scénario : répondre à chaque avis Play — c'est le seul « forum » qui ne coûte rien en plus.

**La seule « pub » indispensable et gratuite : le listing Play.** Titre qui contient les mots de recherche (`E85 — Calcul mélange, alerte froid, stations`), mots-clés « superéthanol / flexfuel / éthanol » dans la description, 4–8 captures qui montrent l'écran de mélange et l'alerte froid en premier. C'est ce qui fera 80 % des installs, pas les forums.

## 8. Risques & règles d'engagement

- **Auto-promo sur super-ethanol.com** : vérifier les règles avant le post #2 ; si une rubrique « annonces/ressources » existe, l'utiliser ; sinon le cadre « suite de mon post expérience » est la meilleure défense.
- **Hardware.fr** : grosse audience = gros potentiel de trolls ; le post #1 doit être techniquement irréprochable (chiffres, sources), ne pas engager de débat mécanique.
- **Questions hors périmètre** (cartographies, mécanique, homologation) : répondre par « je ne suis pas pro, regardez X » — ne pas se faire piéger en terrain inconnu.
- **L'objectif de don atteint** : l'annoncer publiquement, point. Ne pas demander une 2e fois dans le mois.
- **Feedback négatif sur l'app** : le lire, le remercier, le mettre dans la roadmap P2 — ne jamais se justifier longuement en public.

## 9. Canaux à moindre coût hors forum (classés par coût-temps)

| Canal | Coût-temps | Pourquoi ça marche |
|---|---|---|
| **Référence data.gouv.fr** (réutilisation de données officielles) | 30 min | L'app réutilise le dataset `prix-des-carburants-en-france-flux-instantane-v2` — Øctane a déjà sa page (`data.gouv.fr/reuses/octane`). Gratuit, officiel, indexé, et crédible auprès d'une audience E85 qui fait confiance aux données gouv. |
| **Mails aux fabricants de kits** (eFlexFuel, Ethabox, Biosystem, biomotors, roulezenpascher) | ~1 h au total | Leurs blogs font l'éducation E85 (mélange hiver, démarrage à froid, amortissement) — l'app automatise exactement ce qu'ils expliquent. Pitch 2 lignes : « une app gratuite pour vos clients qui fait le calcul du mélange hiver et suit la rentabilité du kit ». Zéro auto-promo : c'est eux qui publient. |
| **1 article SEO sur la landing** | 2–3 h | « Comment calculer son mélange E85/E10 » — requête à volume réel (4 calculateurs web se la disputent : rpmkit, tahatec, calculover, 85Blends). Article avec la vraie formule + règle hiver + app embarquée. Trafic organique long terme, 0 €. |
| **Bouton de partage dans l'app** | 30 min de dev | Web Share API (`navigator.share`) — 0 plugin ; un utilisateur satisfait partage le lien Play dans un groupe Facebook E85. Canal permanent et passif. |
| **1 mail à Bioéthanol France (SNPAA)** | 10 min | Ils publient les bilans sectoriels et les communiqués de presse : « une app gratuite pour les 550 000 véhicules E85 de France » est un sujet tout prêt pour eux. |
| **AlternativeTo + r/FlexFuel** | 1 h | Annuaire SEO international + scène E85 Reddit. Marginal, mais zéro coût et zéro spam (1 post, bien écrit, en anglais). |
| **Vidéo démo 2 min en capture d'écran** (optionnel) | 2 h | Pour la landing, le listing Play et les mails fabricants. Un seul take, pas de mise en scène. |

**Ordre conseillé** : data.gouv.fr + mails fabricants (jour de la publication, 2 h au total) → article SEO (J+3) → bouton de partage (dans la v1) → Bioéthanol France + AlternativeTo (semaine du lancement). Tous ces canaux sont compatibles avec la stratégie « pas de pub » : aucun n'est un post auto-promo, ce sont des référencements et des partenariats.
