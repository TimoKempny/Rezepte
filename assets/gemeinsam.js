// Hilfsfunktionen für Übersicht und Wochenplaner

const SCHWIERIGKEITEN = ["leicht", "mittel", "aufwendig"];

function esc(text) {
  return String(text).replace(/[&<>"']/g, (z) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[z]);
}

function formatZeit(minuten) {
  if (minuten < 60) return `${minuten} Min.`;
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

function istFleischfrei(rezept) {
  return rezept.ernaehrung === "vegan" || rezept.ernaehrung === "vegetarisch";
}

// Emaille-Teller: Foto in der Mitte, ohne Foto die Kategorie-Farbe mit Anfangsbuchstabe
function tellerHTML(rezept, extraKlasse = "") {
  if (rezept.bild) {
    return `<div class="teller mit-bild ${extraKlasse}" aria-hidden="true">
      <img src="${esc(rezept.bild)}" alt="" loading="lazy" width="720" height="720">
    </div>`;
  }
  const farbe = window.KATEGORIEN[rezept.kategorie] || "#9AA3B5";
  return `<div class="teller ${extraKlasse}" style="--speise:${farbe}" aria-hidden="true">
    <span>${esc(rezept.titel.charAt(0))}</span>
  </div>`;
}

function zufall(liste) {
  return liste[Math.floor(Math.random() * liste.length)];
}

function speicherLesen(schluessel) {
  try {
    return JSON.parse(localStorage.getItem(schluessel));
  } catch {
    return null;
  }
}

function speicherSchreiben(schluessel, wert) {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
  } catch {
    // Ohne Speicher funktioniert die Seite trotzdem, nur ohne Erinnerung
  }
}
