// Wein-Seite: Liste aus assets/wein.json, neue Einträge über die GitHub-API (Helfer in sammlung.js)
//
// Eintrag: { id, name, weingut, weinart (Schlüssel aus WEINARTEN), rebsorte, jahrgang (Zahl oder null), herkunft,
//           rating (1–10), preis (€ je Flasche), flasche (Liter), passtZu, link, datum (JJJJ-MM-TT), bild, notiz,
//           profil: { intensitaet, suesse, saeure, tannin, koerper, abgang } (je 1–5, tannin nur bei Rotwein),
//           aromen: [...] }
// Aus dem Vivino-Export übernommene Weine haben zusätzlich quelle: "vivino" und vivinoSterne (1–5, eine Nachkommastelle);
// rating ist dort Sterne × 2 gerundet, datum das Datum der Bewertung
// Pflicht sind Name und Weinart. Noch nicht probiert: rating und profil sind null; fehlender Preis oder
// Jahrgang null, fehlende Texte leer
// Fotos (Etikett) liegen in assets/bilder/wein/<id>.jpg
//
// Verkostungsprofil nach dem WSET Systematic Approach to Tasting (Aromaintensität, Süße, Säure, Tannin, Körper,
// Abgang), Aromen nach den Gruppen des Wine Aroma Wheel von Ann C. Noble

const DATEN = "assets/wein.json";
const WEINARTEN = [
  { schluessel: "rot", name: "Rotwein" },
  { schluessel: "weiss", name: "Weißwein" },
  { schluessel: "rose", name: "Rosé" },
  { schluessel: "schaum", name: "Schaumwein" },
  { schluessel: "suess", name: "Süßwein" },
];
const PROFIL = [
  { schluessel: "intensitaet", name: "Intensität" },
  { schluessel: "suesse", name: "Süße" },
  { schluessel: "saeure", name: "Säure" },
  { schluessel: "tannin", name: "Tannin", nurRot: true },
  { schluessel: "koerper", name: "Körper" },
  { schluessel: "abgang", name: "Abgang" },
];
const AROMEN = [
  "Zitrus", "Apfel & Birne", "Steinobst", "Tropische Früchte", "Rote Beeren", "Dunkle Beeren", "Trockenfrüchte",
  "Blumig", "Kräuter & grün", "Würzig", "Eiche & Vanille", "Hefe & Brioche", "Mineralisch", "Erdig",
  "Nussig & Honig", "Leder & Tabak",
];
const FLASCHEN = [0.75, 0.375, 0.5, 1, 1.5];

const liste = document.getElementById("wein-liste");
const anzahl = document.getElementById("wein-anzahl");
const sortierung = document.getElementById("wein-sortierung");

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const liter = (l) => `${String(l).replace(".", ",")} l`;
const weinartName = Object.fromEntries(WEINARTEN.map((w) => [w.schluessel, w.name]));
const rezeptNachTitel = Object.fromEntries((window.REZEPTE || []).map((r) => [r.titel.toLowerCase(), r]));
let weine = [];
let artFilter = [];
let aromenFilter = [];
let nurOffen = false;

const probiert = (w) => typeof w.rating === "number";
const achsen = (weinart) => PROFIL.filter((p) => !p.nurRot || weinart === "rot");
const preisProLiter = (w) => (w.preis && w.flasche ? w.preis / w.flasche : null);

// ---------- Laden und Anzeigen ----------

async function laden() {
  weine = await datenLaden(DATEN);
  zeigen();
}

function sortiert() {
  const art = sortierung.value;
  const kopie = weine.filter((w) => (!artFilter.length || artFilter.includes(w.weinart))
    && aromenFilter.every((n) => (w.aromen || []).includes(n))
    && (!nurOffen || !probiert(w)));
  // Fehlende Werte (kein Preis, kein Datum, kein Jahrgang, noch nicht probiert) kommen immer ans Ende
  const nach = (wert, aufsteigend = false) => (a, b) => {
    const x = wert(a), y = wert(b);
    if (x == null || y == null) return (x == null) - (y == null);
    return aufsteigend ? (x > y) - (x < y) : (x < y) - (x > y);
  };
  const datum = (w) => w.datum || null;
  const rating = (w) => (probiert(w) ? w.rating : null);
  const jahrgang = (w) => w.jahrgang || null;
  const reihenfolge = {
    neu: nach(datum),
    alt: nach(datum, true),
    rating: (a, b) => nach(rating)(a, b) || nach(datum)(a, b),
    preis: nach(preisProLiter, true),
    "preis-ab": nach(preisProLiter),
    "jahrgang-alt": nach(jahrgang, true),
    "jahrgang-neu": nach(jahrgang),
    name: (a, b) => a.name.localeCompare(b.name, "de"),
  };
  if (art.startsWith("profil-")) {
    const wert = (w) => (w.profil ? w.profil[art.slice(7)] ?? null : null);
    kopie.sort((a, b) => nach(wert)(a, b) || nach(rating)(a, b));
  } else kopie.sort(reihenfolge[art] || reihenfolge.neu);
  return kopie;
}

// „Passt zu“: durch Komma getrennt. Verlinkt wird ein Rezept mit genau diesem Titel, sonst das einzige,
// dessen Titel den Begriff enthält („Lasagne“ → „Lasagne wie beim Italiener“)
function rezeptZu(begriff) {
  const klein = begriff.toLowerCase();
  if (rezeptNachTitel[klein]) return rezeptNachTitel[klein];
  if (klein.length < 4) return null;
  const treffer = (window.REZEPTE || []).filter((r) => r.titel.toLowerCase().includes(klein));
  return treffer.length === 1 ? treffer[0] : null;
}

function passtZuHTML(text) {
  return text.split(",").map((t) => t.trim()).filter(Boolean).map((t) => {
    const r = rezeptZu(t);
    return r ? `<li><a href="${esc(r.seite)}" title="${esc(r.titel)}">${esc(t)}</a></li>` : `<li>${esc(t)}</li>`;
  }).join("");
}

function karteHTML(w) {
  const link = w.link && sichererLink(w.link);
  const bewertet = probiert(w);
  const unterzeile = [w.weingut, w.jahrgang].filter(Boolean).join(" · ");
  const merkmale = [`<li class="wein-art" style="--punkt:var(--wein-${esc(w.weinart)})">${esc(weinartName[w.weinart] || w.weinart)}</li>`];
  if (w.rebsorte) merkmale.push(`<li>${esc(w.rebsorte)}</li>`);
  if (w.herkunft) merkmale.push(`<li>${esc(w.herkunft)}</li>`);
  if (!bewertet) merkmale.push(`<li class="offen">Noch nicht probiert</li>`);
  return `<li class="kaffee-karte">
    <div class="kaffee-bild">
      ${w.bild
        ? `<img src="${esc(w.bild)}" alt="Etikett von ${esc(w.name)}" loading="lazy" data-roh="${esc(w.bild)}">`
        : `<span class="kaffee-platzhalter" aria-hidden="true">${esc(w.name.charAt(0))}</span>`}
      ${bewertet
        ? `<span class="kaffee-rating" title="Bewertung">${w.rating}<small>/10</small></span>`
        : `<span class="kaffee-rating offen" title="Noch nicht probiert">?</span>`}
    </div>
    <div class="kaffee-text">
      <h2>${esc(w.name)}</h2>
      ${unterzeile ? `<p class="kaffee-roester">${esc(unterzeile)}</p>` : ""}
      <ul class="merkmale">${merkmale.join("")}</ul>
      ${bewertet ? ratingLeiste(w.rating) : ""}
      ${w.preis ? `<dl class="kaffee-preise wein-preise">
        <div class="preis-kg"><dt>Flasche ${liter(w.flasche)}</dt><dd>${euro.format(w.preis)}</dd></div>
        ${w.flasche !== 1 ? `<div><dt>pro Liter</dt><dd>${euro.format(preisProLiter(w))}</dd></div>` : ""}
      </dl>` : ""}
      ${bewertet && w.profil ? profilSVG(w.profil, achsen(w.weinart)) : ""}
      ${w.aromen && w.aromen.length ? `<ul class="merkmale">${w.aromen.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      ${w.passtZu ? `<div class="wein-passt"><span>Passt zu</span><ul>${passtZuHTML(w.passtZu)}</ul></div>` : ""}
      ${w.notiz ? `<p class="kaffee-notiz">${esc(w.notiz)}</p>` : ""}
      ${w.datum || link ? `<p class="kaffee-fuss">
        ${w.datum ? `<span>${w.quelle === "vivino" ? "Bei Vivino bewertet am" : "Gekauft am"} ${esc(datumText(w.datum))}</span>` : "<span></span>"}
        ${link ? `<a href="${esc(link.href)}" target="_blank" rel="noopener">${esc(linkName(link))}</a>` : ""}
      </p>` : ""}
      ${token() ? `<p class="kaffee-verwalten">
        <button type="button" class="textlink wein-bearbeiten" data-id="${esc(w.id)}">Bearbeiten</button>
        <button type="button" class="textlink wein-loeschen" data-id="${esc(w.id)}">Löschen</button>
      </p>` : ""}
    </div>
  </li>`;
}

function zeigen() {
  if (!weine.length) {
    anzahl.textContent = "";
    liste.innerHTML = `<li class="leer">
      <div class="teller" aria-hidden="true"></div>
      <h2>Noch kein Wein eingetragen</h2>
      <p>Über „Wein eintragen“ kommt der erste dazu.</p>
    </li>`;
    return;
  }
  const sichtbar = sortiert();
  anzahl.innerHTML = artFilter.length || aromenFilter.length || nurOffen
    ? `<strong>${sichtbar.length}</strong> von ${weine.length} Weinen`
    : `<strong>${weine.length}</strong> ${weine.length === 1 ? "Wein" : "Weine"}`;
  liste.innerHTML = sichtbar.length
    ? sichtbar.map(karteHTML).join("")
    : `<li class="leer"><h2>Kein passender Wein</h2><p>Nimm einen Filter heraus.</p></li>`;
}

bilderAusRepoNachladen(liste);
sortierung.addEventListener("change", zeigen);

document.getElementById("sortierung-profil").innerHTML = PROFIL
  .map((p) => `<option value="profil-${p.schluessel}">${p.name}</option>`).join("");

// Weinarten: mehrere zugleich wählbar (oder), Aromen müssen alle passen (und)
const artLeiste = document.getElementById("art-filter");
artLeiste.innerHTML = WEINARTEN.map((w) =>
  `<button type="button" class="chip" aria-pressed="false" data-art="${w.schluessel}" style="--punkt:var(--wein-${w.schluessel})">${w.name}</button>`).join("")
  + `<button type="button" class="chip ohne-punkt" aria-pressed="false" data-offen>Noch nicht probiert</button>`;
const aromenLeiste = document.getElementById("aromen-filter");
aromenLeiste.innerHTML = AROMEN.map((n) =>
  `<button type="button" class="chip ohne-punkt" aria-pressed="false" data-aroma="${esc(n)}">${esc(n)}</button>`).join("");

function umschalten(liste, wert, an) {
  return an ? [...liste, wert] : liste.filter((x) => x !== wert);
}

for (const leiste of [artLeiste, aromenLeiste]) {
  leiste.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const an = chip.getAttribute("aria-pressed") !== "true";
    chip.setAttribute("aria-pressed", String(an));
    if ("offen" in chip.dataset) nurOffen = an;
    else if (chip.dataset.art) artFilter = umschalten(artFilter, chip.dataset.art, an);
    else aromenFilter = umschalten(aromenFilter, chip.dataset.aroma, an);
    zeigen();
  });
}

// ---------- Dialoge ----------

const weinDialog = document.getElementById("wein-dialog");
const zugangOeffnen = zugangEinrichten(DATEN, laden, zeigen);

const form = document.getElementById("wein-form");
const formMeldung = document.getElementById("wein-meldung");
const preisFeld = document.getElementById("w-preis");
const flascheFeld = document.getElementById("w-flasche");
const preisLiterText = document.getElementById("w-preis-liter");
const ratingFeld = document.getElementById("w-rating");
const weinartFeld = document.getElementById("w-weinart");
let fotoDatei = null;
let bearbeitet = null; // Eintrag, der gerade bearbeitet wird; null bei einem neuen Wein
const bildVorschau = document.getElementById("w-bild-vorschau");
const speichernKnopf = document.getElementById("w-speichern");

weinartFeld.innerHTML = WEINARTEN.map((w) => `<option value="${w.schluessel}">${w.name}</option>`).join("");
flascheFeld.innerHTML = FLASCHEN.map((l) => `<option value="${l}">${liter(l)}</option>`).join("");
document.getElementById("w-jahrgang").max = new Date().getFullYear();
document.getElementById("rezept-vorschlaege").innerHTML = (window.REZEPTE || [])
  .filter((r) => !KEIN_HAUPTGERICHT.includes(r.kategorie) || r.kategorie === "Nachtisch")
  .map((r) => `<option value="${esc(r.titel)}">`).join("");

function preisAnzeigen() {
  const preis = parseFloat(preisFeld.value);
  const l = Number(flascheFeld.value);
  preisLiterText.textContent = preis > 0 && l !== 1 ? `${euro.format(preis / l)} pro Liter` : "";
}
preisFeld.addEventListener("input", preisAnzeigen);
flascheFeld.addEventListener("change", preisAnzeigen);

const profilFelder = document.getElementById("w-profil");
profilFelder.innerHTML = PROFIL.map((p) => `<div class="feld profil-regler" data-profil="${p.schluessel}">
  <label for="w-${p.schluessel}">${p.name} <span class="feld-wert" id="w-${p.schluessel}-wert">3</span></label>
  <input id="w-${p.schluessel}" name="${p.schluessel}" type="range" min="1" max="5" step="1" value="3">
</div>`).join("");
profilFelder.addEventListener("input", (e) => {
  document.getElementById(`${e.target.id}-wert`).textContent = e.target.value;
});
document.getElementById("w-aromen").innerHTML = AROMEN.map((n) => `<label class="noten-wahl">
  <input type="checkbox" name="aromen" value="${esc(n)}"><span>${esc(n)}</span>
</label>`).join("");

// Tannin gibt es nur beim Rotwein
function profilAnpassen() {
  for (const p of PROFIL) {
    profilFelder.querySelector(`[data-profil="${p.schluessel}"]`).hidden = Boolean(p.nurRot) && weinartFeld.value !== "rot";
  }
}
weinartFeld.addEventListener("change", profilAnpassen);

const probiertFeld = document.getElementById("w-probiert");
const bewertungFelder = document.getElementById("w-bewertung");
probiertFeld.addEventListener("change", () => { bewertungFelder.hidden = !probiertFeld.checked; });

ratingFeld.addEventListener("input", () => {
  document.getElementById("w-rating-wert").textContent = `${ratingFeld.value} / 10`;
});

fotoWahlEinrichten(form, bildVorschau, (datei) => { fotoDatei = datei; });
vorschauNachladen(bildVorschau);

function formularOeffnen(eintrag = null) {
  form.reset();
  bearbeitet = eintrag;
  fotoDatei = null;
  const feld = (name) => form.elements[name];
  document.getElementById("wein-dialog-titel").textContent = eintrag ? "Wein bearbeiten" : "Wein eintragen";
  feld("datum").value = heute();
  if (eintrag) {
    feld("name").value = eintrag.name;
    feld("weingut").value = eintrag.weingut || "";
    feld("weinart").value = eintrag.weinart || "rot";
    feld("rebsorte").value = eintrag.rebsorte || "";
    feld("jahrgang").value = eintrag.jahrgang || "";
    feld("herkunft").value = eintrag.herkunft || "";
    feld("probiert").checked = probiert(eintrag);
    if (probiert(eintrag)) feld("rating").value = eintrag.rating;
    feld("preis").value = eintrag.preis || "";
    feld("flasche").value = String(eintrag.flasche || 0.75);
    feld("passtZu").value = eintrag.passtZu || "";
    feld("link").value = eintrag.link || "";
    feld("datum").value = eintrag.datum || "";
    feld("notiz").value = eintrag.notiz || "";
    PROFIL.forEach((p) => { feld(p.schluessel).value = (eintrag.profil || {})[p.schluessel] || 3; });
    form.querySelectorAll('[name="aromen"]').forEach((k) => { k.checked = (eintrag.aromen || []).includes(k.value); });
  }
  bewertungFelder.hidden = !probiertFeld.checked;
  profilAnpassen();
  ratingFeld.dispatchEvent(new Event("input"));
  PROFIL.forEach((p) => { document.getElementById(`w-${p.schluessel}-wert`).textContent = feld(p.schluessel).value; });
  vorschauZeigen(bildVorschau, eintrag && eintrag.bild);
  speichernKnopf.textContent = eintrag ? "Änderungen speichern" : "Speichern";
  preisAnzeigen();
  meldung(formMeldung, "");
  weinDialog.showModal();
}

document.getElementById("neu-knopf").addEventListener("click", () => {
  if (!token()) {
    zugangOeffnen("Zum Eintragen braucht dieser Browser zuerst einen Zugang.");
    return;
  }
  formularOeffnen();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const daten = new FormData(form);
  const text = (name) => String(daten.get(name) || "").trim();
  const linkText = text("link");
  const linkUrl = linkText ? linkAusText(linkText) : null;
  if (linkText && !linkUrl) {
    meldung(formMeldung, "Im Link-Feld steht keine Adresse mit http:// oder https://.", true);
    return;
  }

  const datum = text("datum");
  const weinart = text("weinart");
  const bewertet = probiertFeld.checked;
  const preis = parseFloat(daten.get("preis"));
  const jahrgang = parseInt(daten.get("jahrgang"), 10);
  const id = bearbeitet ? bearbeitet.id : kennung(text("name"), datum || heute(), "wein");
  // Ein neues Foto bekommt beim Bearbeiten einen neuen Dateinamen, sonst zeigt der Browser-Cache noch das alte
  const bild = !fotoDatei ? (bearbeitet ? bearbeitet.bild || "" : "")
    : bearbeitet ? `assets/bilder/wein/${id}-${Date.now().toString(36)}.jpg`
    : `assets/bilder/wein/${id}.jpg`;
  const altesBild = bearbeitet && fotoDatei ? bearbeitet.bild : "";
  const eintrag = {
    ...bearbeitet,
    id,
    name: text("name"),
    weingut: text("weingut"),
    weinart,
    rebsorte: text("rebsorte"),
    jahrgang: jahrgang > 0 ? jahrgang : null,
    herkunft: text("herkunft"),
    rating: bewertet ? Number(daten.get("rating")) : null,
    preis: preis > 0 ? Math.round(preis * 100) / 100 : null,
    flasche: Number(daten.get("flasche")) || 0.75,
    passtZu: text("passtZu"),
    link: linkUrl ? linkUrl.href : "",
    datum,
    bild,
    notiz: text("notiz"),
    profil: bewertet ? Object.fromEntries(achsen(weinart).map((p) => [p.schluessel, Number(daten.get(p.schluessel))])) : null,
    aromen: bewertet ? daten.getAll("aromen").map(String) : [],
  };

  speichernKnopf.disabled = true;
  try {
    if (fotoDatei) {
      meldung(formMeldung, "Foto wird hochgeladen …");
      const foto = await bildVerkleinern(fotoDatei);
      await github(eintrag.bild, {
        method: "PUT",
        body: JSON.stringify({ message: `Wein: Foto für ${eintrag.name}`, branch: ZWEIG, content: foto }),
      });
    }
    meldung(formMeldung, "Eintrag wird gespeichert …");
    weine = bearbeitet
      ? await datenAendern(DATEN, (alle) => alle.some((w) => w.id === id)
        ? alle.map((w) => (w.id === id ? eintrag : w))
        : [...alle, eintrag], `Wein: ${eintrag.name} bearbeitet`)
      : await datenAendern(DATEN, (alle) => [...alle, eintrag], `Wein: ${eintrag.name} eingetragen`);
    if (altesBild) await fotoLoeschen(altesBild, `Wein: Foto von ${eintrag.name} gelöscht`);
    weinDialog.close();
    zeigen();
  } catch (fehler) {
    meldung(formMeldung, speicherFehler(fehler), true);
  } finally {
    speichernKnopf.disabled = false;
  }
});

// Bearbeiten und Löschen
liste.addEventListener("click", async (e) => {
  const bearbeiten = e.target.closest(".wein-bearbeiten");
  if (bearbeiten) {
    const eintrag = weine.find((w) => w.id === bearbeiten.dataset.id);
    if (eintrag) formularOeffnen(eintrag);
    return;
  }
  const knopf = e.target.closest(".wein-loeschen");
  if (!knopf) return;
  const eintrag = weine.find((w) => w.id === knopf.dataset.id);
  if (!eintrag || !confirm(`„${eintrag.name}“ wirklich löschen?`)) return;

  knopf.disabled = true;
  knopf.textContent = "Wird gelöscht …";
  try {
    weine = await datenAendern(DATEN, (alle) => alle.filter((w) => w.id !== eintrag.id), `Wein: ${eintrag.name} gelöscht`);
    if (eintrag.bild) await fotoLoeschen(eintrag.bild, `Wein: Foto von ${eintrag.name} gelöscht`);
    zeigen();
  } catch (fehler) {
    knopf.disabled = false;
    knopf.textContent = "Löschen";
    alert(`Löschen fehlgeschlagen: ${fehler.message}`);
  }
});

laden();
