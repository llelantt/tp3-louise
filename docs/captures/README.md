# Captures d'écran

Ce dossier accueille les preuves visuelles du projet (exigées par le sujet).

## À capturer

1. **L'application en marche** (`http://localhost:3000/`) :
   - la recherche de stations les moins chères avec des résultats réels ;
   - le détail d'une station avec la courbe d'historique des prix ;
   - la section alertes avec au moins une alerte et ses événements.
2. **La chaîne d'agents au travail** (OpenCode) :
   - l'agent principal et les subagents (`opencode agent`) ;
   - un run d'ingestion (`npm run ingest`) qui journalise son résultat ;
   - le filet qui tourne : `npm run lint`, `npm run typecheck`, `npm test` verts,
     et le job CI vert sur GitHub.

## Comment obtenir des données

```bash
docker compose up -d db
npm run db:migrate
npm run create-key -- demo      # copier la clé dans le front
npm run ingest                  # remplit la base depuis le flux open data
npm run dev                     # http://localhost:3000
```
