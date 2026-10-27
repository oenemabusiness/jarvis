# Jarvis

Jarvis is mijn persoonlijke AI-assistent voor het runnen van mijn bedrijf. Het idee: één plek die mijn dagelijkse werk overziet en zo veel mogelijk automatiseert, gebouwd op Claude en gekoppeld aan de tools die ik al gebruik.

## Doel

- Overzicht houden over mail, agenda, administratie en verkoop.
- Terugkerend werk automatiseren (mails sorteren, facturen, rapportages).
- Ideeën uit voorbeelden (zoals Instagram-reels) nabouwen met mijn eigen tools.

## Koppelingen

| Tool | Waarvoor |
| --- | --- |
| Gmail | Mail lezen, sorteren en concepten maken |
| Google Agenda | Afspraken en planning |
| Google Drive | Documenten |
| Jortt | Boekhouding, facturen, btw |
| Shopify | Webshop |
| Bol.com (via Rylee) | Verkoop, voorraad en advertenties op Bol |
| Canva | Ontwerpen |

## Wat er al is

Een spraakassistent in de browser, in de stijl van JARVIS uit Iron Man:

- **Praten en luisteren**: wake word "Hé Jarvis" of spatie om te praten (Chrome-spraakherkenning, `nl-NL`), typen met `T`.
- **Antwoorden**: de server stuurt zinnen terug die meteen worden uitgesproken, met meelopende ondertitels. Onderbreken kan met spatie.
- **Persoonlijkheid**: een Britse butler zoals JARVIS uit Iron Man. Hij praat Engels en verstaat Nederlands. Aanpassen kan in `server/prompts/jarvis.md`.
- **Brein**: Claude via de Anthropic API, met keuze tussen Haiku, Sonnet en Opus.
- **Stem**: ElevenLabs als er een sleutel in `.env` staat, anders de macOS-stem "Daniel" (Brits).
- **Extra's**: optioneel zoeken op internet. Gmail en Agenda volgen in fase 3 van het plan.
- **3D-avatar** met Three.js die reageert op luisteren, nadenken en praten.

## Starten op de Mac

1. Installeer [Node.js](https://nodejs.org) (LTS) als je dat nog niet hebt.
2. Dubbelklik `start.command`. De eerste keer maakt hij een `.env`-bestand aan.
3. Zet je `ANTHROPIC_API_KEY` in `.env` (en eventueel `ELEVENLABS_API_KEY`) en dubbelklik opnieuw.
4. Chrome opent op `http://localhost:8765`. Klik om te starten en sta de microfoon toe.

Sleutels staan alleen in `.env`, en dat bestand gaat nooit mee de repo in.

## Structuur

```
jarvis/
├── README.md
├── start.command          – start de server op de Mac (dubbelklikken)
├── package.json
├── .env.example           – voorbeeld voor je sleutels (kopie heet .env)
├── server/
│   ├── server.js          – /api/chat, /api/speak, /api/stop, /api/reset, /api/settings
│   └── prompts/jarvis.md  – de persoonlijkheid van Jarvis
└── web/
    ├── index.html         – interface (spraak, ondertitels, instellingen)
    └── avatar3d.js        – de 3D-avatar (Three.js via CDN)
```

## Sneltoetsen

| Toets | Actie |
| --- | --- |
| Spatie / klik | Praten of onderbreken |
| T | Typen |
| H | Knoppen verbergen |
| S | Instellingen |
| Esc | Stoppen |
