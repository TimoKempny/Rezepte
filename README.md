# Rezepte
Private Kochrezepte und Küchentools

Statische Website ohne Build-Schritt, veröffentlicht über GitHub Pages: https://timokempny.github.io/Rezepte/

- `index.html`: Übersicht mit Suche, Filtern (Kategorie, Kochzeit, Ernährung, Schwierigkeit), Sortierung,
  „Was koche ich heute?“ / „Was backe ich heute?“ und „Was hab ich da?“ (Zutaten ankreuzen, passende Rezepte finden)
- `planer.html`: Wochenplaner, der nach Kriterien einen Kochplan zusammenstellt, mit Reste-Tagen, Einkaufsliste,
  Teilen und Druck/PDF
- `einkaufsliste.html`: gemeinsame Einkaufsliste für alle Geräte (Firebase Firestore, Live-Abgleich, offline nutzbar).
  Zugang über einen geheimen Link („Liste teilen“), Zutaten lassen sich aus dem Wochenplaner übernehmen
- `kaffee.html`: getrunkene Kaffees mit Bewertung, Tasting-Profil, Preis pro kg/500 g/250 g/125 g, Foto, Laden und Kaufdatum.
  Eintragen direkt auf der Seite, einmalig mit GitHub-Token (Fine-grained, nur dieses Repo, Contents: Read and write)
- `rezepte/`: eine HTML-Seite pro Rezept, mit Portionsrechner
- `assets/rezepte.js`: zentrale Liste mit den Eckdaten aller Rezepte, Kategorien und dem Zutatenkatalog
- `assets/bilder/`: Fotos (Nachweise in `bildnachweise.html`)

## Als App installieren

Die Seite ist eine Web-App (`manifest.webmanifest`, `sw.js`) und funktioniert offline mit allen Seiten, die auf dem
Gerät schon einmal geöffnet wurden.

- Android (Chrome): Menü ⋮ → „App installieren“
- iPhone (Safari): Teilen → „Zum Home-Bildschirm“

## Neues Rezept hinzufügen

1. `rezepte/vorlage.html` kopieren, z. B. nach `rezepte/gulasch.html`, und ausfüllen (Anleitung steht oben in der Datei)
2. Foto in zwei Versionen ablegen: quadratisch ca. 720 × 720 px als `assets/bilder/gulasch.jpg` und 16:9 ca. 1800 × 1012 px
   als `assets/bilder/gulasch-breit.jpg` (Hintergrund im Kopfbereich der Rezeptseite)
3. In `assets/rezepte.js` einen Eintrag mit `seite: "rezepte/gulasch.html"`, `bild: "assets/bilder/gulasch.jpg"` und den
   Hauptzutaten unter `zutaten` (Schlüssel aus `window.ZUTATEN`) ergänzen
4. Neue Kategorien bei Bedarf oben in `window.KATEGORIEN` mit einer Tellerfarbe anlegen
5. Fremde Fotos nur mit freier Lizenz verwenden und mit Quelle und Lizenz in `bildnachweise.html` eintragen

Nach Änderungen an `assets/*.css` oder `assets/*.js` die Versionsnummer `?v=N` in allen HTML-Dateien erhöhen
(Browser-Cache von GitHub Pages). Weitere Regeln für Gestaltung und Aufbau stehen in `CLAUDE.md`.

## Einkaufsliste einrichten (Firebase)

Die Zugangsdaten des Firebase-Projekts stehen in `assets/einkauf.js` (öffentlich, das ist bei Firebase so vorgesehen).
Geschützt wird die Liste durch die Regeln in `firestore.rules`: Nach jeder Änderung dort den Inhalt in der
Firebase-Konsole unter Firestore → Regeln einfügen und veröffentlichen.
