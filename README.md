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

Prérequis : Node ≥ 22 et un PostgreSQL avec PostGIS (le `docker compose` ci-dessous n'en
démarre qu'un seul est possible : `docker compose up -d db`).

```bash
cp .env.example .env          # ajustez DATABASE_URL et API_KEY_PEPPER
npm install
npm run db:migrate            # crée les tables et les index PostGIS
npm run dev                   # http://localhost:3000
```

Créez une clé API (elle n'est affichée qu'une fois) :

```bash
npm run create-key -- demo
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

## Vérifications

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript strict
npm test            # suite complète (Vitest)
```

## Endpoints

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/health` | sonde de vie |
| GET | `/stations/cheapest` | stations classées par coût réel |
| GET | `/stations/:id` | détail d'une station et historique des prix |
| GET/POST/DELETE | `/alerts` | alertes de prix |
| GET | `/docs` | documentation OpenAPI (Swagger UI) |

> Les endpoints métier arrivent progressivement ; `/health` et `/docs` sont disponibles dès
> le squelette. Voir `AGENTS.md` pour les conventions et `.opencode/plans/` pour les plans
> en cours.

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
drizzle/                           # migrations SQL générées (PostGIS)
test/{unit,integration}/           # Vitest
docs/captures/                     # captures d'écran (app + chaîne d'agents)
```
