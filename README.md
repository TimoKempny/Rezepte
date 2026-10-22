# Rezepte
Private Kochrezepte und Küchentools

Statische Website ohne Build-Schritt: `index.html` im Browser öffnen oder über GitHub Pages veröffentlichen.

- `index.html`: Übersicht mit Suche, Filtern (Kategorie, Kochzeit, Ernährung, Schwierigkeit) und Sortierung
- `planer.html`: Wochenplaner, der nach Kriterien einen Kochplan zusammenstellt
- `rezepte/`: eine HTML-Seite pro Rezept
- `assets/rezepte.js`: zentrale Liste mit den Eckdaten aller Rezepte

## Neues Rezept hinzufügen

1. `rezepte/vorlage.html` kopieren, z. B. nach `rezepte/gulasch.html`, und ausfüllen
2. In `assets/rezepte.js` einen Eintrag mit `seite: "rezepte/gulasch.html"` ergänzen
3. Neue Kategorien bei Bedarf oben in `window.KATEGORIEN` mit einer Tellerfarbe anlegen
