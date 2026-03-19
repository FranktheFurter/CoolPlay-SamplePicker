# Sample Picker MVP

![Screenshot der App](output/chrome-mcp/readme-app-preview.png)

Kleiner lokaler Prototyp fuer eine browserbasierte Sample-Browsing-App.

## Setup

1. `npm install`
2. `npm run dev`
3. Die angezeigte lokale URL in Chrome oder Edge oeffnen
4. `Ordner auswaehlen` klicken und den Sample-Ordner freigeben

## Hinweise

- Die App nutzt die File System Access API und ist fuer aktuelle Desktop-Versionen von Chrome oder Edge gedacht.
- Der Index und die gemerkten Samples werden in IndexedDB im Browser gespeichert.
- `Ordner aktualisieren` scannt den zuletzt ausgewaehlten Ordner erneut.
- Es werden nur `.wav`-Dateien indexiert.

## GitHub Pages Deployment

- Das Repository ist fuer GitHub Pages per GitHub Action vorbereitet.
- In GitHub unter `Settings -> Pages` als Quelle `GitHub Actions` auswaehlen.
- Danach deployed jeder Push auf `main` automatisch die statische Seite.
- Fuer dieses Repository wird die App unter `https://frankthefurter.github.io/CoolPlay-SamplePicker/` erwartet, solange der Repository-Name gleich bleibt.
