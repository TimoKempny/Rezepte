// Kaffee-Seite: Liste aus assets/kaffee.json, neue Einträge über die GitHub-API (Helfer in sammlung.js)
//
// Eintrag: { id, name, roester, rating (1–10), preisProKg, link, datum (JJJJ-MM-TT), bild, notiz,
//           profil: { aroma, saeure, suesse, koerper, bitterkeit, nachgeschmack } (je 1–5), noten: [...] }
// Pflicht ist nur der Name. Noch nicht probiert: rating und profil sind null; fehlender Preis null,
// fehlendes Datum, Foto oder Link als leerer Text
// Fotos liegen in assets/bilder/kaffee/<id>.jpg
//
// Tasting-Profil nach dem SCA-Cupping-Formular (Aroma, Säure, Süße, Körper, Nachgeschmack; Bitterkeit
// als Gegenpol zur Süße), Geschmacksnoten nach den Hauptgruppen des SCA Coffee Taster's Flavor Wheel

const DATEN = "assets/kaffee.json";
const PACKUNGEN = [500, 250, 125];
const PROFIL = [
  { schluessel: "aroma", name: "Aroma" },
  { schluessel: "saeure", name: "Säure" },
  { schluessel: "suesse", name: "Süße" },
  { schluessel: "koerper", name: "Körper" },
  { schluessel: "bitterkeit", name: "Bitterkeit" },
  { schluessel: "nachgeschmack", name: "Nachgeschmack" },
];
const NOTEN = [
  "Blumig", "Fruchtig", "Beerig", "Zitrus", "Fermentiert", "Grün & pflanzlich",
  "Karamell & süß", "Nussig", "Schokolade & Kakao", "Würzig", "Röstig",
];

const liste = document.getElementById("kaffee-liste");
const anzahl = document.getElementById("kaffee-anzahl");
const sortierung = document.getElementById("kaffee-sortierung");

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
let kaffees = [];
let notenFilter = [];
let nurOffen = false;

const probiert = (k) => typeof k.rating === "number";

// ---------- Laden und Anzeigen ----------

async function laden() {
  kaffees = await datenLaden(DATEN);
  zeigen();
}

function sortiert() {
  const art = sortierung.value;
  const kopie = kaffees.filter((k) => notenFilter.every((n) => (k.noten || []).includes(n))
    && (!nurOffen || !probiert(k)));
  // Fehlende Werte (kein Preis, kein Datum, noch nicht probiert) kommen immer ans Ende
  const nach = (wert, aufsteigend = false) => (a, b) => {
    const x = wert(a), y = wert(b);
    if (x == null || y == null) return (x == null) - (y == null);
    return aufsteigend ? (x > y) - (x < y) : (x < y) - (x > y);
  };
  const datum = (k) => k.datum || null;
  const preis = (k) => k.preisProKg || null;
  const rating = (k) => (probiert(k) ? k.rating : null);
  const reihenfolge = {
    neu: nach(datum),
    alt: nach(datum, true),
    rating: (a, b) => nach(rating)(a, b) || nach(datum)(a, b),
    preis: nach(preis, true),
    "preis-ab": nach(preis),
    name: (a, b) => a.name.localeCompare(b.name, "de"),
  };
  if (art.startsWith("profil-")) {
    const wert = (k) => (k.profil ? k.profil[art.slice(7)] : null);
    kopie.sort((a, b) => nach(wert)(a, b) || nach(rating)(a, b));
  } else kopie.sort(reihenfolge[art] || reihenfolge.neu);
  return kopie;
}

function karteHTML(k) {
  const link = k.link && sichererLink(k.link);
  const bewertet = probiert(k);
  return `<li class="kaffee-karte">
    <div class="kaffee-bild">
      ${k.bild
        ? `<img src="${esc(k.bild)}" alt="Verpackung von ${esc(k.name)}" loading="lazy" data-roh="${esc(k.bild)}">`
        : `<span class="kaffee-platzhalter" aria-hidden="true">${esc(k.name.charAt(0))}</span>`}
      ${bewertet
        ? `<span class="kaffee-rating" title="Bewertung">${k.rating}<small>/10</small></span>`
        : `<span class="kaffee-rating offen" title="Noch nicht probiert">?</span>`}
    </div>
    <div class="kaffee-text">
      <h2>${esc(k.name)}</h2>
      ${k.roester ? `<p class="kaffee-roester">${esc(k.roester)}</p>` : ""}
      ${bewertet ? ratingLeiste(k.rating) : `<ul class="merkmale"><li class="offen">Noch nicht probiert</li></ul>`}
      ${k.preisProKg ? `<dl class="kaffee-preise">
        <div class="preis-kg"><dt>1 kg</dt><dd>${euro.format(k.preisProKg)}</dd></div>
        ${PACKUNGEN.map((g) => `<div><dt>${g} g</dt><dd>${euro.format(k.preisProKg * g / 1000)}</dd></div>`).join("")}
      </dl>` : ""}
      ${bewertet && k.profil ? profilSVG(k.profil, PROFIL) : ""}
      ${k.noten && k.noten.length ? `<ul class="merkmale">${k.noten.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      ${k.notiz ? `<p class="kaffee-notiz">${esc(k.notiz)}</p>` : ""}
      ${k.datum || link ? `<p class="kaffee-fuss">
        ${k.datum ? `<span>Gekauft am ${esc(datumText(k.datum))}</span>` : "<span></span>"}
        ${link ? `<a href="${esc(link.href)}" target="_blank" rel="noopener">${esc(linkName(link))}</a>` : ""}
      </p>` : ""}
      ${token() ? `<p class="kaffee-verwalten">
        <button type="button" class="textlink kaffee-bearbeiten" data-id="${esc(k.id)}">Bearbeiten</button>
        <button type="button" class="textlink kaffee-loeschen" data-id="${esc(k.id)}">Löschen</button>
      </p>` : ""}
    </div>
  </li>`;
}

function zeigen() {
  if (!kaffees.length) {
    anzahl.textContent = "";
    liste.innerHTML = `<li class="leer">
      <div class="teller" aria-hidden="true"></div>
      <h2>Noch kein Kaffee eingetragen</h2>
      <p>Über „Kaffee eintragen“ kommt der erste dazu.</p>
    </li>`;
    return;
  }
  const sichtbar = sortiert();
  anzahl.innerHTML = notenFilter.length || nurOffen
    ? `<strong>${sichtbar.length}</strong> von ${kaffees.length} Kaffees`
    : `<strong>${kaffees.length}</strong> ${kaffees.length === 1 ? "Kaffee" : "Kaffees"}`;
  liste.innerHTML = sichtbar.length
    ? sichtbar.map(karteHTML).join("")
    : `<li class="leer"><h2>Kein passender Kaffee</h2><p>Nimm einen Filter heraus.</p></li>`;
}

bilderAusRepoNachladen(liste);
sortierung.addEventListener("change", zeigen);

document.getElementById("sortierung-profil").innerHTML = PROFIL
  .map((p) => `<option value="profil-${p.schluessel}">${p.name}</option>`).join("");

const filterLeiste = document.getElementById("noten-filter");
filterLeiste.innerHTML = `<button type="button" class="chip ohne-punkt" aria-pressed="false" data-offen>Noch nicht probiert</button>`
  + NOTEN.map((n) => `<button type="button" class="chip ohne-punkt" aria-pressed="false" data-note="${esc(n)}">${esc(n)}</button>`).join("");
filterLeiste.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const an = chip.getAttribute("aria-pressed") !== "true";
  chip.setAttribute("aria-pressed", String(an));
  if ("offen" in chip.dataset) nurOffen = an;
  else notenFilter = an ? [...notenFilter, chip.dataset.note] : notenFilter.filter((n) => n !== chip.dataset.note);
  zeigen();
});

// ---------- Dialoge ----------

const kaffeeDialog = document.getElementById("kaffee-dialog");
const zugangOeffnen = zugangEinrichten(DATEN, laden, zeigen);

// Neuer oder bearbeiteter Kaffee
const form = document.getElementById("kaffee-form");
const formMeldung = document.getElementById("kaffee-meldung");
const preisFeld = document.getElementById("k-preis");
const mengeFeld = document.getElementById("k-menge");
const preisKgText = document.getElementById("k-preis-kg");
const ratingFeld = document.getElementById("k-rating");
let fotoDatei = null;
let bearbeitet = null; // Eintrag, der gerade bearbeitet wird; null bei einem neuen Kaffee
const bildVorschau = document.getElementById("k-bild-vorschau");
const speichernKnopf = document.getElementById("k-speichern");

function preisProKg() {
  const preis = parseFloat(preisFeld.value);
  return preis > 0 ? Math.round(preis * 1000 / Number(mengeFeld.value) * 100) / 100 : 0;
}

function preisAnzeigen() {
  const kg = preisProKg();
  preisKgText.textContent = kg
    ? `${euro.format(kg)} pro kg · ${PACKUNGEN.map((g) => `${g} g ${euro.format(kg * g / 1000)}`).join(" · ")}`
    : "";
}
preisFeld.addEventListener("input", preisAnzeigen);
mengeFeld.addEventListener("change", preisAnzeigen);

document.getElementById("k-profil").innerHTML = PROFIL.map((p) => `<div class="feld profil-regler">
  <label for="k-${p.schluessel}">${p.name} <span class="feld-wert" id="k-${p.schluessel}-wert">3</span></label>
  <input id="k-${p.schluessel}" name="${p.schluessel}" type="range" min="1" max="5" step="1" value="3">
</div>`).join("");
document.getElementById("k-profil").addEventListener("input", (e) => {
  document.getElementById(`${e.target.id}-wert`).textContent = e.target.value;
});
document.getElementById("k-noten").innerHTML = NOTEN.map((n) => `<label class="noten-wahl">
  <input type="checkbox" name="noten" value="${esc(n)}"><span>${esc(n)}</span>
</label>`).join("");

const probiertFeld = document.getElementById("k-probiert");
const bewertungFelder = document.getElementById("k-bewertung");
probiertFeld.addEventListener("change", () => { bewertungFelder.hidden = !probiertFeld.checked; });

ratingFeld.addEventListener("input", () => {
  document.getElementById("k-rating-wert").textContent = `${ratingFeld.value} / 10`;
});

fotoWahlEinrichten(form, bildVorschau, (datei) => { fotoDatei = datei; });
vorschauNachladen(bildVorschau);

function formularOeffnen(eintrag = null) {
  form.reset();
  bearbeitet = eintrag;
  fotoDatei = null;
  const feld = (name) => form.elements[name];
  document.getElementById("kaffee-dialog-titel").textContent = eintrag ? "Kaffee bearbeiten" : "Kaffee eintragen";
  feld("datum").value = heute();
  if (eintrag) {
    feld("name").value = eintrag.name;
    feld("roester").value = eintrag.roester || "";
    feld("probiert").checked = probiert(eintrag);
    if (probiert(eintrag)) feld("rating").value = eintrag.rating;
    feld("preis").value = eintrag.preisProKg || "";
    feld("menge").value = "1000";
    feld("link").value = eintrag.link || "";
    feld("datum").value = eintrag.datum || "";
    feld("notiz").value = eintrag.notiz || "";
    PROFIL.forEach((p) => { feld(p.schluessel).value = (eintrag.profil || {})[p.schluessel] || 3; });
    form.querySelectorAll('[name="noten"]').forEach((k) => { k.checked = (eintrag.noten || []).includes(k.value); });
  }
  bewertungFelder.hidden = !probiertFeld.checked;
  ratingFeld.dispatchEvent(new Event("input"));
  PROFIL.forEach((p) => { document.getElementById(`k-${p.schluessel}-wert`).textContent = feld(p.schluessel).value; });
  vorschauZeigen(bildVorschau, eintrag && eintrag.bild);
  speichernKnopf.textContent = eintrag ? "Änderungen speichern" : "Speichern";
  preisAnzeigen();
  meldung(formMeldung, "");
  kaffeeDialog.showModal();
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
  const linkText = String(daten.get("link")).trim();
  const linkUrl = linkText ? linkAusText(linkText) : null;
  if (linkText && !linkUrl) {
    meldung(formMeldung, "Im Link-Feld steht keine Adresse mit http:// oder https://.", true);
    return;
  }
  const link = linkUrl ? linkUrl.href : "";

  const datum = String(daten.get("datum") || "");
  const bewertet = probiertFeld.checked;
  const id = bearbeitet ? bearbeitet.id : kennung(String(daten.get("name")), datum || heute(), "kaffee");
  // Ein neues Foto bekommt beim Bearbeiten einen neuen Dateinamen, sonst zeigt der Browser-Cache noch das alte
  const bild = !fotoDatei ? (bearbeitet ? bearbeitet.bild || "" : "")
    : bearbeitet ? `assets/bilder/kaffee/${id}-${Date.now().toString(36)}.jpg`
    : `assets/bilder/kaffee/${id}.jpg`;
  const altesBild = bearbeitet && fotoDatei ? bearbeitet.bild : "";
  const eintrag = {
    ...bearbeitet,
    id,
    name: String(daten.get("name")).trim(),
    roester: String(daten.get("roester")).trim(),
    rating: bewertet ? Number(daten.get("rating")) : null,
    preisProKg: preisProKg() || null,
    link,
    datum,
    bild,
    notiz: String(daten.get("notiz")).trim(),
    profil: bewertet ? Object.fromEntries(PROFIL.map((p) => [p.schluessel, Number(daten.get(p.schluessel))])) : null,
    noten: bewertet ? daten.getAll("noten").map(String) : [],
  };

  speichernKnopf.disabled = true;
  try {
    if (fotoDatei) {
      meldung(formMeldung, "Foto wird hochgeladen …");
      const foto = await bildVerkleinern(fotoDatei);
      await github(eintrag.bild, {
        method: "PUT",
        body: JSON.stringify({ message: `Kaffee: Foto für ${eintrag.name}`, branch: ZWEIG, content: foto }),
      });
    }
    meldung(formMeldung, "Eintrag wird gespeichert …");
    kaffees = bearbeitet
      ? await datenAendern(DATEN, (alle) => alle.some((k) => k.id === id)
        ? alle.map((k) => (k.id === id ? eintrag : k))
        : [...alle, eintrag], `Kaffee: ${eintrag.name} bearbeitet`)
      : await datenAendern(DATEN, (alle) => [...alle, eintrag], `Kaffee: ${eintrag.name} eingetragen`);
    if (altesBild) await fotoLoeschen(altesBild, `Kaffee: Foto von ${eintrag.name} gelöscht`);
    kaffeeDialog.close();
    zeigen();
  } catch (fehler) {
    meldung(formMeldung, speicherFehler(fehler), true);
  } finally {
    speichernKnopf.disabled = false;
  }
});

// Bearbeiten und Löschen
liste.addEventListener("click", async (e) => {
  const bearbeiten = e.target.closest(".kaffee-bearbeiten");
  if (bearbeiten) {
    const eintrag = kaffees.find((k) => k.id === bearbeiten.dataset.id);
    if (eintrag) formularOeffnen(eintrag);
    return;
  }
  const knopf = e.target.closest(".kaffee-loeschen");
  if (!knopf) return;
  const eintrag = kaffees.find((k) => k.id === knopf.dataset.id);
  if (!eintrag || !confirm(`„${eintrag.name}“ wirklich löschen?`)) return;

  knopf.disabled = true;
  knopf.textContent = "Wird gelöscht …";
  try {
    kaffees = await datenAendern(DATEN, (alle) => alle.filter((k) => k.id !== eintrag.id), `Kaffee: ${eintrag.name} gelöscht`);
    if (eintrag.bild) await fotoLoeschen(eintrag.bild, `Kaffee: Foto von ${eintrag.name} gelöscht`);
    zeigen();
  } catch (fehler) {
    knopf.disabled = false;
    knopf.textContent = "Löschen";
    alert(`Löschen fehlgeschlagen: ${fehler.message}`);
  }
});

laden();
