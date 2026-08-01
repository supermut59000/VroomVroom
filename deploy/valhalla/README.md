# Valhalla — serveur de routage autonome (France)

Service **indépendant de VroomVroom**. VroomVroom n'en est qu'un client parmi
d'autres : GPS maison, futurs projets. Rien ici ne dépend de l'app véhicules.

## Pourquoi Valhalla plutôt qu'OSRM

OSRM garde tout le graphe routier en RAM : ~16 Go pour la France, et
l'étape `osrm-extract` demande ~45 Go. Valhalla découpe le réseau en **tuiles
hiérarchiques** (niveau 0 = autoroutes, 1 = axes principaux, 2 = rues locales)
et ne charge que celles dont il a besoin. La RAM ne dépend donc plus de la
taille du jeu de données — on sert la France entière dans quelques Go.

Contrepartie : plus de disque, et la première requête dans une zone froide lit
le disque (imperceptible sur SSD, sensible sur disque mécanique).

## Ce que ça expose (l'intérêt du standalone)

Une seule instance sert tous tes projets :

| Endpoint | Usage |
|---|---|
| `POST /route` | itinéraire complet avec instructions virage par virage → **GPS maison** |
| `POST /sources_to_targets` | matrice distance/temps → utilisé par VroomVroom |
| `POST /isochrone` | zones atteignables en X minutes (« stations à moins de 15 min ») |
| `POST /trace_route` | map matching : recaler une trace GPS sur les routes |
| `POST /optimized_route` | ordre de passage optimal (tournée multi-arrêts) |
| `POST /locate` | infos sur le tronçon le plus proche d'un point |
| `GET /status` | santé du service |

Profils de coût (`costing`) : `auto`, `truck`, `bicycle`, `pedestrian`,
`motorcycle`, `bus`, `taxi`.

## Prérequis

- **Disque** : ~30 Go libres (pbf ~4-5 Go + tuiles France ~10-20 Go + marge)
- **RAM au build** : plusieurs Go — nettement moins qu'OSRM, mais pas rien
- **RAM en service** : quelques Go, réglable via le cache de tuiles
- SSD/NVMe fortement conseillé

Ces ordres de grandeur bougent avec la taille de l'extract OSM : vérifie la
taille courante sur Geofabrik avant de lancer.

## Démarrage

```bash
cd deploy/valhalla
mkdir -p tiles
docker compose up -d
docker compose logs -f valhalla
```

Le **premier** démarrage télécharge `france-latest.osm.pbf` puis construit les
tuiles : compte **plusieurs heures**. Le conteneur ne répond pas pendant ce
temps (`start_period: 30m` sur le healthcheck évite juste qu'il soit tué trop
tôt — allonge-le si besoin). Les démarrages suivants réutilisent `./tiles` et
prennent quelques secondes.

Vérification :

```bash
curl -s http://localhost:8002/status | jq
curl -s -X POST http://localhost:8002/sources_to_targets \
  -H 'Content-Type: application/json' \
  -d '{"sources":[{"lat":50.69,"lon":2.65}],
       "targets":[{"lat":50.72,"lon":2.72}],
       "costing":"auto","units":"kilometers"}' | jq
```

## Brancher VroomVroom dessus

Dans `backend/.env` :

```bash
ROUTING_PROVIDER=valhalla
ROUTING_URL=http://<ip-ou-hote-valhalla>:8002
ROUTING_PROFILE_VALHALLA=auto
```

Puis redémarrer le backend. Aucun changement de code : le service détecte le
fournisseur et parle `/sources_to_targets` au lieu du `table` d'OSRM.

Si Valhalla est dans le même réseau Docker, `ROUTING_URL=http://valhalla:8002`
suffit.

## Attention : couverture partielle

Si tu construis les tuiles d'**une seule région** pour économiser du disque,
sache que les moteurs de routage rabattent chaque coordonnée sur la route la
plus proche **de leur jeu de données**. Une requête hors zone ne renvoie pas
une erreur : elle se rabat sur une route à des centaines de km et retourne un
temps plausible mais faux.

VroomVroom encaisse le cas proprement (temps absent → affichage « à vol
d'oiseau »), mais uniquement si le serveur répond « pas de route ». Pour les
trajets partout en France : construire la France entière.

## Mise à jour des cartes

Les routes bougent peu. Une reconstruction **une à deux fois par an** suffit
largement pour des temps de trajet vers des stations :

```bash
docker compose down
rm -rf tiles/*
docker compose up -d   # retélécharge et reconstruit
```

Ou passer `force_rebuild=True` le temps d'un démarrage.
