# Captures d'écran

Ce dossier accueille les preuves visuelles du projet (exigées par le sujet). Les captures
de l'application peuvent être générées par `npm run screenshots` (à venir) ou prises à la
main ; celles de la chaîne d'agents sont à prendre par vous-même.

## À capturer — application (http://localhost:3000/)

1. Écran principal, **thème clair** (recherche + plan + liste classée).
2. Écran principal, **thème sombre**.
3. Vue **mobile** (plan au-dessus de la liste).
4. **Détail** d'une station avec la courbe d'historique.
5. États d'erreur : **401** (clé absente), **429** (compte à rebours), **aucun résultat**.
6. Panneau **alertes** (création + événements).

## À capturer — chaîne d'agents (OpenCode)

7. La liste des agents (`opencode agent`).
8. Un **hook qui échoue puis réussit** (plugin `checks.js` / husky) sur un fichier témoin.
9. La **CI verte** sur GitHub (onglet Actions).
10. Un run d'ingestion (`npm run ingest`) qui journalise son résultat.

## Préparer des données

```bash
docker compose up -d db
npm run db:migrate
npm run create-key -- demo      # copier la clé dans le front
npm run ingest                  # remplit la base depuis le flux open data
npm run dev                     # http://localhost:3000
```
