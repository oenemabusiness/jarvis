#!/bin/bash
# Dubbelklik om JARVIS te starten op de Mac.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js ontbreekt. Installeer het via https://nodejs.org (LTS) en probeer opnieuw."
  read -n 1 -s -r -p "Druk op een toets om te sluiten"; exit 1
fi
[ -f .env ] || cp .env.example .env
# nog geen Claude-sleutel ingevuld: open het bestand zodat je hem kunt plakken
if ! grep -qE '^ANTHROPIC_API_KEY=.+' .env; then
  echo "Plak je Claude-sleutel achter ANTHROPIC_API_KEY=, sla op (Cmd+S) en dubbelklik start.command opnieuw."
  open -e .env; exit 0
fi
[ -d node_modules ] || npm install
PORT=$(grep -E '^PORT=' .env | cut -d= -f2); PORT=${PORT:-8765}
( sleep 1.5; open -a "Google Chrome" "http://localhost:$PORT" 2>/dev/null || open "http://localhost:$PORT" ) &
node server/server.js
