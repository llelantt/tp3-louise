---
description: Livre le travail en cours (checks, commit, branche, PR).
agent: architect
---

Le travail est terminé. Livre-le, sans poser de question :

1. `npm run lint && npm run typecheck && npm test` — tout doit être vert. Si un check est
   rouge, on ne livre pas : on renvoie vers `dev`.
2. `git add` uniquement les fichiers du travail (jamais `git add -A` aveugle), puis
   `git commit -m "feat: <résumé en une ligne de ce qui a changé>"`.
3. `git push` vers la branche courante et ouverture d'une PR — **jamais** de push direct
   vers `main` (cf. `AGENTS.md`).

Ne saute pas l'étape 1 sous prétexte que le hook post-écriture « s'en est déjà occupé » :
le hook avertit à chaque écriture, mais seule une passe complète des checks juste avant de
livrer prouve que l'ensemble est vert.
