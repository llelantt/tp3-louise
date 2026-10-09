#!/usr/bin/env bash
# Checks post-ecriture. Declenche par .opencode/plugins/checks.js, et utilisable
# a la main ou en CI (ubuntu).
# Objectif : voir le resultat des checks sans qu'on ait a le demander.
set +e
status=0

echo "--- typecheck"
npm run --silent typecheck || status=1
echo "--- lint"
npm run --silent lint || status=1
echo "--- tests"
npm run --silent test:unit || status=1

if [ "$status" -ne 0 ]; then
  echo "--- au moins un check est rouge (voir plus haut)"
fi

# Un check rouge interrompt l'agent : un filet qui n'arrete personne ne protege
# de rien. L'agent corrige puis rejoue.
exit "$status"
