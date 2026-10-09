# Rapport — finalisation de l'interface Carbu

## Lots réalisés

| Lot | Contenu | Commit |
|---|---|---|
| F0.0 | **Proxy géocodage** `GET /v1/geocode` vers la Géoplateforme/BAN (hôte fixe, q nettoyé 3–200, 5 résultats, cache LRU, limite par clé 30/min, timeout, aucune redirection, 502, aucun log de la saisie) | `5154cf5` |
| F0.1 | **Fondations** : modules ES (`config/api/format/geometry/state`), `CONFIG` aligné sur l'OpenAPI, `apiFetch`+`ApiError`, réglages mémorisés, `allowJs` | `b645d42` |
| F0.2–F0.8 | **Refonte de l'interface** (voir ci-dessous) | `98dbbc1` |

## Ce que fait l'interface

- **Recherche** : villes prédéfinies, géolocalisation, **adresse via `/v1/geocode`**,
  réglages (carburant, rayon, litres, consommation, tri), recherche **debounce** avec
  **AbortController**, **validation client** par champ + affichage des 400 de l'API.
- **Plan SVG** : anneaux de distance, point « Toi », stations colorées par teinte de prix,
  cercles **focusables** (Entrée/Espace), sélection synchronisée avec la liste.
- **États** : 401 (renvoi vers la clé), 429 (compte à rebours `Retry-After`), 5xx, réseau,
  vide, `truncated`, badges périmé/rupture, fraîcheur (`data_freshness`).
- **Détail** : prix par carburant, badges, courbe d'historique (min/max, cas insuffisant).
- **Alertes** : création validée, liste, suppression **confirmée**, événements.
- **Thème** clair/sombre (préférence système + bouton mémorisé), responsive (plan au-dessus
  de la liste en mobile), `prefers-reduced-motion` respecté.
- **Sécurité front** : aucun inline, données échappées, clé en `localStorage` + « oublier »,
  gestionnaire global d'erreurs (`error`/`unhandledrejection`).

## Choix de design et justification

- **Afficheur de prix signature** (fond `#10161c`, chiffres ambre `#ffb703`, condensé,
  tabulaires) : rappelle un prix de station, immédiatement lisible, utilisé comme accent
  et non partout.
- **Palette par variables CSS** avec thème sombre automatique : cohérence et maintenance.
- **Polices auto-hébergées** (Barlow + Barlow Semi Condensed, sous-ensemble latin, OFL) :
  aucune requête externe, donc **CSP stricte inchangée** (pas d'exception `fonts.googleapis`).
- **Plan sans fond de carte externe** : projection réelle relative, léger et original.
- **Proxy de géocodage côté serveur** : la CSP reste `connect-src 'self'`, l'hôte BAN est
  fixe (pas de SSRF), et le texte saisi n'est pas journalisé.

## Vérifications

```bash
npm run lint && npm run typecheck && npm test   # 125 tests unitaires + intégration (CI)
docker compose up --build                        # API + PostGIS + migration
npm run create-key -- demo                       # clé à coller dans le front
# http://localhost:3000/  (front) et http://localhost:3000/docs (OpenAPI)
```

Tests front notables : `front-contract` (CONFIG ↔ OpenAPI), `front-validate`,
`front-assets` (aucune ressource externe + polices présentes), `front-format`,
`front-geometry`, `geocode-*`.

## Risques résiduels

- **Clé API en clair** dans `localStorage` : compromis assumé pour un usage local ;
  documenté dans l'interface et le README.
- **Rate limiting en mémoire** : mono-instance (cf. README).
- **Tests front** : les fonctions pures, le contrat et les ressources sont testés ;
  les tests d'interface **jsdom** et le script **Playwright `npm run screenshots`**
  ne sont pas encore livrés (voir « Reste à faire »).
- **Polices** : sous-ensemble **latin** uniquement ; des glyphes hors plage (ex. certains
  symboles) retombent sur la pile système — sans impact visuel notable.

## Reste à faire (non bloquant)

- Tests d'interface jsdom (rendu, 400/401/429/500, vide, noms malveillants, champs absents).
- Script `npm run screenshots` (Playwright), hors CI bloquante.
- Accessibilité : audit contrastes AA formel, `aria-live` déjà en place.
- P2 (tendance, filtres, profil véhicule) : **reporté** tant que le backend ne les expose pas.

## Captures à prendre (par vous)

Voir `docs/captures/README.md` : application clair/sombre, mobile, détail, états d'erreur,
panneau d'alertes, et côté chaîne d'agents (liste des agents, hook qui échoue puis réussit,
CI verte).
