# Rezepte
Private Kochrezepte und Küchentools

Statische Website ohne Build-Schritt, veröffentlicht über GitHub Pages: https://timokempny.github.io/Rezepte/

- `index.html`: Übersicht mit Suche, Filtern (Kategorie, Kochzeit, Ernährung, Schwierigkeit) und Sortierung
- `planer.html`: Wochenplaner, der nach Kriterien einen Kochplan zusammenstellt
- `rezepte/`: eine HTML-Seite pro Rezept, mit Portionsrechner
- `assets/rezepte.js`: zentrale Liste mit den Eckdaten aller Rezepte
- `assets/bilder/`: Fotos (Nachweise in `bildnachweise.html`)

## Neues Rezept hinzufügen

1. `rezepte/vorlage.html` kopieren, z. B. nach `rezepte/gulasch.html`, und ausfüllen (Anleitung steht oben in der Datei)
2. Foto quadratisch (ca. 720 × 720 px) als `assets/bilder/gulasch.jpg` ablegen
3. In `assets/rezepte.js` einen Eintrag mit `seite: "rezepte/gulasch.html"` und `bild: "assets/bilder/gulasch.jpg"` ergänzen
4. Neue Kategorien bei Bedarf oben in `window.KATEGORIEN` mit einer Tellerfarbe anlegen
5. Fremde Fotos mit Quelle und Lizenz in `bildnachweise.html` eintragen
