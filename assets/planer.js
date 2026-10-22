// Wochenplaner: stellt nach Kriterien einen Kochplan aus der Rezeptliste zusammen

const rezepte = window.REZEPTE;
const SPEICHER = "wochenplan-v1";

const TAGE = [
  { kurz: "Mo", lang: "Montag" },
  { kurz: "Di", lang: "Dienstag" },
  { kurz: "Mi", lang: "Mittwoch" },
  { kurz: "Do", lang: "Donnerstag" },
  { kurz: "Fr", lang: "Freitag" },
  { kurz: "Sa", lang: "Samstag", wochenende: true },
  { kurz: "So", lang: "Sonntag", wochenende: true },
];

const el = {
  form: document.getElementById("kriterien"),
  tage: document.getElementById("tage"),
  zeitWoche: document.getElementById("zeit-woche"),
  zeitWochenende: document.getElementById("zeit-wochenende"),
  schwierigkeit: document.getElementById("schwierigkeit-woche"),
  fleischfrei: document.getElementById("fleischfrei"),
  fleischfreiWert: document.getElementById("fleischfrei-wert"),
  kategorien: document.getElementById("plan-kategorien"),
  abwechslung: document.getElementById("abwechslung"),
  woche: document.getElementById("woche"),
};

// plan: { [tagIndex]: { id: string | null, fest: boolean } }
let plan = null;
let meldung = "";

const rezeptMitId = (id) => rezepte.find((r) => r.id === id) || null;

function mischen(liste) {
  const kopie = [...liste];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

// ---------- Formular ----------

function formularAufbauen() {
  el.tage.innerHTML = TAGE.map((t, i) => `
    <label class="tag-wahl" title="${t.lang}">
      <input type="checkbox" value="${i}" checked>
      <span>${t.kurz}</span>
    </label>`).join("");

  const vorhanden = Object.keys(window.KATEGORIEN).filter((k) => rezepte.some((r) => r.kategorie === k));
  el.kategorien.innerHTML = vorhanden.map((k) =>
    `<button type="button" class="chip" data-wert="${esc(k)}" aria-pressed="true" style="--punkt:${window.KATEGORIEN[k]}">${esc(k)}</button>`).join("");
}

function kriterienLesen() {
  return {
    tage: [...el.tage.querySelectorAll("input:checked")].map((i) => Number(i.value)),
    zeitWoche: Number(el.zeitWoche.value),
    zeitWochenende: Number(el.zeitWochenende.value),
    schwierigkeit: el.schwierigkeit.value,
    fleischfrei: Number(el.fleischfrei.value),
    kategorien: [...el.kategorien.querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.wert),
    abwechslung: el.abwechslung.checked,
  };
}

function kriterienSetzen(k) {
  for (const box of el.tage.querySelectorAll("input")) box.checked = k.tage.includes(Number(box.value));
  el.zeitWoche.value = k.zeitWoche;
  el.zeitWochenende.value = k.zeitWochenende;
  el.schwierigkeit.value = k.schwierigkeit;
  el.fleischfrei.value = k.fleischfrei;
  el.abwechslung.checked = k.abwechslung;
  for (const b of el.kategorien.children) b.setAttribute("aria-pressed", String(k.kategorien.includes(b.dataset.wert)));
}

function fleischfreiAnzeigen() {
  const n = Number(el.fleischfrei.value);
  el.fleischfreiWert.textContent = n === 0 ? "keine Vorgabe" : n;
}

// ---------- Auswahl ----------

function kandidaten(tag, k, nurFleischfrei) {
  const wochenende = TAGE[tag].wochenende;
  const maxZeit = wochenende ? k.zeitWochenende : k.zeitWoche;
  const maxStufe = wochenende ? SCHWIERIGKEITEN.length - 1 : SCHWIERIGKEITEN.indexOf(k.schwierigkeit);
  return rezepte.filter((r) =>
    r.zeit <= maxZeit &&
    SCHWIERIGKEITEN.indexOf(r.schwierigkeit) <= maxStufe &&
    k.kategorien.includes(r.kategorie) &&
    (!nurFleischfrei || istFleischfrei(r)));
}

// Kategorien der direkt benachbarten geplanten Tage
function nachbarKategorien(tag, k, aktuellerPlan) {
  const index = k.tage.indexOf(tag);
  return [k.tage[index - 1], k.tage[index + 1]]
    .map((t) => t !== undefined && aktuellerPlan[t] && rezeptMitId(aktuellerPlan[t].id))
    .filter(Boolean)
    .map((r) => r.kategorie);
}

// Wählt ein Rezept und lockert Abwechslung und Doppelungen nur, wenn nötig
function auswaehlen(pool, vermeideIds, vermeideKategorien) {
  const stufen = [
    pool.filter((r) => !vermeideIds.has(r.id) && !vermeideKategorien.includes(r.kategorie)),
    pool.filter((r) => !vermeideIds.has(r.id)),
    pool.filter((r) => !vermeideKategorien.includes(r.kategorie)),
    pool,
  ];
  const stufe = stufen.find((s) => s.length);
  if (!stufe) return { rezept: null, doppelt: false };
  const rezept = zufall(stufe);
  return { rezept, doppelt: vermeideIds.has(rezept.id) };
}

function erstellen() {
  const k = kriterienLesen();
  const neu = {};
  const benutzt = new Set();
  let fleischfreiFest = 0;

  for (const tag of k.tage) {
    const alt = plan && plan[tag];
    if (alt && alt.fest && rezeptMitId(alt.id)) {
      neu[tag] = { ...alt };
      benutzt.add(alt.id);
      if (istFleischfrei(rezeptMitId(alt.id))) fleischfreiFest++;
    }
  }

  const offen = k.tage.filter((t) => !neu[t]);
  const benoetigt = Math.max(0, Math.min(k.fleischfrei, k.tage.length) - fleischfreiFest);
  const fleischfreiTage = new Set(mischen(offen).slice(0, benoetigt));

  let leer = 0;
  let doppelt = 0;
  for (const tag of offen) {
    const pool = kandidaten(tag, k, fleischfreiTage.has(tag));
    const meiden = k.abwechslung ? nachbarKategorien(tag, k, neu) : [];
    const wahl = auswaehlen(pool, benutzt, meiden);
    neu[tag] = { id: wahl.rezept ? wahl.rezept.id : null, fest: false };
    if (wahl.rezept) benutzt.add(wahl.rezept.id); else leer++;
    if (wahl.doppelt) doppelt++;
  }

  plan = neu;
  meldung = meldungBauen(k, leer, doppelt);
  speichern(k);
  anzeigen();
}

function meldungBauen(k, leer, doppelt) {
  if (!k.tage.length) return "";
  if (leer) return `Für ${leer === 1 ? "einen Tag" : `${leer} Tage`} passt kein Rezept. Erhöhe die Kochzeit, erlaube mehr Kategorien oder senke die Zahl der fleischfreien Tage.`;
  if (doppelt) return "Es gibt nicht genug passende Rezepte für die ganze Woche, deshalb kommen manche doppelt vor.";
  return "";
}

function neuWuerfeln(tag) {
  const k = kriterienLesen();
  const aktuell = rezeptMitId(plan[tag].id);
  const fleischfreiImPlan = Object.values(plan).filter((e) => istFleischfrei(rezeptMitId(e.id) || {})).length;
  const mussFleischfrei = aktuell && istFleischfrei(aktuell) && fleischfreiImPlan <= k.fleischfrei;

  const andere = new Set(Object.entries(plan).filter(([t]) => Number(t) !== tag).map(([, e]) => e.id));
  const pool = kandidaten(tag, k, mussFleischfrei).filter((r) => !aktuell || r.id !== aktuell.id);
  const meiden = k.abwechslung ? nachbarKategorien(tag, k, plan) : [];
  const wahl = auswaehlen(pool, andere, meiden);

  if (wahl.rezept) {
    plan[tag] = { id: wahl.rezept.id, fest: false };
    meldung = "";
  } else {
    meldung = `Für ${TAGE[tag].lang} gibt es keine andere passende Alternative.`;
  }
  speichern(k);
  anzeigen();
}

function festhalten(tag) {
  plan[tag].fest = !plan[tag].fest;
  speichern(kriterienLesen());
  anzeigen();
}

// ---------- Anzeige ----------

// Montag der Woche, für die geplant wird: heute, wenn Montag ist, sonst der kommende
function wochenstart() {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  heute.setDate(heute.getDate() + ((8 - heute.getDay()) % 7));
  return heute;
}

function datumVon(tag, format) {
  const d = wochenstart();
  d.setDate(d.getDate() + tag);
  return d.toLocaleDateString("de-DE", format);
}

function tagHTML(tag) {
  const eintrag = plan[tag];
  const t = TAGE[tag];
  const r = rezeptMitId(eintrag.id);

  if (!r) {
    return `<article class="tag tag-leer">
      <div class="tag-name">${t.kurz}<small>${t.lang}</small><span class="tag-datum">${datumVon(tag, { day: "numeric", month: "long" })}</span></div>
      <div class="teller"><span>?</span></div>
      <div class="tag-info"><h3>Kein passendes Rezept</h3><p>Lockere die Kriterien links.</p></div>
      <div class="tag-aktion"><button type="button" class="knopf zweit klein" data-aktion="wuerfeln" data-tag="${tag}">Neu würfeln</button></div>
    </article>`;
  }

  const merkmale = [`<li>${formatZeit(r.zeit)}</li>`, `<li>${esc(r.kategorie)}</li>`];
  if (istFleischfrei(r)) merkmale.push(`<li class="gruen">${esc(r.ernaehrung)}</li>`);

  return `<article class="tag${eintrag.fest ? " fest" : ""}">
    <div class="tag-name">${t.kurz}<small>${t.lang}</small><span class="tag-datum">${datumVon(tag, { day: "numeric", month: "long" })}</span></div>
    ${tellerHTML(r)}
    <div class="tag-info">
      <h3><a href="${esc(r.seite)}">${esc(r.titel)}</a></h3>
      <p class="tag-beschreibung">${esc(r.beschreibung)}</p>
      <ul class="merkmale">${merkmale.join("")}<li class="nur-druck">${r.portionen} Portionen</li></ul>
    </div>
    <div class="tag-aktion">
      <button type="button" class="knopf zweit klein" data-aktion="festhalten" data-tag="${tag}" aria-pressed="${eintrag.fest}">${eintrag.fest ? "Festgehalten" : "Festhalten"}</button>
      <button type="button" class="knopf zweit klein" data-aktion="wuerfeln" data-tag="${tag}" ${eintrag.fest ? "disabled" : ""}>Neu würfeln</button>
    </div>
  </article>`;
}

function anzeigen() {
  const tage = plan ? Object.keys(plan).map(Number).sort((a, b) => a - b) : [];

  if (!tage.length) {
    el.woche.innerHTML = `<div class="woche-start">
      <div class="teller" style="--speise:var(--linie);width:6rem" aria-hidden="true"></div>
      <p>${plan ? "Wähle mindestens einen Tag aus." : "Stell links ein, was zu deiner Woche passt, und erstelle den Plan."}</p>
    </div>`;
    return;
  }

  // Nur im Druck sichtbar: Kopf mit Zeitraum und Fußzeile mit Adresse der Seite
  const zeitraum = `${datumVon(0, { day: "numeric", month: "long" })} bis ${datumVon(6, { day: "numeric", month: "long", year: "numeric" })}`;
  const adresse = location.protocol.startsWith("http") ? location.host + location.pathname.replace(/planer\.html$/, "") : "";

  el.woche.innerHTML = `
    <header class="druck-kopf"><h2>Wochenplan</h2><p>${zeitraum}</p></header>
    <div class="woche-aktionen">
      <h2>Deine Woche</h2>
      <div>
        <button type="button" class="knopf zweit klein" data-aktion="drucken">Drucken / PDF</button>
        <button type="button" class="knopf zweit klein" data-aktion="leeren">Plan leeren</button>
      </div>
    </div>
    ${meldung ? `<p class="woche-meldung">${esc(meldung)}</p>` : ""}
    ${tage.map(tagHTML).join("")}
    ${adresse ? `<p class="druck-fuss">Alle Rezepte: ${esc(adresse)}</p>` : ""}`;
}

// ---------- Speicher ----------

function speichern(k) {
  speicherSchreiben(SPEICHER, { kriterien: k, plan });
}

function laden() {
  const gespeichert = speicherLesen(SPEICHER);
  if (!gespeichert) return;
  if (gespeichert.kriterien) kriterienSetzen(gespeichert.kriterien);
  if (gespeichert.plan) plan = gespeichert.plan;
}

// ---------- Ereignisse ----------

el.form.addEventListener("submit", (e) => { e.preventDefault(); erstellen(); });
el.fleischfrei.addEventListener("input", fleischfreiAnzeigen);
el.kategorien.addEventListener("click", (e) => {
  const knopf = e.target.closest("button");
  if (!knopf) return;
  knopf.setAttribute("aria-pressed", String(knopf.getAttribute("aria-pressed") !== "true"));
});
el.woche.addEventListener("click", (e) => {
  const knopf = e.target.closest("button[data-aktion]");
  if (!knopf) return;
  const tag = Number(knopf.dataset.tag);
  switch (knopf.dataset.aktion) {
    case "wuerfeln": neuWuerfeln(tag); break;
    case "festhalten": festhalten(tag); break;
    case "drucken": window.print(); break;
    case "leeren":
      plan = null;
      meldung = "";
      speichern(kriterienLesen());
      anzeigen();
      break;
  }
});

formularAufbauen();
laden();
fleischfreiAnzeigen();
anzeigen();
