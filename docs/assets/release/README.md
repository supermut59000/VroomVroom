# VroomVroom — assets release Play Store (2026-11-02)

Capturées sur l'APK debug (émulateur Pixel 7, Android 14) avec les données
d'essai ; **plaque d'immatriculation masquée** (XXXXXXXX) — restaurée après
capture (ER416GP).

| Fichier | Écran |
|---|---|
| `01-dashboard.png` | Dashboard : carte véhicule E85, stats live, assurance |
| `02-ajout-plein.png` | Ajout d'un plein : date, compteur, bouton GPS, type E85 |
| `03-calculateur.png` | Calculateur mélange E85 (cible 75 %, dilution) |
| `04-stations.png` | Prix des stations à proximité (GPS, 36 stations, temps de trajet) |
| `05-alerte-froid.png` | Alerte froid : conseil « ajoutez de l'E10 » (grade E85 borné) |
| `06-parametres.png` | Paramètres : mode des données + section serveur avancée |
| `icon-512.png` | Icône store 512×512 (voiture lucide blanche sur émeraude #10B981) |

L'icône launcher de l'APK est l'adaptive icon correspondante
(`frontend-react/android/app/src/main/res/mipmap-*/ic_launcher*.png`,
fond `#10B981` — `values/ic_launcher_background.xml`).

Nom de l'application : **VroomVroom** (strings.xml) · version 1.0.0 ·
package `fr.ouiouibaguette.vroomvroom`.

Permissions à déclarer (détail dans `../app-android-utilisation.md` §4) :
position (stations GPS + position des pleins), notifications (alerte froid /
rappels), réseau (prix gouv.fr, météo open-meteo, routage, mode serveur).
