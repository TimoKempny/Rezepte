# Rezepte-Website

Statische Seite (HTML/CSS/JS ohne Build), deployt über GitHub Pages von `main`. Sprache der Seite und des Codes: Deutsch.

## Regeln für neue Rezepte

Jedes Rezept wird nach `rezepte/vorlage.html` gebaut und muss enthalten:

- **Portionsrechner**: `<div class="portionen" data-basis="N">` mit +/−-Knöpfen und `<script src="../assets/rezept.js">`.
  Jede Menge als `<b data-menge="…" data-einheit="…">`, damit sie umgerechnet wird. Zählbare Zutaten ohne Einheit
  bekommen `<span data-einzahl="…" data-mehrzahl="…">`. Zutaten ohne Menge (Salz, Pfeffer) haben ein leeres `<b></b>`.
- **Foto**: quadratisch zugeschnitten, ca. 720 × 720, JPEG Qualität ~80, unter `assets/bilder/<id>.jpg`; im Kopf als
  `teller mit-bild`. Fremde Fotos nur mit freier Lizenz und Eintrag in `bildnachweise.html`.
- **Eintrag in `assets/rezepte.js`** mit `id`, `titel`, `seite`, `bild`, `kategorie`, `zeit`, `schwierigkeit`,
  `ernaehrung`, `portionen`, `beschreibung`, `hinzugefuegt`. Übersicht und Wochenplaner lesen nur diese Liste.
- Kopfzeile mit Themen-Umschalter (`thema.js` im `<head>`, Knopf in der Navigation rechts neben "Wochenplaner"),
  Favicon-Links und Fußzeile wie in den bestehenden Seiten.
- Kopfbereich `rezept-buehne` mit dem Foto als unscharfem Hintergrund (`buehne-bild`) hinter Titel und Beschreibung.

## Cache

GitHub Pages lässt Dateien 10 Minuten im Browser-Cache. CSS/JS werden mit `?v=N` eingebunden: Nach jeder Änderung
an `assets/*.css` oder `assets/*.js` die Zahl in allen HTML-Dateien erhöhen (aktuell `v=2`).

## Gestaltung

Emaille-Teller als Leitmotiv (kobaltblauer Rand, Foto oder Kategorie-Farbe in der Mitte). Farben nur über die Tokens
in `assets/style.css`; das dunkle Design ist zweimal definiert (Systemeinstellung und `data-theme="dark"`), Änderungen
an Tokens in beiden Blöcken nachziehen.
