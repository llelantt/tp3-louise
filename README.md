# Carbu API

API d'un SaaS qui trouve les **stations-service les moins chères** autour d'un point GPS en
France, en classant par **coût réel** — prix du plein **plus** coût du détour — et pas
seulement par prix au litre.

Source de données : open data [prix-carburants.gouv.fr](https://www.prix-carburants.gouv.fr/)
via [data.gouv.fr](https://www.data.gouv.fr/) (Licence Ouverte).

## Démarrage rapide (Docker)

```bash
docker compose up --build
```

L'API écoute sur http://localhost:3000, la documentation OpenAPI sur http://localhost:3000/docs.
La migration de base est appliquée automatiquement au démarrage.

## Démarrage local

Prérequis : Node ≥ 22 et un PostgreSQL avec PostGIS. Pour ne démarrer que la base avec
Docker : `docker compose up -d db`.

```bash
cp .env.example .env          # ajustez DATABASE_URL et API_KEY_PEPPER
npm install
npm run db:migrate            # crée les tables et les index PostGIS
npm run dev                   # http://localhost:3000
```

Créez une clé API (elle n'est affichée qu'une fois) :

```bash
npm run create-key -- demo            # clé sans expiration
npm run create-key -- demo --days 90  # clé valable 90 jours
npm run revoke-key -- demo            # révoque par nom (ou par id)
```

## Ingestion des données

Le flux open data (ZIP contenant du XML) est récupéré, décompressé et inséré :

```bash
npm run ingest            # une passe unique
```

En service, le worker d'ingestion tourne en tâche de fond si `INGEST_ENABLED=true`
(intervalle `INGEST_INTERVAL_MINUTES`, 12 min par défaut). Le téléchargement est borné
(`INGEST_MAX_ARCHIVE_BYTES`) et l'archive est protégée contre les zip-bombs ; un flux
indisponible ou corrompu est journalisé sans jamais faire tomber l'API (dernières données
conservées). Les prix non mis à jour depuis `PRICE_STALE_AFTER_DAYS` jours passent en périmé.

## Front

Une interface web est servie par l'API elle-même sur http://localhost:3000/ (aucun build
séparé). Elle permet de :

- renseigner sa clé API (gardée dans le navigateur) ;
- chercher les stations les moins chères autour d'un point (ou de sa position GPS),
  avec carburant, rayon, litres, consommation et tri ;
- ouvrir le détail d'une station (prix par carburant + courbe d'historique) ;
- créer, lister et supprimer ses alertes, et consulter leurs événements.

## Vérifications

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript strict
npm test            # suite complète (Vitest)
```

## Endpoints

Les routes métier sont préfixées `/v1` et exigent une clé API dans l'en-tête `X-API-Key`.
Les sondes et la documentation restent hors préfixe.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/health` | sonde de vie (publique) |
| GET | `/ready` | sonde de disponibilité : base + fraîcheur de la dernière ingestion |
| GET | `/v1/stations/cheapest` | stations classées par coût réel (`truncated`, `data_freshness`) |
| GET | `/v1/stations/:id` | détail d'une station et historique (`history_days`) |
| GET | `/v1/geocode?q=` | géocoder une adresse (proxy serveur vers la Géoplateforme / BAN) |
| POST | `/v1/alerts` | créer une alerte (in-app ou webhook signé) |
| GET | `/v1/alerts` | lister ses alertes |
| DELETE | `/v1/alerts/:id` | supprimer une alerte |
| GET | `/v1/alerts/:id/events` | événements déclenchés par une alerte |
| GET | `/docs` | documentation OpenAPI (Swagger UI, publique) |

Exemple :

```bash
curl -s "localhost:3000/v1/stations/cheapest?lat=48.85&lon=2.35&fuel=gazole&radius_km=5" \
  -H "X-API-Key: <votre-cle>" | jq
```

## Variables d'environnement

Voir `.env.example`. Les principales : `DATABASE_URL`, `API_KEY_PEPPER`, `PORT`, `HOST`,
`CORS_ORIGINS`, `TRUST_PROXY`, `DOCS_ENABLED`, `RATE_LIMIT_MAX`, `BODY_LIMIT_BYTES`,
`REQUEST_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, `MAX_ALERTS_PER_KEY`, `WEBHOOK_*`,
`INGEST_*`, `PRICE_STALE_AFTER_DAYS`.

- `DOCS_ENABLED` : `true` pour la démo ; `false` est **recommandé en production** (Swagger
  UI est un outil de développement).
- `TRUST_PROXY` : `false` par défaut. À n'activer que derrière un proxy maîtrisé ; un
  réglage trop large (`true`) permet de **falsifier `X-Forwarded-For`** et donc le rate
  limiting par IP. Préférez un nombre de sauts ou une liste de proxys.
- `WEBHOOK_ALLOW_PRIVATE` : laisser `false` ; `true` (tests uniquement) autorise http et
  les adresses privées/loopback pour les webhooks.
- `GEOCODE_*` : le géocodage d'adresses passe par un **proxy serveur** vers la
  Géoplateforme (`data.geopf.fr/geocodage`, source BAN — Licence Ouverte). L'hôte est
  fixe, le texte est nettoyé (3–200 car.), 5 résultats max, cache LRU borné et limite par
  clé plus basse (`GEOCODE_RATE_LIMIT_PER_MIN`). Aucun texte saisi n'est journalisé.

## Limites connues

- Le rate limiting par clé est **en mémoire** : correct en mono-instance, à remplacer par un
  backend partagé (Redis) en multi-instance.
- L'anti-SSRF des webhooks résout le DNS puis se connecte à l'IP résolue ; le rebinding DNS
  reste un risque théorique, atténué par l'absence de suivi de redirection.
- L'historique des prix n'est pas encore purgé (politique de rétention à venir).

## La chaîne d'agents OpenCode

Ce dépôt embarque un harness OpenCode complet (livrable du TP) :

- `.opencode/agent/` : un agent principal `architect` et huit subagents aux rôles nets
  (`finder`, `explorer`, `planner`, `dev`, `dba`, `reviewer`, `security`, `tester`), chacun
  avec des droits minimaux.
- `AGENTS.md` et `src/ingestion/AGENTS.md` : les règles du dépôt.
- `.opencode/plugins/checks.js` : relance typecheck + lint + tests après chaque écriture.
- `.husky/pre-commit` : mêmes checks avant chaque commit.
- `.github/workflows/ci.yml` : lint, typecheck, build, migrations et tests en CI.

`opencode agent` liste les agents disponibles.

## Structure

```
src/
  app.ts, server.ts, config.ts     # bootstrap Fastify + validation d'env (Zod)
  db/                              # schéma Drizzle, client, migrations
  modules/{stations,alerts,auth}/  # routes, services, repositories
  ingestion/                       # job de récupération du flux open data
  lib/                             # coût, géo, erreurs, logger, clés API
public/                            # front (HTML/CSS/JS servi par l'API)
drizzle/                           # migrations SQL générées (PostGIS)
test/{unit,integration}/           # Vitest
docs/captures/                     # captures d'écran (app + chaîne d'agents)
```
