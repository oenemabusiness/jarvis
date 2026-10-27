#!/bin/bash
# Dubbelklik om JARVIS te starten op de Mac.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js ontbreekt. Installeer het via https://nodejs.org (LTS) en probeer opnieuw."
  read -n 1 -s -r -p "Druk op een toets om te sluiten"; exit 1
fi
[ -f .env ] || { cp .env.example .env; echo "Nieuw .env-bestand gemaakt. Vul je ANTHROPIC_API_KEY in en start opnieuw."; open -e .env; exit 0; }
[ -d node_modules ] || npm install
PORT=$(grep -E '^PORT=' .env | cut -d= -f2); PORT=${PORT:-8765}
( sleep 1.5; open -a "Google Chrome" "http://localhost:$PORT" 2>/dev/null || open "http://localhost:$PORT" ) &
node server/server.js
