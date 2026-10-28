# Reinigungs- und Wartungsliste

Statische Web-App: Editor und DIN-A4-Druckvorschau für Reinigungs- und Wartungsaufgaben.

## Zweck

- Aufgaben und Stationen bearbeiten (inkl. Warnhinweise und Erledigt-Status)
- Live-Vorschau einer DIN-A4-Seite
- Drucken bzw. als PDF speichern (eine Seite)
- Zustand im Browser speichern (`localStorage`, versioniert)
- JSON-Export und -Import

## Nutzung

1. `index.html` im Browser öffnen (oder nach Deployment die GitHub-Pages-URL).
2. Links Daten bearbeiten, rechts die Druckvorschau prüfen.
3. „Drucken / Als PDF speichern“ nutzen.
4. Unter Tab **2. Kopf- & Fußzeile** JSON exportieren/importieren.
5. Zustand wird automatisch lokal gespeichert.

Alle Asset-Pfade sind relativ – die Seite funktioniert auch in einem GitHub-Pages-Unterpfad.

## Lokale Entwicklung

Voraussetzungen: Node.js 18+ und npm.

```bash
npm install
npm run watch:css
```

Statischen Server (beliebig), z. B.:

```bash
npx serve .
# oder: python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen. Ohne laufenden Build funktioniert die Seite trotzdem, solange das committed `assets/css/tailwind.css` aktuell ist.

## Build

```bash
npm install
npm run build
```

Erzeugt/aktualisiert `assets/css/tailwind.css` (minifiziert) aus Tailwind CLI 3.4.x – gleiche Major-/Patch-Linie wie das frühere Play-CDN.

## Tests

```bash
npm test
```

Prüft per Playwright: keine Console-Errors, `localStorage`-Persistenz, JSON-Export/Import-Roundtrip.

## Deployment auf GitHub Pages

1. Repository auf GitHub anlegen und diesen Ordner als Inhalt pushen.
2. Unter **Settings → Pages** als Source **GitHub Actions** wählen.
3. Der Workflow `.github/workflows/pages.yml` baut bei Push auf `main` das CSS und deployed das Verzeichnis.

Optional: Repository-Name als Project-Pages-URL (`https://<user>.github.io/<repo>/`) – relative Pfade und Service Worker (`scope: ./`) sind darauf ausgelegt.

## Technik

- HTML/CSS/JS ohne Framework
- Tailwind CSS 3.4 (gebaut, kein Play-CDN)
- Font Awesome 6.4 lokal (CSS + Webfonts)
- Optional: Web-App-Manifest + einfacher Service Worker
