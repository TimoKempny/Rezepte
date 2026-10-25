// Kaffee-Seite: Liste aus assets/kaffee.json, neue Einträge über die GitHub-API
//
// Eintrag: { id, name, roester, rating (1–10), preisProKg, link, datum (JJJJ-MM-TT), bild, notiz,
//           profil: { aroma, saeure, suesse, koerper, bitterkeit, nachgeschmack } (je 1–5), noten: [...] }
// Fotos liegen in assets/bilder/kaffee/<id>.jpg
//
// Tasting-Profil nach dem SCA-Cupping-Formular (Aroma, Säure, Süße, Körper, Nachgeschmack; Bitterkeit
// als Gegenpol zur Süße), Geschmacksnoten nach den Hauptgruppen des SCA Coffee Taster's Flavor Wheel

const REPO = "TimoKempny/Rezepte";
const ZWEIG = "main";
const DATEN = "assets/kaffee.json";
const TOKEN_SCHLUESSEL = "github-token";
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

// ---------- GitHub ----------

function token() {
  return speicherLesen(TOKEN_SCHLUESSEL) || "";
}

async function github(pfad, optionen = {}, schluessel = token()) {
  const antwort = await fetch(`https://api.github.com/repos/${REPO}/contents/${pfad}`, {
    ...optionen,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${schluessel}`,
      ...(optionen.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  if (!antwort.ok) {
    const fehler = new Error(`GitHub antwortet mit ${antwort.status}`);
    fehler.status = antwort.status;
    throw fehler;
  }
  return antwort.status === 204 ? null : antwort.json();
}

function textZuBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binaer = "";
  bytes.forEach((b) => { binaer += String.fromCharCode(b); });
  return btoa(binaer);
}

function base64ZuText(base64) {
  const binaer = atob(base64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binaer, (z) => z.charCodeAt(0)));
}

async function datenLesenGithub() {
  const datei = await github(`${DATEN}?ref=${ZWEIG}`);
  return { eintraege: JSON.parse(base64ZuText(datei.content)), sha: datei.sha };
}

// Liest die Liste, ändert sie und schreibt sie zurück; bei gleichzeitiger Änderung ein zweiter Versuch
async function datenAendern(aendern, nachricht) {
  for (let versuch = 0; ; versuch++) {
    const { eintraege, sha } = await datenLesenGithub();
    const neu = aendern(eintraege);
    try {
      await github(DATEN, {
        method: "PUT",
        body: JSON.stringify({
          message: nachricht, branch: ZWEIG, sha,
          content: textZuBase64(JSON.stringify(neu, null, 2) + "\n"),
        }),
      });
      return neu;
    } catch (fehler) {
      if (versuch > 0 || (fehler.status !== 409 && fehler.status !== 422)) throw fehler;
    }
  }
}

// ---------- Laden und Anzeigen ----------

async function laden() {
  try {
    // Mit Token direkt aus dem Repository, dann sind neue Einträge sofort da (Pages braucht etwa eine Minute)
    if (token()) {
      kaffees = (await datenLesenGithub()).eintraege;
    } else {
      const antwort = await fetch(DATEN, { cache: "no-store" });
      kaffees = await antwort.json();
    }
  } catch {
    try {
      kaffees = await (await fetch(DATEN, { cache: "no-store" })).json();
    } catch {
      kaffees = [];
    }
  }
  zeigen();
}

function sortiert() {
  const art = sortierung.value;
  const kopie = kaffees.filter((k) => notenFilter.every((n) => (k.noten || []).includes(n)));
  const neueste = (a, b) => b.datum.localeCompare(a.datum);
  if (art === "rating") kopie.sort((a, b) => b.rating - a.rating || neueste(a, b));
  else if (art === "preis") kopie.sort((a, b) => a.preisProKg - b.preisProKg);
  else if (art === "preis-ab") kopie.sort((a, b) => b.preisProKg - a.preisProKg);
  else if (art === "name") kopie.sort((a, b) => a.name.localeCompare(b.name, "de"));
  else if (art === "alt") kopie.sort((a, b) => a.datum.localeCompare(b.datum));
  else if (art.startsWith("profil-")) {
    const wert = (k) => (k.profil || {})[art.slice(7)] || 0;
    kopie.sort((a, b) => wert(b) - wert(a) || b.rating - a.rating);
  } else kopie.sort(neueste);
  return kopie;
}

// Netzdiagramm mit sechs Achsen, Werte 1–5
function profilSVG(profil) {
  const mitte = 60, radius = 40;
  const punkt = (i, anteil) => {
    const winkel = -Math.PI / 2 + i * 2 * Math.PI / PROFIL.length;
    return [mitte + Math.cos(winkel) * radius * anteil, mitte + Math.sin(winkel) * radius * anteil];
  };
  const ring = (anteil) => PROFIL.map((_, i) => punkt(i, anteil).map((z) => z.toFixed(1)).join(",")).join(" ");
  const ringe = [0.2, 0.4, 0.6, 0.8, 1].map((a) => `<polygon class="netz" points="${ring(a)}"/>`).join("");
  const achsen = PROFIL.map((_, i) => `<line class="netz" x1="${mitte}" y1="${mitte}" x2="${punkt(i, 1)[0].toFixed(1)}" y2="${punkt(i, 1)[1].toFixed(1)}"/>`).join("");
  const werte = PROFIL.map((p, i) => punkt(i, (profil[p.schluessel] || 0) / 5).map((z) => z.toFixed(1)).join(",")).join(" ");
  const beschriftung = PROFIL.map((p, i) => {
    const [x, y] = punkt(i, 1.32);
    const anker = Math.abs(x - mitte) < 1 ? "middle" : x > mitte ? "start" : "end";
    return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anker}">${p.name}</text>`;
  }).join("");
  const text = PROFIL.map((p) => `${p.name} ${profil[p.schluessel] || "–"} von 5`).join(", ");
  return `<svg class="profil-netz" viewBox="-42 0 204 120" role="img" aria-label="Tasting-Profil: ${text}">
    ${ringe}${achsen}<polygon class="werte" points="${werte}"/>${beschriftung}
  </svg>`;
}

function datumText(iso) {
  const [j, m, t] = iso.split("-").map(Number);
  return new Date(j, m - 1, t).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

function sichererLink(adresse) {
  try {
    const url = new URL(adresse);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function karteHTML(k) {
  const link = k.link && sichererLink(k.link);
  const punkte = Array.from({ length: 10 }, (_, i) => `<i${i < k.rating ? ' class="voll"' : ""}></i>`).join("");
  return `<li class="kaffee-karte">
    <div class="kaffee-bild">
      <img src="${esc(k.bild)}" alt="Verpackung von ${esc(k.name)}" loading="lazy" data-roh="${esc(k.bild)}">
      <span class="kaffee-rating" title="Bewertung">${k.rating}<small>/10</small></span>
    </div>
    <div class="kaffee-text">
      <h2>${esc(k.name)}</h2>
      ${k.roester ? `<p class="kaffee-roester">${esc(k.roester)}</p>` : ""}
      <div class="rating-leiste" role="img" aria-label="${k.rating} von 10 Punkten">${punkte}</div>
      <dl class="kaffee-preise">
        <div class="preis-kg"><dt>1 kg</dt><dd>${euro.format(k.preisProKg)}</dd></div>
        ${PACKUNGEN.map((g) => `<div><dt>${g} g</dt><dd>${euro.format(k.preisProKg * g / 1000)}</dd></div>`).join("")}
      </dl>
      ${k.profil ? profilSVG(k.profil) : ""}
      ${k.noten && k.noten.length ? `<ul class="merkmale">${k.noten.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      ${k.notiz ? `<p class="kaffee-notiz">${esc(k.notiz)}</p>` : ""}
      <p class="kaffee-fuss">
        <span>Gekauft am ${esc(datumText(k.datum))}</span>
        ${link ? `<a href="${esc(link.href)}" target="_blank" rel="noopener">${esc(link.hostname.replace(/^www\./, ""))}</a>` : ""}
      </p>
      ${token() ? `<button type="button" class="textlink kaffee-loeschen" data-id="${esc(k.id)}">Löschen</button>` : ""}
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
  anzahl.innerHTML = notenFilter.length
    ? `<strong>${sichtbar.length}</strong> von ${kaffees.length} Kaffees`
    : `<strong>${kaffees.length}</strong> ${kaffees.length === 1 ? "Kaffee" : "Kaffees"}`;
  liste.innerHTML = sichtbar.length
    ? sichtbar.map(karteHTML).join("")
    : `<li class="leer"><h2>Kein Kaffee mit diesen Noten</h2><p>Nimm eine Geschmacksnote aus dem Filter heraus.</p></li>`;
}

// Neue Fotos sind auf GitHub Pages erst nach dem Veröffentlichen da, bis dahin direkt aus dem Repository
liste.addEventListener("error", (e) => {
  const bild = e.target;
  if (bild.tagName !== "IMG" || bild.dataset.versucht) return;
  bild.dataset.versucht = "1";
  bild.src = `https://raw.githubusercontent.com/${REPO}/${ZWEIG}/${bild.dataset.roh}`;
}, true);

sortierung.addEventListener("change", zeigen);

document.getElementById("sortierung-profil").innerHTML = PROFIL
  .map((p) => `<option value="profil-${p.schluessel}">${p.name}</option>`).join("");

const filterLeiste = document.getElementById("noten-filter");
filterLeiste.innerHTML = NOTEN
  .map((n) => `<button type="button" class="chip ohne-punkt" aria-pressed="false" data-note="${esc(n)}">${esc(n)}</button>`).join("");
filterLeiste.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const an = chip.getAttribute("aria-pressed") !== "true";
  chip.setAttribute("aria-pressed", String(an));
  notenFilter = an ? [...notenFilter, chip.dataset.note] : notenFilter.filter((n) => n !== chip.dataset.note);
  zeigen();
});

// ---------- Dialoge ----------

const kaffeeDialog = document.getElementById("kaffee-dialog");
const zugangDialog = document.getElementById("zugang-dialog");

document.querySelectorAll("[data-schliessen]").forEach((knopf) => {
  knopf.addEventListener("click", () => knopf.closest("dialog").close());
});

function meldung(element, text, fehler = false) {
  element.textContent = text;
  element.classList.toggle("fehler", fehler);
}

// Zugang
const zugangForm = document.getElementById("zugang-form");
const zugangMeldung = document.getElementById("zugang-meldung");
const tokenFeld = document.getElementById("z-token");

function zugangOeffnen(hinweis = "") {
  tokenFeld.value = token();
  meldung(zugangMeldung, hinweis);
  zugangDialog.showModal();
}

document.getElementById("zugang-knopf").addEventListener("click", () => zugangOeffnen());

document.getElementById("z-entfernen").addEventListener("click", () => {
  try { localStorage.removeItem(TOKEN_SCHLUESSEL); } catch { /* nichts gespeichert */ }
  tokenFeld.value = "";
  meldung(zugangMeldung, "Token aus diesem Browser entfernt.");
  zeigen();
});

zugangForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const neu = tokenFeld.value.trim();
  if (!neu) return;
  meldung(zugangMeldung, "Prüfe Zugang …");
  try {
    await github(`${DATEN}?ref=${ZWEIG}`, {}, neu);
    speicherSchreiben(TOKEN_SCHLUESSEL, neu);
    zugangDialog.close();
    laden();
  } catch (fehler) {
    meldung(zugangMeldung, fehler.status === 401 || fehler.status === 404
      ? "Der Token passt nicht oder hat keinen Zugriff auf das Repository."
      : "GitHub ist gerade nicht erreichbar.", true);
  }
});

// Neuer Kaffee
const form = document.getElementById("kaffee-form");
const formMeldung = document.getElementById("kaffee-meldung");
const preisFeld = document.getElementById("k-preis");
const mengeFeld = document.getElementById("k-menge");
const preisKgText = document.getElementById("k-preis-kg");
const ratingFeld = document.getElementById("k-rating");
const bildFeld = document.getElementById("k-bild");
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

ratingFeld.addEventListener("input", () => {
  document.getElementById("k-rating-wert").textContent = `${ratingFeld.value} / 10`;
});

bildFeld.addEventListener("change", () => {
  const datei = bildFeld.files[0];
  if (bildVorschau.src) URL.revokeObjectURL(bildVorschau.src);
  bildVorschau.hidden = !datei;
  if (datei) bildVorschau.src = URL.createObjectURL(datei);
});

document.getElementById("neu-knopf").addEventListener("click", () => {
  if (!token()) {
    zugangOeffnen("Zum Eintragen braucht dieser Browser zuerst einen Zugang.");
    return;
  }
  form.reset();
  document.getElementById("k-datum").value = new Date().toLocaleDateString("sv-SE");
  ratingFeld.dispatchEvent(new Event("input"));
  PROFIL.forEach((p) => document.getElementById(`k-${p.schluessel}-wert`).textContent = "3");
  bildVorschau.hidden = true;
  preisAnzeigen();
  meldung(formMeldung, "");
  kaffeeDialog.showModal();
});

// Foto verkleinern: längste Seite höchstens 1000 px, JPEG
function bildVerkleinern(datei) {
  return new Promise((fertig, abbruch) => {
    const bild = new Image();
    bild.onload = () => {
      const faktor = Math.min(1, 1000 / Math.max(bild.naturalWidth, bild.naturalHeight));
      const leinwand = document.createElement("canvas");
      leinwand.width = Math.round(bild.naturalWidth * faktor);
      leinwand.height = Math.round(bild.naturalHeight * faktor);
      leinwand.getContext("2d").drawImage(bild, 0, 0, leinwand.width, leinwand.height);
      URL.revokeObjectURL(bild.src);
      fertig(leinwand.toDataURL("image/jpeg", 0.8).split(",")[1]);
    };
    bild.onerror = () => abbruch(new Error("Das Foto lässt sich nicht lesen."));
    bild.src = URL.createObjectURL(datei);
  });
}

function kennung(name, datum) {
  const wort = name.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "kaffee";
  return `${wort}-${datum}-${Date.now().toString(36).slice(-4)}`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const daten = new FormData(form);
  const link = String(daten.get("link")).trim();
  if (link && !sichererLink(link)) {
    meldung(formMeldung, "Der Link muss mit http:// oder https:// beginnen.", true);
    return;
  }

  const datum = String(daten.get("datum"));
  const id = kennung(String(daten.get("name")), datum);
  const eintrag = {
    id,
    name: String(daten.get("name")).trim(),
    roester: String(daten.get("roester")).trim(),
    rating: Number(daten.get("rating")),
    preisProKg: preisProKg(),
    link,
    datum,
    bild: `assets/bilder/kaffee/${id}.jpg`,
    notiz: String(daten.get("notiz")).trim(),
    profil: Object.fromEntries(PROFIL.map((p) => [p.schluessel, Number(daten.get(p.schluessel))])),
    noten: daten.getAll("noten").map(String),
  };

  speichernKnopf.disabled = true;
  try {
    meldung(formMeldung, "Foto wird hochgeladen …");
    const foto = await bildVerkleinern(bildFeld.files[0]);
    await github(eintrag.bild, {
      method: "PUT",
      body: JSON.stringify({ message: `Kaffee: Foto für ${eintrag.name}`, branch: ZWEIG, content: foto }),
    });
    meldung(formMeldung, "Eintrag wird gespeichert …");
    kaffees = await datenAendern((alle) => [...alle, eintrag], `Kaffee: ${eintrag.name} eingetragen`);
    kaffeeDialog.close();
    zeigen();
  } catch (fehler) {
    meldung(formMeldung, fehler.status === 401
      ? "Der Token ist ungültig oder abgelaufen. Bitte unter „GitHub-Zugang“ neu hinterlegen."
      : `Speichern fehlgeschlagen: ${fehler.message}`, true);
  } finally {
    speichernKnopf.disabled = false;
  }
});

// Löschen
liste.addEventListener("click", async (e) => {
  const knopf = e.target.closest(".kaffee-loeschen");
  if (!knopf) return;
  const eintrag = kaffees.find((k) => k.id === knopf.dataset.id);
  if (!eintrag || !confirm(`„${eintrag.name}“ wirklich löschen?`)) return;

  knopf.disabled = true;
  knopf.textContent = "Wird gelöscht …";
  try {
    kaffees = await datenAendern((alle) => alle.filter((k) => k.id !== eintrag.id), `Kaffee: ${eintrag.name} gelöscht`);
    try {
      const foto = await github(`${eintrag.bild}?ref=${ZWEIG}`);
      await github(eintrag.bild, {
        method: "DELETE",
        body: JSON.stringify({ message: `Kaffee: Foto von ${eintrag.name} gelöscht`, branch: ZWEIG, sha: foto.sha }),
      });
    } catch {
      // Eintrag ist weg, ein übrig gebliebenes Foto stört nicht
    }
    zeigen();
  } catch (fehler) {
    knopf.disabled = false;
    knopf.textContent = "Löschen";
    alert(`Löschen fehlgeschlagen: ${fehler.message}`);
  }
});

laden();
