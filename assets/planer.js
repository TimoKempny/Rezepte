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
  zweiTage: document.getElementById("zwei-tage"),
  zweiTageWert: document.getElementById("zwei-tage-wert"),
  kategorien: document.getElementById("plan-kategorien"),
  abwechslung: document.getElementById("abwechslung"),
  woche: document.getElementById("woche"),
};

// plan: { [tagIndex]: { id: string | null, fest: boolean, reste?: tagIndex } }
// Ein Eintrag mit "reste" ist ein Reste-Tag: Er übernimmt Rezept und Festhalten vom Tag, an dem doppelt gekocht wird.
let plan = null;
let meldung = "";

const rezeptMitId = (id) => rezepte.find((r) => r.id === id) || null;

const geplanteTage = () => (plan ? Object.keys(plan).map(Number).sort((a, b) => a - b) : []);
const naechsterTag = (tag) => geplanteTage().find((t) => t > tag);
// Reste-Tag, der zu einem Kochtag gehört (oder undefined)
const resteVon = (tag) => geplanteTage().find((t) => plan[t].reste === tag);

// Reste-Tage an ihren Kochtag angleichen; verwaiste Reste werden zu normalen Tagen
function resteAbgleichen() {
  for (const t of geplanteTage()) {
    const e = plan[t];
    if (e.reste === undefined) continue;
    const quelle = plan[e.reste];
    if (quelle && quelle.reste === undefined && quelle.id) {
      e.id = quelle.id;
      e.fest = quelle.fest;
    } else {
      delete e.reste;
    }
  }
}

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
    zweiTage: Number(el.zweiTage.value),
    abwechslung: el.abwechslung.checked,
  };
}

function kriterienSetzen(k) {
  for (const box of el.tage.querySelectorAll("input")) box.checked = k.tage.includes(Number(box.value));
  el.zeitWoche.value = k.zeitWoche;
  el.zeitWochenende.value = k.zeitWochenende;
  el.schwierigkeit.value = k.schwierigkeit;
  el.fleischfrei.value = k.fleischfrei;
  if (k.zweiTage !== undefined) el.zweiTage.value = k.zweiTage;
  el.abwechslung.checked = k.abwechslung;
  for (const b of el.kategorien.children) b.setAttribute("aria-pressed", String(k.kategorien.includes(b.dataset.wert)));
}

function reglerAnzeigen() {
  const n = Number(el.fleischfrei.value);
  el.fleischfreiWert.textContent = n === 0 ? "keine Vorgabe" : n;
  const z = Number(el.zweiTage.value);
  el.zweiTageWert.textContent = z === 0 ? "keine" : z;
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

// Kategorien der direkt benachbarten geplanten Tage (die eigenen Reste zählen nicht)
function nachbarKategorien(tag, k, aktuellerPlan) {
  const index = k.tage.indexOf(tag);
  return [k.tage[index - 1], k.tage[index + 1]]
    .map((t) => t !== undefined && aktuellerPlan[t] && aktuellerPlan[t].reste !== tag && rezeptMitId(aktuellerPlan[t].id))
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

  // Festgehaltene Tage (und ihre Reste) bleiben
  for (const tag of k.tage) {
    const alt = plan && plan[tag];
    if (alt && alt.fest && rezeptMitId(alt.id)) {
      neu[tag] = { ...alt };
      benutzt.add(alt.id);
      if (istFleischfrei(rezeptMitId(alt.id))) fleischfreiFest++;
    }
  }
  for (const tag of Object.keys(neu).map(Number)) {
    if (neu[tag].reste !== undefined && !neu[neu[tag].reste]) delete neu[tag].reste;
  }

  // Paare aus Kochtag und Reste-Tag: zwei direkt aufeinanderfolgende geplante Tage
  const offen = new Set(k.tage.filter((t) => !neu[t]));
  const vorhandenePaare = Object.values(neu).filter((e) => e.reste !== undefined).length;
  const resteFuer = new Map();
  for (const tag of mischen(k.tage.slice(0, -1))) {
    if (resteFuer.size >= k.zweiTage - vorhandenePaare) break;
    const folgetag = k.tage[k.tage.indexOf(tag) + 1];
    const frei = (t) => offen.has(t) && !resteFuer.has(t) && ![...resteFuer.values()].includes(t);
    if (frei(tag) && frei(folgetag)) resteFuer.set(tag, folgetag);
  }
  const fehlendePaare = Math.max(0, k.zweiTage - vorhandenePaare - resteFuer.size);

  // Kochtage, für die ein Rezept gewählt wird; ein Paar zählt doppelt für die fleischfreien Tage
  const kochtage = k.tage.filter((t) => offen.has(t) && ![...resteFuer.values()].includes(t));
  let benoetigt = Math.max(0, Math.min(k.fleischfrei, k.tage.length) - fleischfreiFest);
  const fleischfreiTage = new Set();
  for (const tag of mischen(kochtage)) {
    if (benoetigt <= 0) break;
    fleischfreiTage.add(tag);
    benoetigt -= resteFuer.has(tag) ? 2 : 1;
  }

  let leer = 0;
  let doppelt = 0;
  for (const tag of kochtage) {
    let pool = kandidaten(tag, k, fleischfreiTage.has(tag));
    if (resteFuer.has(tag) && pool.some((r) => r.zweiTage)) pool = pool.filter((r) => r.zweiTage);
    const meiden = k.abwechslung ? nachbarKategorien(tag, k, neu) : [];
    const wahl = auswaehlen(pool, benutzt, meiden);
    neu[tag] = { id: wahl.rezept ? wahl.rezept.id : null, fest: false };
    if (wahl.rezept) {
      benutzt.add(wahl.rezept.id);
      if (resteFuer.has(tag)) neu[resteFuer.get(tag)] = { id: wahl.rezept.id, fest: false, reste: tag };
    } else {
      leer++;
      if (resteFuer.has(tag)) neu[resteFuer.get(tag)] = { id: null, fest: false };
    }
    if (wahl.doppelt) doppelt++;
  }

  plan = neu;
  meldung = meldungBauen(k, leer, doppelt, fehlendePaare);
  speichern(k);
  anzeigen();
}

function meldungBauen(k, leer, doppelt, fehlendePaare = 0) {
  if (!k.tage.length) return "";
  if (fehlendePaare) return `Für ${fehlendePaare === 1 ? "ein Gericht" : `${fehlendePaare} Gerichte`} für zwei Tage fehlen aufeinanderfolgende freie Tage. Wähle mehr Kochtage aus oder löse festgehaltene Tage.`;
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
  } else if (plan[tag].reste !== undefined) {
    // Reste-Tag ohne Alternative: bleibt beim Rezept, kocht aber selbst
    delete plan[tag].reste;
    meldung = `Für ${TAGE[tag].lang} gibt es keine andere passende Alternative.`;
  } else {
    meldung = `Für ${TAGE[tag].lang} gibt es keine andere passende Alternative.`;
  }
  resteAbgleichen();
  speichern(k);
  anzeigen();
}

// Kochtag doppelt kochen: der nächste geplante Tag wird zum Reste-Tag (oder wieder zurück)
function zweiTageUmschalten(tag) {
  const folgetag = naechsterTag(tag);
  if (folgetag === undefined) return;
  if (plan[folgetag].reste === tag) {
    neuWuerfeln(folgetag);
    return;
  }
  if (plan[folgetag].fest) {
    meldung = `${TAGE[folgetag].lang} ist festgehalten. Löse den Tag, um dort Reste einzuplanen.`;
    anzeigen();
    return;
  }
  // War der Folgetag selbst ein Kochtag für zwei Tage, werden dessen Reste frei
  const alteReste = resteVon(folgetag);
  plan[folgetag] = { id: plan[tag].id, fest: plan[tag].fest, reste: tag };
  meldung = "";
  if (alteReste !== undefined) {
    neuWuerfeln(alteReste);
    return;
  }
  speichern(kriterienLesen());
  anzeigen();
}

function festhalten(tag) {
  plan[tag].fest = !plan[tag].fest;
  resteAbgleichen();
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
  const name = `<div class="tag-name">${t.kurz}<small>${t.lang}</small><span class="tag-datum">${datumVon(tag, { day: "numeric", month: "long" })}</span></div>`;

  if (!r) {
    return `<article class="tag tag-leer">
      ${name}
      <div class="teller"><span>?</span></div>
      <div class="tag-info"><h3>Kein passendes Rezept</h3><p>Lockere die Kriterien links.</p></div>
      <div class="tag-aktion"><button type="button" class="knopf zweit klein" data-aktion="wuerfeln" data-tag="${tag}">Neu würfeln</button></div>
    </article>`;
  }

  if (eintrag.reste !== undefined) {
    return `<article class="tag reste">
      ${name}
      ${tellerHTML(r)}
      <div class="tag-info">
        <h3>Reste: <a href="${esc(r.seite)}">${esc(r.titel)}</a></h3>
        <p class="tag-hinweis">Vom ${TAGE[eintrag.reste].lang}, dort die doppelte Menge kochen.</p>
      </div>
      <div class="tag-aktion">
        <button type="button" class="knopf zweit klein" data-aktion="wuerfeln" data-tag="${tag}" ${eintrag.fest ? "disabled" : ""}>Neu würfeln</button>
      </div>
    </article>`;
  }

  const folgetag = naechsterTag(tag);
  const zweiTage = folgetag !== undefined && plan[folgetag].reste === tag;
  const portionen = zweiTage ? r.portionen * 2 : r.portionen;
  const link = zweiTage ? `${r.seite}?portionen=${portionen}` : r.seite;

  const merkmale = [`<li>${formatZeit(r.zeit)}</li>`, `<li>${esc(r.kategorie)}</li>`];
  if (istFleischfrei(r)) merkmale.push(`<li>${esc(r.ernaehrung)}</li>`);
  if (zweiTage) merkmale.push(`<li class="zwei-tage">für 2 Tage</li>`);
  merkmale.push(`<li class="nur-druck">${portionen} Portionen</li>`);

  let zweiTageKnopf = "";
  if (folgetag !== undefined) {
    const gesperrt = !zweiTage && (plan[folgetag].fest || eintrag.fest);
    const titel = gesperrt ? `${eintrag.fest ? TAGE[tag].lang : TAGE[folgetag].lang} ist festgehalten` : `Doppelte Menge kochen, am ${TAGE[folgetag].lang} gibt es Reste`;
    zweiTageKnopf = `<button type="button" class="knopf zweit klein" data-aktion="zwei-tage" data-tag="${tag}" aria-pressed="${zweiTage}" title="${titel}" ${gesperrt ? "disabled" : ""}>Für 2 Tage</button>`;
  }

  return `<article class="tag${eintrag.fest ? " fest" : ""}">
    ${name}
    ${tellerHTML(r)}
    <div class="tag-info">
      <h3><a href="${esc(link)}">${esc(r.titel)}</a></h3>
      <p class="tag-beschreibung">${esc(r.beschreibung)}</p>
      <ul class="merkmale">${merkmale.join("")}</ul>
    </div>
    <div class="tag-aktion">
      ${zweiTageKnopf}
      <button type="button" class="knopf zweit klein" data-aktion="festhalten" data-tag="${tag}" aria-pressed="${eintrag.fest}">${eintrag.fest ? "Festgehalten" : "Festhalten"}</button>
      <button type="button" class="knopf zweit klein" data-aktion="wuerfeln" data-tag="${tag}" ${eintrag.fest ? "disabled" : ""}>Neu würfeln</button>
    </div>
  </article>`;
}

function anzeigen() {
  const tage = geplanteTage();

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
el.fleischfrei.addEventListener("input", reglerAnzeigen);
el.zweiTage.addEventListener("input", reglerAnzeigen);
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
    case "zwei-tage": zweiTageUmschalten(tag); break;
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
reglerAnzeigen();
anzeigen();
