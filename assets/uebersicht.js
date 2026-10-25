// Startseite: Tagesvorschlag, Suche, Filter, „Was hab ich da?“ und Sortierung

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
  leerText: document.getElementById("leer-text"),
  heroText: document.getElementById("hero-text"),
  vorrat: document.getElementById("vorrat"),
  vorratStatus: document.getElementById("vorrat-status"),
  vorratGruppen: document.getElementById("vorrat-gruppen"),
  vorratWeitere: document.getElementById("vorrat-weitere"),
  vorratLeeren: document.getElementById("vorrat-leeren"),
};
const LEER_TEXT = el.leerText.textContent;

// ---------- Tagesvorschlag ----------

const vorschlaege = [
  { el: document.getElementById("vorschlag-kochen"), label: "Was koche ich heute?",
    rezepte: rezepte.filter((r) => !KEIN_HAUPTGERICHT.includes(r.kategorie)), letzter: null },
  { el: document.getElementById("vorschlag-backen"), label: "Was backe ich heute?",
    rezepte: rezepte.filter((r) => BACKEN.includes(r.kategorie)), letzter: null },
];

function zeigeVorschlag(v, animieren) {
  if (!v.rezepte.length) { v.el.hidden = true; return; }
  const auswahl = v.rezepte.filter((r) => r.id !== v.letzter);
  const r = zufall(auswahl.length ? auswahl : v.rezepte);
  v.letzter = r.id;
  v.el.innerHTML = `
    <a href="${esc(r.seite)}" tabindex="-1" aria-hidden="true">${tellerHTML(r, animieren ? "dreht" : "")}</a>
    <div class="vorschlag-text">
      <p class="vorschlag-label">${v.label}</p>
      <h2><a href="${esc(r.seite)}">${esc(r.titel)}</a></h2>
      <p class="vorschlag-info">${formatZeit(r.zeit)}, ${esc(r.schwierigkeit)}</p>
      <button type="button" class="knopf zweit klein">Anderer Vorschlag</button>
    </div>`;
  v.el.querySelector("button").addEventListener("click", () => zeigeVorschlag(v, true));
}

// ---------- Wechselnde Hintergrundbilder ----------

const HERO_INTERVALL = 7000;

function heroWechsel() {
  const bilder = [...document.querySelectorAll(".hero-hintergrund")];
  if (bilder.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // Weitere Bilder erst nach dem Seitenaufbau laden, damit das erste schnell erscheint
  for (const b of bilder) if (b.dataset.src) b.src = b.dataset.src;
  let aktiv = 0;
  setInterval(() => {
    if (document.hidden) return;
    // Nur zu Bildern wechseln, die schon geladen sind
    const naechstes = bilder.findIndex((b, i) => i > aktiv && b.complete && b.naturalWidth);
    const ziel = naechstes >= 0 ? naechstes : 0;
    if (ziel === aktiv) return;
    bilder[aktiv].classList.remove("aktiv");
    bilder[ziel].classList.add("aktiv");
    aktiv = ziel;
  }, HERO_INTERVALL);
}

// ---------- Was hab ich da? ----------

const VORRAT_SPEICHER = "vorrat";
// Getränke und Grundrezepte sind kein Gericht, das man „aus dem Vorrat“ kocht
const OHNE_VORRAT = ["Getränke", "Teige & Grundrezepte"];
const MAX_FEHLEND = 3;

const zutatName = {};
for (const g of window.ZUTATEN) Object.assign(zutatName, g.zutaten);
const vorausgewaehlt = window.ZUTATEN.filter((g) => g.vorausgewaehlt).flatMap((g) => Object.keys(g.zutaten));

const vorratGespeichert = speicherLesen(VORRAT_SPEICHER);
const vorrat = new Set(Array.isArray(vorratGespeichert?.auswahl)
  ? vorratGespeichert.auswahl.filter((k) => k in zutatName)
  : vorausgewaehlt);

// Erst mit einer eigenen Zutat (nicht nur Öl und Zucker) ist der Abgleich aktiv
function vorratAktiv() {
  return [...vorrat].some((k) => !vorausgewaehlt.includes(k));
}

// Fehlende Zutaten eines Rezepts, oder null, wenn es nicht zum Vorrat passt
function abgleich(r) {
  if (!r.zutaten || OHNE_VORRAT.includes(r.kategorie)) return null;
  const fehlend = r.zutaten.filter((k) => !vorrat.has(k));
  const eigeneTreffer = r.zutaten.some((k) => vorrat.has(k) && !vorausgewaehlt.includes(k));
  if (!eigeneTreffer || fehlend.length > MAX_FEHLEND) return null;
  return { fehlend, anteil: 1 - fehlend.length / r.zutaten.length };
}

function vorratAufbauen() {
  const gruppeHTML = (g) => `<div class="vorrat-gruppe">
    <h3>${esc(g.gruppe)}</h3>
    <div class="chips">${Object.entries(g.zutaten).map(([k, name]) =>
      `<button type="button" class="chip ohne-punkt" data-zutat="${esc(k)}" aria-pressed="${vorrat.has(k)}">${esc(name)}</button>`).join("")}</div>
  </div>`;
  const weitere = window.ZUTATEN.filter((g) => g.weitere);
  el.vorratGruppen.innerHTML = window.ZUTATEN.filter((g) => !g.weitere).map(gruppeHTML).join("");
  el.vorratWeitere.innerHTML = weitere.map(gruppeHTML).join("");
  el.vorrat.open = Boolean(vorratGespeichert?.offen);
  // Wer schon etwas aus „Weitere Zutaten“ angekreuzt hat, soll es auch sehen
  el.vorratWeitere.parentElement.open = weitere.some((g) => Object.keys(g.zutaten).some((k) => vorrat.has(k)));
}

function vorratSpeichern() {
  speicherSchreiben(VORRAT_SPEICHER, { auswahl: [...vorrat], offen: el.vorrat.open });
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
    const zutaten = (r.zutaten || []).map((k) => zutatName[k]).join(" ");
    const heuhaufen = `${r.titel} ${r.beschreibung} ${r.kategorie} ${zutaten}`.toLowerCase();
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

function karteHTML(r, fehlend = []) {
  const merkmale = [`<li>${formatZeit(r.zeit)}</li>`, `<li>${esc(r.schwierigkeit)}</li>`];
  if (istFleischfrei(r)) merkmale.push(`<li>${esc(r.ernaehrung)}</li>`);
  return `<li>
    <a class="rezept-karte" href="${esc(r.seite)}">
      ${tellerHTML(r)}
      <h3>${esc(r.titel)}</h3>
      <p>${esc(r.beschreibung)}</p>
      <ul class="merkmale">${merkmale.join("")}</ul>
      ${fehlend.length ? `<div class="fehlt"><span>Fehlt:</span>
        <ul>${fehlend.map((k) => `<li>${esc(zutatName[k])}</li>`).join("")}</ul></div>` : ""}
    </a>
  </li>`;
}

// Mit Vorrat: erst die Rezepte ohne fehlende Zutaten, dann die mit wenigen, jeweils mit Überschrift
function vorratRasterHTML(treffer) {
  const titelHTML = (text, n) => `<li class="raster-titel"><h2>${text} <span>${n}</span></h2></li>`;
  const sofort = treffer.filter((t) => !t.abgleich.fehlend.length);
  const wenig = treffer.filter((t) => t.abgleich.fehlend.length);
  const teile = [];
  if (sofort.length) teile.push(titelHTML("Kannst du sofort kochen", sofort.length), ...sofort.map((t) => karteHTML(t.r)));
  if (wenig.length) teile.push(titelHTML("Fehlt nur wenig", wenig.length), ...wenig.map((t) => karteHTML(t.r, t.abgleich.fehlend)));
  return teile.join("");
}

function anzeigen() {
  const mitVorrat = vorratAktiv();
  let treffer = rezepte.filter(passt).map((r) => ({ r, abgleich: mitVorrat ? abgleich(r) : null }));
  if (mitVorrat) treffer = treffer.filter((t) => t.abgleich);
  treffer.sort((a, b) => {
    if (mitVorrat) {
      const unterschied = a.abgleich.fehlend.length - b.abgleich.fehlend.length || b.abgleich.anteil - a.abgleich.anteil;
      if (unterschied) return unterschied;
    }
    return sortierer[zustand.sortierung](a.r, b.r);
  });
  el.raster.innerHTML = mitVorrat ? vorratRasterHTML(treffer) : treffer.map((t) => karteHTML(t.r)).join("");
  el.leer.hidden = treffer.length > 0;
  el.raster.hidden = treffer.length === 0;
  el.leerText.textContent = mitVorrat ? "Kreuze weitere Zutaten an oder lockere die Filter." : LEER_TEXT;

  if (mitVorrat) {
    el.anzahl.innerHTML = `<strong>${treffer.length}</strong> ${treffer.length === 1 ? "Rezept passt" : "Rezepte passen"} zu deinem Vorrat`;
  } else {
    el.anzahl.innerHTML = treffer.length === rezepte.length
      ? `<strong>${rezepte.length}</strong> Rezepte`
      : `<strong>${treffer.length}</strong> von ${rezepte.length} Rezepten`;
  }

  const eigene = [...vorrat].filter((k) => !vorausgewaehlt.includes(k)).length;
  el.vorratStatus.textContent = mitVorrat
    ? `${eigene} ${eigene === 1 ? "Zutat" : "Zutaten"} angekreuzt`
    : "Zutaten ankreuzen und passende Rezepte finden";
  el.vorratLeeren.hidden = !mitVorrat;

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
el.vorrat.addEventListener("click", (e) => {
  const knopf = e.target.closest("button[data-zutat]");
  if (!knopf) return;
  const k = knopf.dataset.zutat;
  if (vorrat.has(k)) vorrat.delete(k);
  else vorrat.add(k);
  knopf.setAttribute("aria-pressed", String(vorrat.has(k)));
  vorratSpeichern();
  anzeigen();
});
el.vorrat.addEventListener("toggle", vorratSpeichern);
el.vorratLeeren.addEventListener("click", () => {
  vorrat.clear();
  for (const k of vorausgewaehlt) vorrat.add(k);
  for (const knopf of el.vorrat.querySelectorAll("button[data-zutat]")) {
    knopf.setAttribute("aria-pressed", String(vorrat.has(knopf.dataset.zutat)));
  }
  vorratSpeichern();
  anzeigen();
});
document.getElementById("leer-zuruecksetzen").addEventListener("click", zuruecksetzen);

el.heroText.textContent = `${rezepte.length} erprobte Rezepte aus unserer Küche. Filtere nach Zeit, Kategorie und Ernährung oder lass dir eins vorschlagen.`;
kategorienAufbauen();
vorratAufbauen();
for (const v of vorschlaege) zeigeVorschlag(v, true);
anzeigen();
if (document.readyState === "complete") heroWechsel();
else addEventListener("load", heroWechsel);
