# VroomVroom — Playbook « Mobile / Android / Correctifs »

> **À qui s'adresse ce document ?** À un agent (ou un humain) qui connaît peu le projet et doit
> reproduire les mêmes modifications et la même chasse aux bugs **sans re-découvrir** ce qui a déjà
> été appris à la dure. Il est autoportant : toutes les commandes sont copiables telles quelles.

Dernière mise à jour : v1.0.8 (`versionCode 11`) · 363 tests frontend verts.

---

## 0. À lire AVANT de toucher au code (2 minutes)

| Fichier | Ce qu'on y trouve |
|---|---|
| `CLAUDE.md` | Architecture, conventions, commandes de dev/test |
| `CONTEXT.md` | État courant du produit, décisions récentes |
| `SUMMARY.md` | Résumé haut niveau |
| `docs/architecture.md` | Détail backend/frontend |
| `docs/TODO.md` | Ce qui reste à faire |

**Règle n°1 : lire avant d'écrire.** Ce projet a déjà payé cher des suppositions
(ex. « `fitsSystemWindows` suffit » → faux sur un vrai Pixel avec punch-hole).

**Règle n°2 : un correctif = une vérification machine.** Aucune tâche n'est « finie » sans :
au moins un test/commande qui passe, **et** une capture d'écran de l'app qui montre le résultat.

---

## 1. Carte du projet (ce qui compte pour le mobile)

```
VroomVroom/
├── frontend-react/            # app web (React 19 + Vite + Tailwind v4 + shadcn)
│   ├── src/
│   │   ├── App.tsx            # racine : ThemeProvider > … > Dashboard + TourGuide
│   │   ├── index.css          # thèmes : :root (light) et .dark (variables CSS)
│   │   ├── lib/
│   │   │   ├── api.ts         # transport : local (IndexedDB) vs serveur (HTTP)
│   │   │   ├── tutorial.ts    # événements + drapeaux du tutoriel
│   │   │   └── local/         # mode local : db.ts, services.ts, local-api.ts
│   │   └── components/
│   │       ├── layout/Header.tsx        # header sticky (logo + icônes)
│   │       ├── layout/SettingsDialog.tsx# paramètres, mode serveur, version
│   │       ├── layout/StatusBarSync.tsx # icônes de la barre de statut Android
│   │       ├── setup/ModeSetup.tsx      # onboarding 2 étapes
│   │       ├── tutorial/TourGuide.tsx   # tutoriel à bulles
│   │       ├── fuel/CommuneSelector.tsx # sélecteur de ville (liste custom)
│   │       ├── fuel/FuelViewDialog.tsx  # historique des pleins + pagination
│   │       └── fuel/StationPricesDialog.tsx
│   ├── android/               # coque Capacitor 8
│   │   └── app/src/main/
│   │       ├── java/.../MainActivity.java   # insets / edge-to-edge
│   │       └── res/values{,-night}/styles.xml # fond natif + icônes statut
│   └── capacitor.config.ts
├── dist/                      # artefacts de release (APK/AAB) — non versionné
└── docs/                      # specs et ce playbook
```

Identité de l'app : package **`fr.ouiouibaguette.vroomvroom`**, `minSdk` Capacitor,
`targetSdk 36`, `compileSdk 36`.

---

## 2. Environnement de build (chemins exacts)

```bash
export JAVA_HOME=$HOME/.local/android-tools/jdk21
export ANDROID_HOME=$HOME/.local/android-tools/sdk
export ANDROID_AVD_HOME=$HOME/.config/.android/avd   # ATTENTION : pas ~/.android/avd
export PATH=$ANDROID_HOME/platform-tools:$PATH       # adb
```

Binaires utiles :
- `$ANDROID_HOME/build-tools/36.0.0/aapt2` → `aapt2 dump badging app.apk`
- `$ANDROID_HOME/build-tools/36.0.0/apksigner` → vérifier la signature
- Image Magick (`magick`) pour lire une capture d'écran
- `bun` (frontend), `python3` + PIL pour les mesures pixel

**Clé de signature** (jamais dans le dépôt) :
`~/.keys/vroomvroom-upload.jks` · alias `vroomvroom-upload` · identifiants dans
`~/.keys/vroomvroom-upload.credentials` (chmod 600).
Empreinte attendue du certificat : `A1:BB:1B:65:BC:3A:99:F2:2A:BA:46:55:EC:99:10:C7:F3:B1:2D:8D:9D:5D:14:35:59:D3:8C:1A:B2:87:02:E6`.

---

## 3. Pipeline complet : coder → tester → publier

### 3.1 Tests + build web (toujours dans cet ordre)

```bash
cd frontend-react
bunx vitest run          # attendu : 36 fichiers / 363 tests verts
bun run build            # = tsc -b && vite build
```

> ⚠️ **N'utilise JAMAIS `tsc --noEmit`** : le `tsconfig.json` est un *solution file*
> (`"files": []` + `references`), donc `--noEmit` ne compile rien et passe sur du code cassé.
> La commande qui compte est `bun run build` (strict, unused imports = erreurs).

### 3.2 APK + AAB (release, signés)

```bash
cd frontend-react
bunx cap sync android
cd android
./gradlew assembleRelease bundleRelease --no-daemon     # ~30-60 s
cp app/build/outputs/apk/release/app-release.apk   ../../dist/VroomVroom-v<VER>.apk
cp app/build/outputs/bundle/release/app-release.aab ../../dist/VroomVroom-v<VER>.aab
```

Vérifier systématiquement (sinon un build « OK » peut être une vieille sortie) :

```bash
BT=$(ls -d $HOME/.local/android-tools/sdk/build-tools/*/ | sort | tail -1)
"$BT/aapt2" dump badging dist/VroomVroom-v<VER>.apk | grep '^package'
"$BT/apksigner" verify --print-certs dist/VroomVroom-v<VER>.apk | grep SHA-256
```

### 3.3 Versionner (2 endroits obligatoires + 1 nom de fichier)

| Où | Quoi |
|---|---|
| `frontend-react/android/app/build.gradle` | `versionCode` **+1** à chaque build distribué, `versionName` |
| `frontend-react/src/components/layout/SettingsDialog.tsx` | `const APP_VERSION = '<versionName>'` (affiché dans Paramètres) |
| Fichier publié | **nouveau nom** `VroomVroom-v<versionName>.apk` |

> ⚠️ **Le nom de fichier doit changer à chaque release.** Même nom = même URL = Android/navigateur
> réutilise le téléchargement en cache, l'utilisateur « reteste » l'ancien build et le bug semble
> persister. C'est arrivé (vc2 → vc3) et a coûté une boucle entière.

### 3.4 Publier sur GitHub Pages (lien de test)

Remote `github` = `git@github.com:supermut59000/VroomVroom.git`, branche `gh-pages` (orpheline,
contient seulement les APK + `index.html` + `confidentialite.html`).

```bash
cd /home/supermut59000/Work/VroomVroom
git stash push -q -m wip          # des .pyc traînent souvent, le checkout échoue sinon
git checkout -q --detach github/gh-pages
cp dist/VroomVroom-v<VER>.apk ./VroomVroom-v<VER>.apk
sed -i 's|href="VroomVroom-v<PREV>.apk"|href="VroomVroom-v<VER>.apk"|g' index.html
grep -o 'href="[^"]*apk"' index.html          # vérifier le lien
git add VroomVroom-v<VER>.apk index.html
git commit -q -m "APK v<VER> (vc<CODE>) : <résumé>"
git push github HEAD:gh-pages
git checkout -q master && git stash pop -q
```

Puis **attendre la publication** (30 s à 5 min ; GitHub Pages peut être lent) :

```bash
curl -s -o /dev/null -w "%{http_code}\n" -I \
  https://supermut59000.github.io/VroomVroom/VroomVroom-v<VER>.apk
```

- `200` → c'est en ligne.
- `404` alors que le fichier **est** dans la branche → le build Pages n'a pas tourné :
  pousser un commit vide sur `gh-pages` le relance
  (`git commit --allow-empty -m "chore: re-declenche le build" && git push github HEAD:gh-pages`).
  Vérifier avec `curl -s https://supermut59000.github.io/VroomVroom/ | grep -o 'href="[^"]*apk"'`.

### 3.5 Pousser le code

```bash
git push origin master
git checkout -q android-local && git merge -q master --no-edit && git push origin android-local
git checkout -q master
```

`origin` = Forgejo (`git@forgejo.home.ouiouibaguette.fr:supermut59000/VroomVroom.git`).
Branches : `master` (principal), `android-local` (miroir de travail), `gh-pages` sur `github`.

---

## 4. Boucle de vérification visuelle sur émulateur Android 16

> **Pourquoi c'est indispensable** : plusieurs bugs (header sous l'horloge, bande de statut,
> popup blanche du sélecteur de ville) **ne se voient pas** dans un test unitaire et **varient
> selon la version de WebView**. On regarde l'écran.

### 4.1 Démarrer l'émulateur

```bash
export ANDROID_HOME=$HOME/.local/android-tools/sdk
export ANDROID_AVD_HOME=$HOME/.config/.android/avd
$ANDROID_HOME/emulator/emulator -avd vroomvroom36 -no-window -no-audio   # lancer en arrière-plan
```

- AVD : **`vroomvroom36`** = Android 16 (API 36), `google_apis`, `x86_64`, profil `pixel`
- L'AVD vit dans `$HOME/.config/.android/avd` (XDG). Sans `ANDROID_AVD_HOME`, le lancement
  échoue avec `Unknown AVD name`.
- Cold boot ≈ 1-2 min.

```bash
adb wait-for-device
adb shell getprop sys.boot_completed     # attendre "1"
adb shell getprop ro.build.version.release   # attendu : 16
```

### 4.2 Installer et piloter

```bash
adb install -r dist/VroomVroom-v<VER>.apk
adb shell am force-stop fr.ouiouibaguette.vroomvroom
adb shell am start -n fr.ouiouibaguette.vroomvroom/.MainActivity
adb shell pm clear fr.ouiouibaguette.vroomvroom     # repartir de zéro (onboarding)
adb shell cmd uimode night yes|no                   # thème SYSTÈME clair/sombre
adb shell input tap X Y                             # tap
adb shell input text "Renault"                      # texte (pas d'accents/espaces spéciaux)
adb shell input keyevent 4                          # BACK = fermer le clavier
adb shell input keyevent 67                         # DEL
adb shell input keyevent 123                        # fin de ligne
```

### 4.3 Captures d'écran lisibles

```bash
adb exec-out screencap -p > /tmp/x.png
magick /tmp/x.png -resize 15% -quality 70 /tmp/x_s.jpg   # <= 16 Ko pour être lisible par l'outil `read`
magick /tmp/x.png -crop 1080x300+0+0 +repage -resize 55% -quality 82 /tmp/x_top.jpg   # zoom sur une zone
```

> Les outils de lecture d'image refusent les fichiers > ~16 Ko. **Toujours** redimensionner
> (≈15 % plein écran, 45-60 % pour un crop).

### 4.4 Trouver les coordonnées d'un élément (le point faible de `adb`)

Le WebView **n'expose pas** ses éléments à `uiautomator dump`. Deux méthodes qui marchent :

**a) Détecter les rectangles d'un champ** (bordure = gris intermédiaire sur fond sombre) :

```bash
python3 - <<'EOF'
from PIL import Image
im = Image.open('/tmp/x.png').convert('L'); px = im.load()
rows = [y for y in range(400, 1500) if sum(1 for x in range(150, 950) if 40 < px[x, y] < 120) > 400]
groups = []
for y in rows:
    if groups and y - groups[-1][1] <= 4: groups[-1][1] = y
    else: groups.append([y, y])
print("bandes:", groups)   # haut/bas des champs -> centre = (début+fin)//2
EOF
```

**b) Mesurer une zone zoomée** : cropper avec un décalage connu, puis
`y_réel = y_crop_offset + y_affiché / échelle`. Une grille de lignes rouges tous les 50 px aide :

```bash
magick x.png -crop 1080x520+0+700 +repage -resize 50% \
  -fill red -stroke red -draw "line 0,100 540,100" -draw "line 0,200 540,200" grid.jpg
```

**c) Mesurer une couleur** (vérifier une bande, un fond) :

```bash
magick /tmp/x.png -format "%[pixel:p{540,30}]" info:      # ex: srgba(10,10,10,1)
```

### 4.5 Lire les erreurs réelles (logcat)

```bash
adb logcat -c                                  # vider AVANT l'action
# … faire l'action dans l'app …
adb logcat -d -t 200 | grep -iE "CORS|chromium|net::|Erreur|Exception" | tail -20
```

C'est ce qui a permis d'identifier le vrai message CORS alors que l'UI affichait « 503 ».

---

## 5. Catalogue des bugs déjà résolus (diagnostic → correctif)

> Réutilise ces schémas : beaucoup de bugs ici se répètent (thème, insets, CORS, cache).

### 5.1 Header de l'app masqué par la barre de statut (Android 15/16)

- **Symptôme** : sur un Pixel réel, les boutons du header sont sous l'horloge, non cliquables.
- **Faux correctifs (ne pas refaire)** :
  - `android:fitsSystemWindows="true"` sur le `CoordinatorLayout` de `activity_main.xml`
    → marche sur émulateur, **échoue** sur appareil réel avec punch-hole.
  - Edge-to-edge non forcé : le comportement dépend de la version de WebView.
- **Correctif retenu** (v1.0.6+, `MainActivity.java`) :
  - `WindowCompat.setDecorFitsSystemWindows(getWindow(), false)` **après** `super.onCreate`
    (avant, une ActionBar parasite s'affiche).
  - Listener d'insets qui **ne padde pas le haut** (`setPadding(0,0,0, ime|bars.bottom)`) :
    le WebView passe sous la barre de statut.
  - Injection de la hauteur réelle en CSS : `--sat` (⚠️ **convertir px physiques → dp** :
    `px / getResources().getDisplayMetrics().density`, sinon la bande fait 2,6× trop haut).
  - Côté web : `App.tsx` applique `paddingTop: var(--sat, env(safe-area-inset-top, 0px))`
    et `Header.tsx` est `sticky top-[var(--sat,env(safe-area-inset-top,0px))]`.

### 5.2 Bande de la barre de statut : mauvaise couleur / horloge illisible

- **Symptôme** : bande blanche au-dessus d'une app sombre ; horloge invisible.
- **Pourquoi c'est piégeux** : Capacitor 8 choisit **dynamiquement** entre deux stratégies
  selon la version du WebView (`"css"` = le web peint la bande, `"native"` = le décor est paddé
  et la bande = `windowBackground`, qui suit le **thème système**, pas le thème de l'app).
  → Même APK, rendu différent entre émulateur et téléphone.
- **Correctif** : forcer « le web peint » (listener d'insets pass-through) ⇒ la bande = fond de
  l'app dans tous les cas. Vérifié : jour `#EEEEEE`, nuit `#0A0A0A`, les deux = `--background`.
- **Icônes (piège d'API)** : dans Capacitor, `StatusBarStyle.Dark` = **texte CLAIR**
  (pour fond sombre) et `StatusBarStyle.Light` = **texte SOMBRE** (pour fond clair).
  Mapping correct (`StatusBarSync.tsx`) :
  ```ts
  style: dark ? StatusBarStyle.Dark : StatusBarStyle.Light
  ```
  L'inverse donne des icônes noires sur fond noir / blanches sur fond blanc.

### 5.3 Thème clair « full white » (rien ne se détache)

- `index.css` : `--background` en `oklch(0.95 0 0)` (gris), cartes (`--card`) en blanc,
  bordures `oklch(0.86 0 0)`. Ne **pas** mettre un gris moyen type `#BDBDBD` : jugé « très moche ».
- Aligner le fond natif : `res/values/styles.xml` → `windowBackground #EEEEEE`,
  `res/values-night/styles.xml` → `#252525`. (`windowLightStatusBar` = `true` en light,
  `false` en night, en secours du plugin.)

### 5.4 Onboarding : impossible à passer + ne crée pas le véhicule

- `ModeSetup.tsx` = 2 phases : `welcome` puis `vehicle`.
- Bouton **« Passer »** (phase 1) et **« Passer pour plus tard »** (phase 2) :
  `saveModeConfig({ mode: 'local' })` + `onDone()`, **sans** créer de véhicule et **sans**
  armer le tutoriel (`setTutorialPending()` fait l'inverse).
- La création passe par le hook existant `useCreateVehicle` (mode local déjà sauvegardé avant).

### 5.5 Tutoriel à bulles : « Suivant » mort après le 1er clic

- **Cause racine** : le dialog Radix est **modal** → il rend le reste de la page `inert` ;
  l'overlay du tutoriel (hors du portail) devenait non cliquable. En plus, son `z-[200]` était
  piégé dans un contexte de pile inférieur à celui du dialog portalisé (`z-50`).
- **Correctifs combinés** (`TourGuide.tsx` + `FuelAddDialog.tsx` + `Dashboard.tsx`) :
  1. Overlay du tutoriel rendu via **`createPortal(..., document.body)`** (même contexte que le dialog).
  2. Dialog ouvert en **non-modal pendant le tutoriel** (`modal={!fuelTourMode}`).
  3. **Bulle fixée en bas au centre** (`bottom: 110`) : le bouton « Suivant » ne se déplace plus
     sous le doigt entre les étapes (le spotlight, lui, suit la cible).
  4. **Pas d'auto-focus** du 1er champ (`onOpenAutoFocus` + `isTourActive()`) : sinon le clavier
     s'ouvre, la page bouge et le tap suivant rate.
  5. `onClick` **et non** `onPointerDown` (pointerdown casse le déclenchement).
  6. Déduplication du rect dans la boucle de suivi (sinon re-render toutes les 200 ms).
- Relance manuelle : Paramètres → **« Tutoriel »** → `startTutorial()`.
- Cible du projecteur : attributs `data-tour="add-fuel-fab"` / `data-tour="fuel-submit"`
  (éviter `aria-label`, qui matche plusieurs boutons).

### 5.6 Sélecteur de ville : popup blanche + artefacts bleus

- **Cause** : `<datalist>` **natif**. Sa popup est dessinée par le WebView → non stylable,
  donc blanche sur thème sombre, avec des artefacts.
- **Correctif** (`CommuneSelector.tsx`) : liste maison
  (`absolute … z-50 rounded-md border bg-popover text-popover-foreground shadow-lg`),
  fermeture au `pointerdown` extérieur, sélection sur `onPointerDown` (fiable sur Android),
  fermeture immédiate si la valeur tapée correspond exactement à une suggestion.
- Tests associés : `StationPricesDialog.test.tsx` cherche `role="option"`, plus `<datalist>`.

### 5.7 Pagination comprimée sur mobile

- `FuelViewDialog.tsx` : la ligne `Précédent | Page X / Y (N entrées) | Suivant` débordait.
- Correctif : chevrons seuls sur mobile, compteur court `2 / 5`, libellés en `sm:`,
  `whitespace-nowrap` + `gap-2`.
- ⚠️ Elle ne s'affiche qu'à partir de **21 pleins** (perPage par défaut = 20) : difficile à
  reproduire sur un appareil vierge.

### 5.8 Mode serveur : « Erreur 503 » / appels bloqués

- **Vrai message (logcat)** : `blocked by CORS policy … origin 'https://localhost'`.
  Le WebView a l'origine `https://localhost` ; le backend prod n'autorise pas cette origine
  (`preflight OPTIONS` → `400 Disallowed CORS origin`). **La clé API n'était pas en cause.**
- **Correctif app** (`src/lib/api.ts`) : en plateforme native, `remoteCall()` et `probeServer()`
  passent par **`CapacitorHttp.request()`** (couche HTTP native ⇒ **aucun CORS**, quel que soit
  le réseau LAN/VPN). Le `fetch` classique reste pour le navigateur/PWA.
- **Serveur (à faire par l'utilisateur, pas d'accès SSH à 192.168.25.22)** :
  `.env.docker` → `BACKEND_CORS_ORIGINS` doit contenir au minimum
  `https://localhost,capacitor://localhost,https://supermut59000.github.io`
  (+ l'origine exacte de tout accès navigateur via VPN), puis `docker compose up -d backend`.
- API prod : `https://carmanagementapi.home.ouiouibaguette.fr` (192.168.25.22, derrière Caddy).
  Actuellement `API_KEY` **vide** côté serveur ⇒ auth désactivée (un GET sans clé renvoie 200).

### 5.9 Divers déjà rencontrés

- **`--` interdit dans un commentaire XML** : un commentaire Android contenant `--background`
  a cassé `bundleRelease` (`The string "--" is not permitted within comments`).
- **`.pyc` modifiés** : `git checkout` d'une autre branche échoue → `git stash push` avant.
- **`pm clear` pour rejouer l'onboarding** : sinon le mode est déjà enregistré (`vv_mode`).
- **Champs de formulaire via `adb`** : le clavier qui s'ouvre décale tout ; fermer avec
  `keyevent 4` entre chaque champ et **vérifier par capture** après chaque saisie.
- **`input type=number`** : un résidu (`450003-`) bloque la soumission HTML5
  (« Please enter a number ») → vider avec plusieurs `keyevent 67`, pas un seul.

---

## 6. Pièges transverses (à connaître par cœur)

1. **Le cache de téléchargement** : nouveau nom de fichier à chaque release (§3.3).
2. **Le rendu dépend du WebView** : toujours tester sur l'émulateur **le plus proche de l'appareil
   de l'utilisateur** (ici Android 16 / AVD `vroomvroom36`), et se méfier d'un « ça marche sur
   l'émulateur » quand un vrai appareil diffère (punch-hole, densité, WebView à jour).
3. **px physiques ≠ px CSS** : le CSS raisonne en **dp** (`px / density`).
4. **Dialogs Radix modaux** : `inert` sur le reste de la page → tout overlay hors portail devient
   inerte. Utiliser `createPortal` + `modal={false}` quand on doit interagir avec un overlay.
5. **z-index + portails** : un `z-[200]` dans l'arbre React ne gagne pas contre un `z-50`
   portalisé dans `<body>`.
6. **API Capacitor trompeuse** : `StatusBarStyle.Dark` = texte clair, `Light` = texte sombre.
7. **`tsc --noEmit` ne vérifie rien ici** : utiliser `bun run build`.
8. **Tests frontend** : `fake-indexeddb/auto` requis pour la couche locale ; `localStorage` est
   un stub Node → `src/test/setup.ts` installe un vrai storage ; Radix a besoin des polyfills
   de pointeurs (déjà en place).
9. **Français dans l'UI** : tous les libellés sont en français (`src/lib/i18n.ts`).
10. **Thème** : `next-themes`, `defaultTheme="system"`, clé `vroomvroom-theme`. La bande de statut
    native suit le thème système ; le correctif §5.2 la fait suivre le thème de l'app.

---

## 7. Checklist « c'est fini » (à cocher avant de répondre à l'utilisateur)

- [ ] `cd frontend-react && bunx vitest run` → **363 tests verts** (ou plus, aucune régression)
- [ ] `bun run build` → OK (aucune erreur TS, y compris imports inutilisés)
- [ ] `bunx cap sync android` exécuté si du code web a changé
- [ ] `./gradlew assembleRelease bundleRelease` → BUILD SUCCESSFUL
- [ ] `aapt2 dump badging` → **bon `versionCode` / `versionName`**
- [ ] `apksigner verify --print-certs` → empreinte `A1:BB:1B:65:…:87:02:E6`
- [ ] Version affichée dans Paramètres = `APP_VERSION` mis à jour
- [ ] **Capture d'écran** de l'app montrant le correctif (clair **et** sombre si c'est visuel)
- [ ] Si visuel/home : testé sur AVD `vroomvroom36` (Android 16), pas seulement en pensant
- [ ] APK copié dans `dist/` avec un **nom neuf**, publié sur `gh-pages`, `curl` → **200**
- [ ] AAB disponible pour la Play Console
- [ ] Commit explicite + `git push origin master` (et `android-local`)
- [ ] Aucun secret commité (`.jks`, `key.properties`, `.env.docker`, mots de passe)

---

## 8. Recettes de dépannage express

| Symptôme | Cause probable | Action |
|---|---|---|
| `Unknown AVD name` | `ANDROID_AVD_HOME` non défini | `export ANDROID_AVD_HOME=$HOME/.config/.android/avd` |
| Gradle échoue sur un XML | commentaire contenant `--` | reformuler le commentaire (un seul tiret) |
| `git checkout` refuse | `.pyc` modifiés | `git stash push -q -m wip` |
| Pages renvoie 404 après push | build Pages non déclenché | commit vide sur `gh-pages` (§3.4) |
| L'app ne se met pas à jour | cache (même nom de fichier) / `versionCode` non incrémenté | nouveau nom + `versionCode` +1 |
| « Erreur 503 » en mode serveur | CORS (voir logcat) | `CapacitorHttp` déjà en place ; sinon corriger `BACKEND_CORS_ORIGINS` |
| Bande de statut incohérente entre appareils | stratégie d'insets Capacitor | §5.2 (pass-through + `--sat`) |
| Horloge illisible | mapping `StatusBarStyle` inversé | §5.2 |
| Popup de suggestion blanche | `<datalist>` natif | §5.6 (liste custom) |
| « Suivant » du tutoriel sans effet | dialog modal (`inert`) + z-index | §5.5 |

---

## 9. Ce qu'il ne faut JAMAIS faire

- Committer `~/.keys/*.jks`, `key.properties`, `.env.docker`, ou les mots de passe de signature.
- `git push --force` sur `master` / `gh-pages`.
- Réutiliser un `versionCode` (la Play Console le refuse) ou un nom de fichier d'APK.
- Remplacer `bun run build` par `tsc --noEmit`.
- Conclure « corrigé » sans capture d'écran quand le bug est visuel.
- Modifier le serveur prod 192.168.25.22 : **pas d'accès SSH** — documenter et laisser
  l'utilisateur appliquer (`BACKEND_CORS_ORIGINS`, redéploiement).
- Ajouter une dépendance lourde pour un besoin ponctuel (le projet reste léger :
  React + shadcn + Capacitor).

---

## 10. Aide-mémoire des commandes (copier-coller)

```bash
# --- Tests & build web ---
cd ~/Work/VroomVroom/frontend-react && bunx vitest run && bun run build

# --- APK/AAB ---
cd ~/Work/VroomVroom/frontend-react && bunx cap sync android
cd android && JAVA_HOME=$HOME/.local/android-tools/jdk21 ANDROID_HOME=$HOME/.local/android-tools/sdk \
  ./gradlew assembleRelease bundleRelease --no-daemon

# --- Émulateur Android 16 ---
export ANDROID_HOME=$HOME/.local/android-tools/sdk ANDROID_AVD_HOME=$HOME/.config/.android/avd
$ANDROID_HOME/emulator/emulator -avd vroomvroom36 -no-window -no-audio &
adb wait-for-device && adb shell getprop sys.boot_completed

# --- Vérifier l'APK ---
BT=$(ls -d $HOME/.local/android-tools/sdk/build-tools/*/ | sort | tail -1)
"$BT/aapt2" dump badging dist/VroomVroom-vX.Y.Z.apk | grep '^package'
"$BT/apksigner" verify --print-certs dist/VroomVroom-vX.Y.Z.apk | grep SHA-256

# --- Publier sur Pages ---
cd ~/Work/VroomVroom && git stash push -q -m wip && git checkout -q --detach github/gh-pages \
  && cp dist/VroomVroom-vX.Y.Z.apk . && \
  sed -i 's|href="VroomVroom-vOLD.apk"|href="VroomVroom-vX.Y.Z.apk"|g' index.html && \
  git add -A && git commit -qm "APK vX.Y.Z" && git push github HEAD:gh-pages && \
  git checkout -q master && git stash pop -q
curl -s -o /dev/null -w "%{http_code}\n" -I https://supermut59000.github.io/VroomVroom/VroomVroom-vX.Y.Z.apk

# --- Logs de l'app ---
adb logcat -c; # <action> ; puis :
adb logcat -d -t 200 | grep -iE "CORS|chromium|net::|Erreur|Exception" | tail -20
```
