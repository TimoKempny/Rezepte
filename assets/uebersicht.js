// Startseite: Tagesvorschlag, Suche, Filter und Sortierung

const rezepte = window.REZEPTE;
const MAX_ZEIT = 180;

const standard = { suche: "", kategorie: "alle", zeit: MAX_ZEIT, ernaehrung: "alle", schwierigkeit: "alle", sortierung: "neu" };
const zustand = { ...standard };

const el = {
  suche: document.getElementById("suche"),
  kategorien: document.getElementById("kategorien"),
  zeit: document.getElementById("zeit"),
  zeitWert: document.getElementById("zeit-wert"),
  ernaehrung: document.getElementById("ernaehrung"),
  schwierigkeit: document.getElementById("schwierigkeit"),
  sortierung: document.getElementById("sortierung"),
  anzahl: document.getElementById("anzahl"),
  zuruecksetzen: document.getElementById("zuruecksetzen"),
  raster: document.getElementById("raster"),
  leer: document.getElementById("leer"),
  vorschlag: document.getElementById("vorschlag"),
  heroText: document.getElementById("hero-text"),
};

// ---------- Tagesvorschlag ----------

let letzterVorschlag = null;

function zeigeVorschlag(animieren) {
  const auswahl = rezepte.filter((r) => r.id !== letzterVorschlag);
  const r = zufall(auswahl.length ? auswahl : rezepte);
  letzterVorschlag = r.id;
  el.vorschlag.innerHTML = `
    <a href="${esc(r.seite)}" tabindex="-1" aria-hidden="true">${tellerHTML(r, animieren ? "dreht" : "")}</a>
    <div class="vorschlag-text">
      <p class="vorschlag-label">Vorschlag für heute</p>
      <h2><a href="${esc(r.seite)}">${esc(r.titel)}</a></h2>
      <p class="vorschlag-info">${formatZeit(r.zeit)}, ${esc(r.schwierigkeit)}</p>
      <button type="button" class="knopf zweit klein" id="neuer-vorschlag">Anderer Vorschlag</button>
    </div>`;
  document.getElementById("neuer-vorschlag").addEventListener("click", () => zeigeVorschlag(true));
}

// ---------- Filter ----------

function kategorienAufbauen() {
  const vorhanden = Object.keys(window.KATEGORIEN).filter((k) => rezepte.some((r) => r.kategorie === k));
  const knoepfe = [`<button type="button" class="chip ohne-punkt" data-wert="alle">Alle</button>`]
    .concat(vorhanden.map((k) =>
      `<button type="button" class="chip" data-wert="${esc(k)}" style="--punkt:${window.KATEGORIEN[k]}">${esc(k)}</button>`));
  el.kategorien.innerHTML = knoepfe.join("");
}

function passt(r) {
  if (zustand.kategorie !== "alle" && r.kategorie !== zustand.kategorie) return false;
  if (r.zeit > zustand.zeit && zustand.zeit < MAX_ZEIT) return false;
  if (zustand.ernaehrung === "vegetarisch" && !istFleischfrei(r)) return false;
  if (zustand.ernaehrung === "vegan" && r.ernaehrung !== "vegan") return false;
  if (zustand.schwierigkeit !== "alle" &&
      SCHWIERIGKEITEN.indexOf(r.schwierigkeit) > SCHWIERIGKEITEN.indexOf(zustand.schwierigkeit)) return false;
  if (zustand.suche) {
    const heuhaufen = `${r.titel} ${r.beschreibung} ${r.kategorie}`.toLowerCase();
    if (!zustand.suche.toLowerCase().split(/\s+/).every((wort) => heuhaufen.includes(wort))) return false;
  }
  return true;
}

const sortierer = {
  "neu": (a, b) => b.hinzugefuegt.localeCompare(a.hinzugefuegt),
  "zeit-auf": (a, b) => a.zeit - b.zeit,
  "zeit-ab": (a, b) => b.zeit - a.zeit,
  "name": (a, b) => a.titel.localeCompare(b.titel, "de"),
};

function karteHTML(r) {
  const merkmale = [`<li>${formatZeit(r.zeit)}</li>`, `<li>${esc(r.schwierigkeit)}</li>`];
  if (istFleischfrei(r)) merkmale.push(`<li class="gruen">${esc(r.ernaehrung)}</li>`);
  return `<li>
    <a class="rezept-karte" href="${esc(r.seite)}">
      ${tellerHTML(r)}
      <h3>${esc(r.titel)}</h3>
      <p>${esc(r.beschreibung)}</p>
      <ul class="merkmale">${merkmale.join("")}</ul>
    </a>
  </li>`;
}

function anzeigen() {
  const treffer = rezepte.filter(passt).sort(sortierer[zustand.sortierung]);
  el.raster.innerHTML = treffer.map(karteHTML).join("");
  el.leer.hidden = treffer.length > 0;
  el.raster.hidden = treffer.length === 0;

  el.anzahl.innerHTML = treffer.length === rezepte.length
    ? `<strong>${rezepte.length}</strong> Rezepte`
    : `<strong>${treffer.length}</strong> von ${rezepte.length} Rezepten`;

  el.zeitWert.textContent = zustand.zeit >= MAX_ZEIT ? "beliebig" : formatZeit(zustand.zeit);

  for (const knopf of el.kategorien.children) {
    knopf.setAttribute("aria-pressed", String(knopf.dataset.wert === zustand.kategorie));
  }
  for (const knopf of el.ernaehrung.children) {
    knopf.setAttribute("aria-pressed", String(knopf.dataset.wert === zustand.ernaehrung));
  }

  const gefiltert = ["suche", "kategorie", "zeit", "ernaehrung", "schwierigkeit"].some((k) => zustand[k] !== standard[k]);
  el.zuruecksetzen.hidden = !gefiltert;
}

function zuruecksetzen() {
  Object.assign(zustand, standard, { sortierung: zustand.sortierung });
  el.suche.value = "";
  el.zeit.value = MAX_ZEIT;
  el.schwierigkeit.value = "alle";
  anzeigen();
}

// ---------- Ereignisse ----------

el.suche.addEventListener("input", () => { zustand.suche = el.suche.value.trim(); anzeigen(); });
el.zeit.addEventListener("input", () => { zustand.zeit = Number(el.zeit.value); anzeigen(); });
el.schwierigkeit.addEventListener("change", () => { zustand.schwierigkeit = el.schwierigkeit.value; anzeigen(); });
el.sortierung.addEventListener("change", () => { zustand.sortierung = el.sortierung.value; anzeigen(); });
el.kategorien.addEventListener("click", (e) => {
  const knopf = e.target.closest("button");
  if (knopf) { zustand.kategorie = knopf.dataset.wert; anzeigen(); }
});
el.ernaehrung.addEventListener("click", (e) => {
  const knopf = e.target.closest("button");
  if (knopf) { zustand.ernaehrung = knopf.dataset.wert; anzeigen(); }
});
el.zuruecksetzen.addEventListener("click", zuruecksetzen);
document.getElementById("leer-zuruecksetzen").addEventListener("click", zuruecksetzen);

el.heroText.textContent = `${rezepte.length} erprobte Rezepte aus unserer Küche. Filtere nach Zeit, Kategorie und Ernährung oder lass dir eins vorschlagen.`;
kategorienAufbauen();
zeigeVorschlag(true);
anzeigen();
