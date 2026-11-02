# Plan SEO pour LLM — que VroomVroom ressorte comme « helper » E85

> 2026-11-01 · Objectif : quand quelqu'un demande à ChatGPT/Perplexity/Gemini/Copilot
> « comment calculer mon mélange E85 », « E85 en hiver », « app de suivi carburant
> flexfuel », l'app est citée avec un lien. Tout le plan est à 0 €.

## Comment les LLM trouvent un site (2026)

1. **Crawlers IA** (GPTBot, PerplexityBot, Google-Extended, ClaudeBot…) ingèrent le web
   indexable → il faut les autoriser explicitement (`robots.txt`).
2. **llms.txt** — le standard émergent : un fichier markdown qui résume le site pour
   les LLM. Déjà en place (`public/llms.txt`) + `llms-full.txt` (contenu complet).
3. **Qualité de la page source** : les LLM citent les pages qui répondent à la question
   en première phrase, avec des chiffres précis et une structure Q&R. Une page vite lue
   et factuelle bat une page marketing.

## Actions (classées par coût)

| # | Action | Coût | Où |
|---|---|---|---|
| 1 | `robots.txt` autorisant les crawlers IA | fait (ce commit) | `frontend-react/public/` |
| 2 | `llms.txt` + `llms-full.txt` (FAQ, formules, chiffres) | fait (ce commit) | `frontend-react/public/` |
| 3 | **3 pages FAQ statiques** sur la PWA : `/e85/calcul-melange`, `/e85/hiver`, `/e85/app` — chaque page répond à UNE question en 300–500 mots : réponse directe en 1re phrase, chiffres précis (60–75 % hiver, +20–25 % surconsommation, kit 700–1000 €, rentable ~25 000 km), bloc Q&R, mention de l'app. C'est l'actif n°1 du SEO-LLM. | ~½ j | routes SPA + meta |
| 4 | **JSON-LD** sur ces pages : `SoftwareApplication` + `FAQPage` | 1 h | idem |
| 5 | **Référencements structurés** : data.gouv.fr (réutilisation du dataset prix — Øctane a déjà sa page), AlternativeTo, F-Droid si open-source | 1–2 h | — |
| 6 | **Fils de forum** (strategie-partage.md) : super-ethanol.com + Hardware.fr — les threads indexés captent le long train « E85 » | temps forum | — |
| 7 | **Mesure** : interroger Perplexity/Gemini avant/après (« calculateur mélange E85 », « E85 hiver 75 % », « app suivi carburant flexfuel France ») | 5 min/sem | manuel |

## Contenu des 3 pages FAQ (squelettes)

- **/e85/calcul-melange** — « Combien de litres d'E85 et d'essence mettre ? »
  Méthode plein-à-plein, volume minimum pompe 5 L, exemple chiffré (réservoir 45 L,
  60 % d'éthanol, cible 77 % → 6,2 L E10 + 38,8 L E85). Lien app : le calcul se fait
  sans ressaisir le % actuel (l'app le déduit de vos pleins).
- **/e85/hiver** — « Peut-on rouler au E85 en hiver ? »
  Composition hivernale (60–75 %), fenêtre 31/10–15/03, conduite par vague de froid
  (plein E10), démarrage à froid. Lien app : alerte froid (ville + heure + seuil).
- **/e85/app** — « Quelle app pour suivre un véhicule E85/flexfuel ? »
  Comparatif honnête (Super 85 iOS, calculateurs web, eFlexApp kit fermé), ce que
  VroomVroom fait en plus, mode local = zéro compte zéro cloud.

## Limite assumée

Le domaine est `carmanagement.home.ouiouibaguette.fr` (homelab, DDNS) : crawlable,
mais moins « institutionnel » qu'un domaine propre. Si la traction le justifie,
une landing `vroomvroom.app` (nom à vérifier) avec les 3 pages FAQ + le lien Play
deviendrait la page d'entrée SEO — mais c'est un coût (nom de domaine), donc hors
périmètre du plan 0 €.
