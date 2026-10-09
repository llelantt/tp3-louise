# carbu-api — conventions du dépôt

API d'un SaaS qui trouve les stations-service les moins chères autour d'un point GPS,
en classant par **coût réel** (prix du plein + coût du détour), pas seulement par prix au litre.
Source : open data `prix-carburants.gouv.fr` / `data.gouv.fr` (Licence Ouverte).

## Commandes

| Commande | Ce qu'elle fait |
|---|---|
| `npm install` | installe les dépendances |
| `npm run dev` | démarre l'API en watch (http://localhost:3000, doc sur `/docs`) |
| `npm start` | démarre l'API une fois |
| `npm run build` | compile dans `dist/` |
| `npm test` | lance toute la suite — **à lancer avant tout commit** |
| `npm run test:unit` | tests unitaires uniquement (sans base) |
| `npm run test:integration` | tests d'intégration (PostgreSQL/PostGIS requis) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript en mode strict |
| `npm run db:generate` | génère une migration Drizzle depuis `src/db/schema.ts` |
| `npm run db:migrate` | applique les migrations |
| `npm run ingest` | lance une passe d'ingestion du flux open data |
| `npm run create-key -- <nom>` | génère une clé API et stocke son empreinte |

## Conventions

1. **TypeScript strict**, ESM. Les imports relatifs portent l'extension `.js`
   (`import { x } from "./x.js"`), même en `.ts`.
2. **Toute entrée externe est validée par Zod.** Paramètres de requête, corps, variables
   d'environnement : un schéma Zod, jamais une lecture brute de `req.query`.
3. **Les erreurs remontent en `AppError`** (et ses sous-classes `ValidationError`,
   `UnauthorizedError`, `NotFoundError`, `RateLimitError`, `UpstreamError`), rattrapées au
   seul point : le gestionnaire d'erreurs Fastify de `src/app.ts`. Pas d'erreur ad hoc, pas
   de `res.status(400)` dispersé dans un handler.
4. **`src/db/schema.ts` est la source de vérité du schéma.** Les migrations sont générées
   par `drizzle-kit generate` puis **seule modification autorisée** : ajouter les
   `CREATE EXTENSION` en tête. On ne réécrit pas le SQL généré à la main.
5. **Le calcul métier est pur et testé à part.** La formule de coût vit dans
   `src/lib/cost.ts`, sans accès base ni HTTP.
6. **Un module par responsabilité dans `src/lib/`.** Pas de `utils.ts`, pas de fourre-tout.
7. **Toute fonction exportée porte une JSDoc d'une ligne** qui dit *ce que* fait la
   fonction, pas *comment*.
8. Les dates circulent en **ISO 8601 UTC, en `string`** à la frontière HTTP, jamais en
   `Date` exposée au client.
9. **La source open data est mentionnée** dans les réponses concernées et dans la doc.
10. Jamais de secret loggé : le logger de `src/lib/logger.ts` redige `x-api-key` et
    `authorization`.

## Ce qu'il ne faut pas faire

- Ne pas ajouter de dépendance sans en parler.
- Ne pas commiter directement dans `main` : passer par une branche et une PR.
- Ne pas contourner la validation Zod, même « pour aller plus vite ».
- Ne pas faire confiance au flux distant : un flux indisponible ou corrompu ne doit
  jamais faire tomber l'API (voir `src/ingestion/AGENTS.md`).
- Ne pas éditer `drizzle/meta/**` à la main.
