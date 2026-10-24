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
- **Brein**: Claude Code op de Mac, met keuze tussen Haiku, Sonnet en Opus.
- **Extra's**: optioneel zoeken op internet en Gmail (lezen + concepten).
- **3D-avatar** met Three.js die reageert op luisteren, nadenken en praten.

## Structuur

```
jarvis/
├── README.md
└── web/
    └── index.html     – interface (spraak, ondertitels, instellingen)
```

### Nog toe te voegen

De interface verwijst naar bestanden die nog niet in de repo staan:

- `web/avatar3d.js` – de 3D-avatar
- `web/lib/three/` – Three.js (kan ook van een CDN komen)
- de server met de endpoints `/api/chat`, `/api/speak`, `/api/stop`, `/api/reset` en `/api/settings`
- `start.command` – start de server op de Mac

## Sneltoetsen

| Toets | Actie |
| --- | --- |
| Spatie / klik | Praten of onderbreken |
| T | Typen |
| H | Knoppen verbergen |
| S | Instellingen |
| Esc | Stoppen |
