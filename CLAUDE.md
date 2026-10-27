# Rezepte-Website

Statische Seite (HTML/CSS/JS ohne Build), deployt über GitHub Pages von `main`. Sprache der Seite und des Codes: Deutsch.

## Regeln für neue Rezepte

Jedes Rezept wird nach `rezepte/vorlage.html` gebaut und muss enthalten:

- **Portionsrechner**: `<div class="portionen" data-basis="N">` mit +/−-Knöpfen und `<script src="../assets/rezept.js">`.
  Jede Menge als `<b data-menge="…" data-einheit="…">`, damit sie umgerechnet wird. Zählbare Zutaten ohne Einheit
  bekommen `<span data-einzahl="…" data-mehrzahl="…">`. Zutaten ohne Menge (Salz, Pfeffer) haben ein leeres `<b></b>`.
- **Foto in zwei Versionen**: `assets/bilder/<id>.jpg` quadratisch ca. 720 × 720 (Teller in Übersicht/Planer) und
  `assets/bilder/<id>-breit.jpg` 16:9 ca. 1800 × 1012, JPEG Qualität ~75 (scharfer Hintergrund im Kopfbereich der
  Rezeptseite, kein runder Teller dort). Fremde Fotos nur mit freier Lizenz und Eintrag in `bildnachweise.html`.
- **Eintrag in `assets/rezepte.js`** mit `id`, `titel`, `seite`, `bild`, `kategorie`, `zeit`, `schwierigkeit`,
  `ernaehrung`, `portionen`, `beschreibung`, `hinzugefuegt`, optional `zweiTage: true` (lässt sich gut aufwärmen,
  der Wochenplaner bevorzugt es für Reste). Übersicht und Wochenplaner lesen nur diese Liste.
- **`zutaten`** im selben Eintrag (außer bei Getränken und Teigen & Grundrezepten): Schlüssel aus `window.ZUTATEN`
  (Katalog oben in `assets/rezepte.js`) für „Was hab ich da?“ auf der Übersicht. Nur Hauptzutaten, keine Gewürze,
  kein Salz/Pfeffer/Wasser, keine Garnitur oder frischen Kräuter. Fehlt eine Zutat im Katalog, dort ergänzen.
- Kopfzeile mit Logo (Inline-SVG `marke-logo`, wie das Favicon) und Themen-Umschalter (`thema.js` im `<head>`, Knopf in der Navigation rechts neben "Kaffee"),
  Favicon-Links und Fußzeile wie in den bestehenden Seiten.
- Kopfbereich `rezept-buehne` mit dem breiten Foto als Hintergrund (`buehne-bild`) hinter Titel und Beschreibung.

## Kaffee

`kaffee.html` liest `assets/kaffee.json` (Fotos in `assets/bilder/kaffee/`). Neue Einträge schreibt die Seite selbst
über die GitHub-Contents-API (Fine-grained Token im `localStorage`, Schlüssel `github-token`); die Datei nicht von Hand
umformatieren. Tasting-Profil nach SCA-Cupping-Formular (sechs Werte 1–5), Geschmacksnoten nach den Hauptgruppen des
SCA Flavor Wheel, beides in `assets/kaffee.js` (`PROFIL`, `NOTEN`).

## Cache

GitHub Pages lässt Dateien 10 Minuten im Browser-Cache. CSS/JS werden mit `?v=N` eingebunden: Nach jeder Änderung
an `assets/*.css` oder `assets/*.js` die Zahl in allen HTML-Dateien erhöhen (aktuell `v=26`).

## Gestaltung

Emaille-Teller als Leitmotiv (Rand in der Hauptfarbe, Foto oder Kategorie-Farbe in der Mitte). Farben nur über die
Tokens in `assets/style.css`, nie direkt im Code. Rollen:

- `--haupt` Flächen (Tellerrand, Knöpfe, aktive Filter, Teaser), Schrift darauf `--auf-haupt`
- `--haupt-text` Links, Mengen, Fokus (lesbare Variante der Hauptfarbe), `--haupt-hell` dezente Hover-Flächen
- `--akzent` / `--akzent-tief` / `--akzent-hell` festgehaltene Tage, Tipps

Palette (vom Nutzer vorgegeben): Hell Hauptfarbe `#FEE0CE`, Akzent `#CEFEE0`; Dunkel Hauptfarbe `#404040`,
Akzent `#B9CD8A` (im Dunkel-Design ist der Akzent zugleich `--haupt-text`). Das dunkle Design ist zweimal definiert
(Systemeinstellung und `data-theme="dark"`), der Druck setzt die hellen Werte; Änderungen in allen drei Blöcken
nachziehen und Kontrast für Schrift ≥ 4,5:1 prüfen.
