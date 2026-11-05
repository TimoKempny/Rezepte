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

// Vorgaben je Kochtag; die Regler heißen wie der Schlüssel (#fleisch, #fisch, #fleischfrei)
const ARTEN = [
  { schluessel: "fleisch", name: "Fleisch", passt: (r) => r.ernaehrung === "fleisch" },
  { schluessel: "fisch", name: "Fisch", passt: (r) => r.ernaehrung === "fisch" },
  { schluessel: "fleischfrei", name: "fleischfrei", passt: istFleischfrei },
];
const artVon = (r) => (r ? ARTEN.find((a) => a.passt(r)) : undefined);
const ARTEN_MAX = 7;

// Zusätze, die man zu jedem Tag dazunehmen kann (Reihenfolge wie beim Essen).
// Salat: Salate aus „Beilagen & Salate“ oder Blattsalat mit einer Salatsoße.
// skaliert: true, wenn sich die Menge nach „Portionen pro Mahlzeit“ richtet (Brot und Kuchen bleiben wie im Rezept).
const EXTRAS = [
  { art: "salat", name: "Salat",
    passt: (r) => (r.kategorie === "Beilagen & Salate" && /salat/i.test(r.titel) && r.ernaehrung !== "fleisch") || r.kategorie === "Salatsoßen",
    skaliert: () => true },
  { art: "brot", name: "Brot", passt: (r) => r.kategorie === "Brot & Brötchen", skaliert: () => false },
  { art: "nachtisch", name: "Nachtisch", passt: (r) => r.kategorie === "Nachtisch" || r.kategorie === "Süßgebäck",
    skaliert: (r) => r.kategorie === "Nachtisch" },
];
const extraTitel = (r) => (r.kategorie === "Salatsoßen" ? `Blattsalat mit ${r.titel}` : r.titel);

// Erhöhen, wenn sich die Standardauswahl ändert: gespeicherte Kategorien werden dann einmal verworfen
const KATEGORIEN_STAND = 4;

const el = {
  form: document.getElementById("kriterien"),
  tage: document.getElementById("tage"),
  zeitWoche: document.getElementById("zeit-woche"),
  zeitWochenende: document.getElementById("zeit-wochenende"),
  schwierigkeit: document.getElementById("schwierigkeit-woche"),
  arten: Object.fromEntries(ARTEN.map((a) => [a.schluessel, {
    regler: document.getElementById(a.schluessel),
    wert: document.getElementById(`${a.schluessel}-wert`),
  }])),
  artenHinweis: document.getElementById("arten-hinweis"),
  zweiTage: document.getElementById("zwei-tage"),
  zweiTageWert: document.getElementById("zwei-tage-wert"),
  portionen: document.getElementById("portionen"),
  kategorien: document.getElementById("plan-kategorien"),
  abwechslung: document.getElementById("abwechslung"),
  woche: document.getElementById("woche"),
  teilenDialog: document.getElementById("teilen-dialog"),
  teilenWhatsapp: document.getElementById("teilen-whatsapp"),
  teilenMail: document.getElementById("teilen-mail"),
  teilenKopieren: document.getElementById("teilen-kopieren"),
};

// plan: { [tagIndex]: { id: string | null, fest: boolean, reste?: tagIndex, extras?: { salat?: id, brot?: id, nachtisch?: id } } }
// Ein Eintrag mit "reste" ist ein Reste-Tag: Er übernimmt Rezept und Festhalten vom Tag, an dem doppelt gekocht wird.
let plan = null;
let meldung = "";
// Schlüssel der abgehakten Zeilen der Einkaufsliste
let abgehakt = new Set();

const rezeptMitId = (id) => rezepte.find((r) => r.id === id) || null;
// Link zur Rezeptseite, bei abweichender Portionenzahl mit ?portionen=… (seite kann schon ?variante=… enthalten)
const rezeptLink = (r, portionen) =>
  portionen && portionen !== r.portionen ? `${r.seite}${r.seite.includes("?") ? "&" : "?"}portionen=${portionen}` : r.seite;

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
    `<button type="button" class="chip" data-wert="${esc(k)}" aria-pressed="${!KEIN_HAUPTGERICHT.includes(k)}" style="--punkt:${window.KATEGORIEN[k]}">${esc(k)}</button>`).join("");
}

function kriterienLesen() {
  return {
    tage: [...el.tage.querySelectorAll("input:checked")].map((i) => Number(i.value)),
    portionen: Number(el.portionen.value),
    zeitWoche: Number(el.zeitWoche.value),
    zeitWochenende: Number(el.zeitWochenende.value),
    schwierigkeit: el.schwierigkeit.value,
    ...Object.fromEntries(ARTEN.map((a) => [a.schluessel, Number(el.arten[a.schluessel].regler.value)])),
    kategorien: [...el.kategorien.querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.wert),
    kategorienStand: KATEGORIEN_STAND,
    zweiTage: Number(el.zweiTage.value),
    abwechslung: el.abwechslung.checked,
  };
}

function kriterienSetzen(k) {
  for (const box of el.tage.querySelectorAll("input")) box.checked = k.tage.includes(Number(box.value));
  if (k.portionen !== undefined) el.portionen.value = k.portionen;
  el.zeitWoche.value = k.zeitWoche;
  el.zeitWochenende.value = k.zeitWochenende;
  el.schwierigkeit.value = k.schwierigkeit;
  for (const a of ARTEN) if (k[a.schluessel] !== undefined) el.arten[a.schluessel].regler.value = k[a.schluessel];
  if (k.zweiTage !== undefined) el.zweiTage.value = k.zweiTage;
  el.abwechslung.checked = k.abwechslung;
  // Ältere gespeicherte Auswahl (vor der aktuellen Standardauswahl) nicht übernehmen
  if (k.kategorienStand === KATEGORIEN_STAND) {
    for (const b of el.kategorien.children) b.setAttribute("aria-pressed", String(k.kategorien.includes(b.dataset.wert)));
  }
}

// Zusammen höchstens eine Woche: Wird ein Regler erhöht, geben die anderen nach (der größte zuerst)
function artenBegrenzen(geaendert) {
  const regler = ARTEN.map((a) => el.arten[a.schluessel].regler);
  let ueber = regler.reduce((n, r) => n + Number(r.value), 0) - ARTEN_MAX;
  while (ueber > 0) {
    const andere = regler.filter((r) => r !== geaendert && Number(r.value) > 0);
    if (!andere.length) break;
    const groesster = andere.reduce((a, b) => (Number(b.value) > Number(a.value) ? b : a));
    groesster.value = Number(groesster.value) - 1;
    ueber--;
  }
}

function reglerAnzeigen() {
  let summe = 0;
  for (const a of ARTEN) {
    const n = Number(el.arten[a.schluessel].regler.value);
    el.arten[a.schluessel].wert.textContent = n === 0 ? "keine Vorgabe" : `mind. ${n}`;
    summe += n;
  }
  const tage = el.tage.querySelectorAll("input:checked").length;
  el.artenHinweis.textContent =
    !summe || !tage ? "Ohne Vorgabe ist an den Tagen alles erlaubt."
    : summe > tage ? `Mehr Vorgaben als Kochtage (${tage}). Sie werden reihum verteilt.`
    : summe === tage ? "Damit ist jeder Kochtag festgelegt."
    : `${tage - summe} von ${tage} Kochtagen ohne Vorgabe.`;
  const z = Number(el.zweiTage.value);
  el.zweiTageWert.textContent = z === 0 ? "keine" : z;
}

// ---------- Auswahl ----------

// art: Eintrag aus ARTEN oder undefined (keine Vorgabe)
function kandidaten(tag, k, art) {
  const wochenende = TAGE[tag].wochenende;
  const maxZeit = wochenende ? k.zeitWochenende : k.zeitWoche;
  const maxStufe = wochenende ? SCHWIERIGKEITEN.length - 1 : SCHWIERIGKEITEN.indexOf(k.schwierigkeit);
  return rezepte.filter((r) =>
    r.zeit <= maxZeit &&
    SCHWIERIGKEITEN.indexOf(r.schwierigkeit) <= maxStufe &&
    k.kategorien.includes(r.kategorie) &&
    (!art || art.passt(r)));
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

// ---------- Zusätze (Salat, Brot, Nachtisch) ----------

// IDs eines Zusatzes, die in der Woche schon vorkommen (außer an einem Tag)
function extraIdsInWoche(art, aktuellerPlan, ausserTag) {
  return new Set(Object.entries(aktuellerPlan || {})
    .filter(([t, e]) => Number(t) !== ausserTag && e.extras && e.extras[art])
    .map(([, e]) => e.extras[art]));
}

// Zufälliger Zusatz; meidet Doppelungen in der Woche, solange es geht, und nie das bisherige Rezept
function extraWaehlen(art, vermeiden, bisher) {
  const pool = rezepte.filter(EXTRAS.find((x) => x.art === art).passt).filter((r) => r.id !== bisher);
  const frisch = pool.filter((r) => !vermeiden.has(r.id));
  const auswahl = frisch.length ? frisch : pool;
  return auswahl.length ? zufall(auswahl).id : bisher || null;
}

function extraUmschalten(tag, art) {
  const e = plan[tag];
  e.extras = e.extras || {};
  if (e.extras[art]) delete e.extras[art];
  else {
    const id = extraWaehlen(art, extraIdsInWoche(art, plan, tag));
    if (id) e.extras[art] = id;
  }
  if (!Object.keys(e.extras).length) delete e.extras;
  speichern(kriterienLesen());
  anzeigen();
}

function extraWuerfeln(tag, art) {
  const e = plan[tag];
  const neu = extraWaehlen(art, extraIdsInWoche(art, plan, tag), e.extras[art]);
  if (neu === e.extras[art]) meldung = `Für ${TAGE[tag].lang} gibt es keine andere Auswahl.`;
  else { e.extras[art] = neu; meldung = ""; }
  speichern(kriterienLesen());
  anzeigen();
}

// Portionen eines Zusatzes: Salat und Nachtisch richten sich nach „Portionen pro Mahlzeit“, Brot und Kuchen nicht
function extraPortionen(art, r) {
  const proMahlzeit = Number(el.portionen.value);
  return proMahlzeit && EXTRAS.find((x) => x.art === art).skaliert(r) ? proMahlzeit : r.portionen;
}

function erstellen() {
  const k = kriterienLesen();
  const neu = {};
  const benutzt = new Set();
  const festJeArt = Object.fromEntries(ARTEN.map((a) => [a.schluessel, 0]));

  // Festgehaltene Tage (und ihre Reste) bleiben
  for (const tag of k.tage) {
    const alt = plan && plan[tag];
    if (alt && alt.fest && rezeptMitId(alt.id)) {
      neu[tag] = { ...alt };
      benutzt.add(alt.id);
      const art = artVon(rezeptMitId(alt.id));
      if (art) festJeArt[art.schluessel]++;
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

  // Kochtage, für die ein Rezept gewählt wird. Vorgaben (Fleisch, Fisch, fleischfrei) werden reihum auf
  // zufällige Kochtage verteilt, damit bei zu vielen Vorgaben jede Art etwas abbekommt; ein Paar zählt doppelt.
  const kochtage = k.tage.filter((t) => offen.has(t) && ![...resteFuer.values()].includes(t));
  const benoetigt = Object.fromEntries(ARTEN.map((a) => [a.schluessel, Math.max(0, (k[a.schluessel] || 0) - festJeArt[a.schluessel])]));
  const artFuer = new Map();
  const frei = mischen(kochtage);
  while (frei.length && ARTEN.some((a) => benoetigt[a.schluessel] > 0)) {
    for (const a of ARTEN) {
      if (benoetigt[a.schluessel] <= 0 || !frei.length) continue;
      const tag = frei.pop();
      artFuer.set(tag, a);
      benoetigt[a.schluessel] -= resteFuer.has(tag) ? 2 : 1;
    }
  }
  const ueberbucht = ARTEN.some((a) => benoetigt[a.schluessel] > 0);

  let leer = 0;
  let doppelt = 0;
  const verfehlt = new Set();
  for (const tag of kochtage) {
    const art = artFuer.get(tag);
    let pool = kandidaten(tag, k, art);
    // Passt nichts zur Vorgabe, lieber irgendein passendes Gericht als ein leerer Tag
    if (art && !pool.length) {
      pool = kandidaten(tag, k);
      if (pool.length) verfehlt.add(art.name);
    }
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

  // Zusätze: Welche Arten ein Tag hatte, bleibt; nicht festgehaltene Tage bekommen neue Rezepte
  for (const tag of k.tage) {
    const alt = plan && plan[tag];
    if (!neu[tag] || neu[tag].fest || !alt || !alt.extras) continue;
    neu[tag].extras = {};
    for (const art of Object.keys(alt.extras)) {
      const id = extraWaehlen(art, extraIdsInWoche(art, neu, tag), alt.extras[art]);
      if (id) neu[tag].extras[art] = id;
    }
  }

  plan = neu;
  abgehakt = new Set();
  meldung = meldungBauen(k, { leer, doppelt, fehlendePaare, ueberbucht, verfehlt: [...verfehlt] });
  speichern(k);
  anzeigen();
}

function meldungBauen(k, { leer = 0, doppelt = 0, fehlendePaare = 0, ueberbucht = false, verfehlt = [] }) {
  if (!k.tage.length) return "";
  if (fehlendePaare) return `Für ${fehlendePaare === 1 ? "ein Gericht" : `${fehlendePaare} Gerichte`} für zwei Tage fehlen aufeinanderfolgende freie Tage. Wähle mehr Kochtage aus oder löse festgehaltene Tage.`;
  if (leer) return `Für ${leer === 1 ? "einen Tag" : `${leer} Tage`} passt kein Rezept. Erhöhe die Kochzeit, oder erlaube mehr Kategorien.`;
  if (verfehlt.length) return `Nicht für jeden Tag mit Vorgabe „${verfehlt.join("“ oder „")}“ gibt es ein passendes Rezept, dort steht jetzt etwas anderes. Erhöhe die Kochzeit oder erlaube mehr Kategorien (z. B. Fisch).`;
  if (ueberbucht) return "Es gibt mehr Vorgaben für Fleisch, Fisch und fleischfreie Tage als Kochtage. Sie wurden reihum verteilt.";
  if (doppelt) return "Es gibt nicht genug passende Rezepte für die ganze Woche, deshalb kommen manche doppelt vor.";
  return "";
}

function neuWuerfeln(tag) {
  const k = kriterienLesen();
  const aktuell = rezeptMitId(plan[tag].id);
  // Würde mit dem neuen Rezept eine Vorgabe unterschritten, bleibt die Art des bisherigen Rezepts
  const art = artVon(aktuell);
  const imPlan = art ? Object.values(plan).filter((e) => artVon(rezeptMitId(e.id)) === art).length : 0;
  const mussArt = art && imPlan <= (k[art.schluessel] || 0) ? art : undefined;

  const andere = new Set(Object.entries(plan).filter(([t]) => Number(t) !== tag).map(([, e]) => e.id));
  const pool = kandidaten(tag, k, mussArt).filter((r) => !aktuell || r.id !== aktuell.id);
  const meiden = k.abwechslung ? nachbarKategorien(tag, k, plan) : [];
  const wahl = auswaehlen(pool, andere, meiden);

  if (wahl.rezept) {
    const extras = plan[tag].extras;
    plan[tag] = { id: wahl.rezept.id, fest: false, ...(extras ? { extras } : {}) };
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
  const extras = plan[folgetag].extras;
  plan[folgetag] = { id: plan[tag].id, fest: plan[tag].fest, reste: tag, ...(extras ? { extras } : {}) };
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

// ---------- Portionen ----------

// Kochtag, dessen Reste es am nächsten geplanten Tag gibt
const kochtFuerZweiTage = (tag) => {
  const folgetag = naechsterTag(tag);
  return folgetag !== undefined && plan[folgetag].reste === tag;
};

// Portionen, die an einem Kochtag gekocht werden (Reste-Tage kochen nicht)
function portionenAm(tag) {
  const r = rezeptMitId(plan[tag].id);
  const proMahlzeit = Number(el.portionen.value) || r.portionen;
  return kochtFuerZweiTage(tag) ? proMahlzeit * 2 : proMahlzeit;
}

// Kochtage mit Rezept: [{ tag, rezept, portionen }]
const kochtage = () => geplanteTage()
  .filter((t) => plan[t].reste === undefined && rezeptMitId(plan[t].id))
  .map((t) => ({ tag: t, rezept: rezeptMitId(plan[t].id), portionen: portionenAm(t) }));

// Alles, was eingekauft werden muss: Kochtage plus Zusätze [{ tag, rezept, portionen }]
function einkaufGerichte() {
  const zusaetze = [];
  for (const t of geplanteTage()) {
    const extras = plan[t].extras || {};
    for (const x of EXTRAS) {
      const r = rezeptMitId(extras[x.art]);
      if (r) zusaetze.push({ tag: t, rezept: r, portionen: extraPortionen(x.art, r) });
    }
  }
  return [...kochtage(), ...zusaetze];
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

function dazuHTML(tag) {
  const extras = plan[tag].extras || {};
  const aktiv = [];
  const knoepfe = [];
  for (const x of EXTRAS) {
    const r = rezeptMitId(extras[x.art]);
    if (!r) {
      knoepfe.push(`<button type="button" class="chip ohne-punkt" data-aktion="extra" data-art="${x.art}" data-tag="${tag}">+ ${x.name}</button>`);
      continue;
    }
    aktiv.push(`<li>
      <span class="dazu-text">
        <span class="dazu-art">${x.name}</span>
        <a href="${esc(rezeptLink(r, extraPortionen(x.art, r)))}">${esc(extraTitel(r))}</a>
      </span>
      <span class="dazu-mini-knoepfe">
        <button type="button" class="dazu-mini" data-aktion="extra-wuerfeln" data-art="${x.art}" data-tag="${tag}" title="Anderen ${x.name} würfeln" aria-label="${x.name}: neu würfeln">↻</button>
        <button type="button" class="dazu-mini" data-aktion="extra" data-art="${x.art}" data-tag="${tag}" title="${x.name} entfernen" aria-label="${x.name} entfernen">×</button>
      </span>
    </li>`);
  }
  return `<div class="dazu">
    ${aktiv.length ? `<ul class="dazu-liste">${aktiv.join("")}</ul>` : ""}
    ${knoepfe.length ? `<div class="dazu-knoepfe">${knoepfe.join("")}</div>` : ""}
  </div>`;
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
      ${dazuHTML(tag)}
      <div class="tag-aktion">
        <button type="button" class="knopf zweit klein" data-aktion="wuerfeln" data-tag="${tag}" ${eintrag.fest ? "disabled" : ""}>Neu würfeln</button>
      </div>
    </article>`;
  }

  const folgetag = naechsterTag(tag);
  const zweiTage = kochtFuerZweiTage(tag);
  const portionen = portionenAm(tag);
  const link = rezeptLink(r, portionen);

  const merkmale = [`<li>${formatZeit(r.zeit)}</li>`, `<li>${esc(r.kategorie)}</li>`];
  if (istFleischfrei(r)) merkmale.push(`<li>${esc(r.ernaehrung)}</li>`);
  if (zweiTage) merkmale.push(`<li class="zwei-tage">für 2 Tage</li>`);
  merkmale.push(`<li>${portionen} ${portionen === 1 ? "Portion" : "Portionen"}</li>`);

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
    ${dazuHTML(tag)}
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
  const adresse = seitenAdresse().replace(/^https?:\/\//, "");

  el.woche.innerHTML = `
    <header class="druck-kopf"><h2>Wochenplan</h2><p>${zeitraum}</p></header>
    <div class="woche-aktionen">
      <h2>Deine Woche</h2>
      <div>
        <button type="button" class="knopf zweit klein" data-aktion="teilen">Teilen</button>
        <button type="button" class="knopf zweit klein" data-aktion="drucken">Drucken / PDF</button>
        <button type="button" class="knopf zweit klein" data-aktion="leeren">Plan leeren</button>
      </div>
    </div>
    ${meldung ? `<p class="woche-meldung">${esc(meldung)}</p>` : ""}
    ${tage.map(tagHTML).join("")}
    ${adresse ? `<p class="druck-fuss">Alle Rezepte: ${esc(adresse)}</p>` : ""}
    <section class="einkauf" aria-labelledby="einkauf-titel">
      <div class="einkauf-kopf">
        <div>
          <h2 id="einkauf-titel">Einkaufsliste</h2>
          <p class="hinweis">${einkaufUntertitel()}</p>
        </div>
        ${einkaufGerichte().length ? `<button type="button" class="knopf klein" data-aktion="uebernehmen">In gemeinsame Liste übernehmen</button>` : ""}
      </div>
      <div id="einkauf-inhalt"><p class="hinweis">Zutaten werden geladen …</p></div>
    </section>`;
  einkaufAnzeigen();
}

function einkaufUntertitel() {
  const tage = kochtage();
  const zusaetze = einkaufGerichte().length - tage.length;
  if (!tage.length && !zusaetze) return "";
  const summe = tage.reduce((n, k) => n + k.portionen, 0);
  const dazu = zusaetze ? `, dazu ${zusaetze} ${zusaetze === 1 ? "Beilage oder Nachtisch" : "Beilagen und Nachtische"}` : "";
  return `${tage.length} ${tage.length === 1 ? "Gericht" : "Gerichte"} mit ${summe} Portionen${dazu}. Abhaken, was schon im Schrank ist.`;
}

// ---------- Einkaufsliste ----------

// Mengen in diesen Einheiten hat man meist im Vorrat: Sie stehen unter "Vorrat prüfen"
const VORRAT_EINHEITEN = ["EL", "TL", "Prise", "Tropfen", "Schuss"];
// Nicht auf die Liste
const NICHT_KAUFEN = /^(lauwarmes |warmes |kaltes |heißes )?wasser$/i;
const EINHEIT_MEHRZAHL = { Dose: "Dosen", Prise: "Prisen", Scheibe: "Scheiben", Packung: "Packungen", Zehe: "Zehen", Tasse: "Tassen", Glas: "Gläser", Flasche: "Flaschen", Kopf: "Köpfe" };
const BRUECHE = { 0.25: "¼", 0.5: "½", 0.75: "¾" };

// Zutaten je Rezeptseite: id -> Promise<{ basis, zutaten: [{ menge, einheit, einzahl, mehrzahl }] }>
const zutatenCache = new Map();

function zutatenLaden(rezept) {
  if (!zutatenCache.has(rezept.id)) {
    const laden = fetch(rezept.seite)
      .then((antwort) => {
        if (!antwort.ok) throw new Error(antwort.status);
        return antwort.text();
      })
      .then((html) => zutatenLesen(new DOMParser().parseFromString(html, "text/html"), rezept))
      .catch((fehler) => {
        zutatenCache.delete(rezept.id);
        throw fehler;
      });
    zutatenCache.set(rezept.id, laden);
  }
  return zutatenCache.get(rezept.id);
}

// Liest die Zutatenliste einer Rezeptseite (Aufbau wie in rezepte/vorlage.html)
function zutatenLesen(doc, rezept) {
  const regler = doc.querySelector(".portionen[data-basis]");
  const basis = regler ? Number(regler.dataset.basis) : rezept.portionen;
  // Seiten mit Varianten: nur die Zutaten der Variante aus dem Link (sonst der ersten)
  const ersteVariante = doc.querySelector("[data-variante]");
  const variante = new URLSearchParams(rezept.seite.split("?")[1] || "").get("variante") || (ersteVariante && ersteVariante.dataset.variante);
  const zutaten = [...doc.querySelectorAll(".zutaten li")]
    .filter((li) => {
      // data-nur kann an der Zeile oder an der ganzen Gruppe (<ul>) stehen
      const nur = li.closest("[data-nur]");
      return !nur || nur.dataset.nur.split(" ").includes(variante);
    })
    .map((li) => {
    const b = li.querySelector("b");
    const name = li.querySelector("[data-einzahl]");
    const text = li.textContent.replace(b ? b.textContent : "", "").trim();
    return {
      menge: b && b.dataset.menge ? Number(b.dataset.menge) : null,
      einheit: (b && b.dataset.einheit) || "",
      einzahl: nameBereinigen(name ? name.dataset.einzahl : text),
      mehrzahl: nameBereinigen(name ? name.dataset.mehrzahl : text),
    };
  }).filter((z) => z.einzahl && !NICHT_KAUFEN.test(z.einzahl));
  // Im Planer steht eine Salatsoße für „Blattsalat mit …“: ein Kopf Salat je 4 Portionen
  if (rezept.kategorie === "Salatsoßen") zutaten.push({ menge: basis / 4, einheit: "Kopf", einzahl: "Blattsalat", mehrzahl: "Blattsalat" });
  return { basis, zutaten };
}

// "Bergkäse, gerieben" -> "Bergkäse", "Etwas Öl" -> "Öl"; "Salz, Pfeffer" bleibt
function nameBereinigen(name) {
  const ohne = name.replace(/,\s*\p{Ll}.*$/u, "").replace(/^etwas\s+/i, "").trim();
  return ohne.charAt(0).toUpperCase() + ohne.slice(1);
}

// kg und l werden in g und ml zusammengezählt
function einheitNormal(menge, einheit) {
  if (einheit === "kg") return [menge * 1000, "g"];
  if (einheit === "l") return [menge * 1000, "ml"];
  return [menge, einheit];
}

function mengeText(wert, einheit) {
  if (einheit === "g" || einheit === "ml") {
    if (wert >= 1000) return `${(Math.ceil(wert / 100) / 10).toLocaleString("de-DE")} ${einheit === "g" ? "kg" : "l"}`;
    const schritt = wert >= 200 ? 10 : wert >= 30 ? 5 : 1;
    return `${Math.max(schritt, Math.ceil(wert / schritt) * schritt)} ${einheit}`;
  }
  const viertel = Math.max(0.25, Math.ceil(wert * 4 - 0.01) / 4);
  const ganz = Math.floor(viertel);
  const zahl = ganz ? `${ganz}${BRUECHE[viertel - ganz] || ""}` : BRUECHE[viertel];
  const einheitText = viertel > 1 && EINHEIT_MEHRZAHL[einheit] ? EINHEIT_MEHRZAHL[einheit] : einheit;
  return einheitText ? `${zahl} ${einheitText}` : zahl;
}

// Fasst die Zutaten aller Kochtage zusammen, umgerechnet auf die geplanten Portionen
async function einkaufsliste() {
  const tage = einkaufGerichte();
  const daten = await Promise.all(tage.map((k) => zutatenLaden(k.rezept)));
  const posten = new Map();

  tage.forEach((k, i) => {
    const { basis, zutaten } = daten[i];
    const faktor = k.portionen / basis;
    for (const z of zutaten) {
      const schluessel = z.einzahl.toLowerCase();
      if (!posten.has(schluessel)) posten.set(schluessel, { schluessel, einzahl: z.einzahl, mehrzahl: z.mehrzahl, mengen: new Map(), rezepte: new Set() });
      const p = posten.get(schluessel);
      p.rezepte.add(k.rezept.titel);
      if (z.menge === null) continue;
      const [menge, einheit] = einheitNormal(z.menge * faktor, z.einheit);
      p.mengen.set(einheit, (p.mengen.get(einheit) || 0) + menge);
    }
  });

  const liste = [...posten.values()].map((p) => {
    const einheiten = [...p.mengen.keys()];
    const stueck = p.mengen.get("") || 0;
    return {
      schluessel: p.schluessel,
      name: stueck > 1 ? p.mehrzahl : p.einzahl,
      menge: einheiten.map((e) => mengeText(p.mengen.get(e), e)).join(" + "),
      rezepte: [...p.rezepte],
      vorrat: einheiten.every((e) => VORRAT_EINHEITEN.includes(e)),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "de"));

  return { kaufen: liste.filter((p) => !p.vorrat), vorrat: liste.filter((p) => p.vorrat) };
}

function postenHTML(p) {
  return `<li${abgehakt.has(p.schluessel) ? ' class="erledigt"' : ""}>
    <label>
      <input type="checkbox" data-schluessel="${esc(p.schluessel)}" ${abgehakt.has(p.schluessel) ? "checked" : ""}>
      <b>${esc(p.menge)}</b>
      <span>${esc(p.name)}<small>${esc(p.rezepte.join(", "))}</small></span>
    </label>
  </li>`;
}

let einkaufLauf = 0;
async function einkaufAnzeigen() {
  const lauf = ++einkaufLauf;
  const ziel = () => (lauf === einkaufLauf ? document.getElementById("einkauf-inhalt") : null);
  if (!einkaufGerichte().length) {
    ziel().innerHTML = `<p class="hinweis">Sobald Gerichte geplant sind, steht hier, was du einkaufen musst.</p>`;
    return;
  }
  try {
    const { kaufen, vorrat } = await einkaufsliste();
    if (!ziel()) return;
    ziel().innerHTML = `
      <ul class="einkauf-liste">${kaufen.map(postenHTML).join("")}</ul>
      ${vorrat.length ? `<h3>Vorrat prüfen</h3><ul class="einkauf-liste">${vorrat.map(postenHTML).join("")}</ul>` : ""}`;
  } catch {
    if (!ziel()) return;
    ziel().innerHTML = `<p class="hinweis">Die Zutaten konnten nicht geladen werden. Die Einkaufsliste funktioniert nur, wenn die Seite über das Internet (oder einen lokalen Webserver) geöffnet ist.</p>`;
  }
}

// Übergibt die noch nicht abgehakten Zutaten an die gemeinsame Einkaufsliste (einkaufsliste.html liest sie beim Öffnen)
async function uebernehmen() {
  try {
    const { kaufen, vorrat } = await einkaufsliste();
    const posten = [...kaufen, ...vorrat]
      .filter((p) => !abgehakt.has(p.schluessel))
      .map((p) => ({ name: p.name, menge: p.menge, rezepte: p.rezepte.join(", ") }));
    speicherSchreiben("einkaufsliste-import", posten);
    location.href = "einkaufsliste.html";
  } catch {
    meldung = "Die Zutaten konnten nicht geladen werden.";
    anzeigen();
  }
}

// ---------- Teilen ----------

const seitenAdresse = () => (location.protocol.startsWith("http") ? new URL(".", location.href).href : "");

async function teilenText() {
  const basis = seitenAdresse();
  const zeilen = [`Wochenplan ${datumVon(0, { day: "numeric", month: "long" })} bis ${datumVon(6, { day: "numeric", month: "long", year: "numeric" })}`, ""];

  for (const tag of geplanteTage()) {
    const e = plan[tag];
    const r = rezeptMitId(e.id);
    const kopf = `${TAGE[tag].kurz}, ${datumVon(tag, { day: "numeric", month: "numeric" })}`;
    if (!r) zeilen.push(`${kopf}: noch offen`);
    else if (e.reste !== undefined) zeilen.push(`${kopf}: Reste vom ${TAGE[e.reste].lang} (${r.titel})`);
    else {
      const portionen = portionenAm(tag);
      zeilen.push(`${kopf}: ${r.titel} (${portionen} ${portionen === 1 ? "Portion" : "Portionen"})`);
      if (basis) zeilen.push(`  ${basis}${rezeptLink(r, portionen)}`);
    }
    const extras = r ? e.extras || {} : {};
    for (const x of EXTRAS) {
      const z = rezeptMitId(extras[x.art]);
      if (z) zeilen.push(`  + ${x.name}: ${extraTitel(z)}${basis ? ` (${basis}${rezeptLink(z, extraPortionen(x.art, z))})` : ""}`);
    }
  }

  try {
    const { kaufen, vorrat } = await einkaufsliste();
    const zeile = (p) => `- ${p.menge ? `${p.menge} ` : ""}${p.name}`;
    const offen = (p) => !abgehakt.has(p.schluessel);
    if (kaufen.some(offen)) zeilen.push("", "Einkaufsliste", ...kaufen.filter(offen).map(zeile));
    if (vorrat.some(offen)) zeilen.push("", "Vorrat prüfen", ...vorrat.filter(offen).map(zeile));
  } catch {
    // Ohne Zutaten wird nur der Plan geteilt
  }
  return zeilen.join("\n");
}

async function teilen() {
  const text = await teilenText();
  const titel = "Wochenplan";
  if (navigator.share) {
    try {
      await navigator.share({ title: titel, text });
      return;
    } catch (fehler) {
      if (fehler.name === "AbortError") return;
      // Sonst auf die Auswahl unten ausweichen
    }
  }
  el.teilenWhatsapp.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  el.teilenMail.href = `mailto:?subject=${encodeURIComponent(titel)}&body=${encodeURIComponent(text)}`;
  el.teilenKopieren.dataset.text = text;
  el.teilenKopieren.textContent = "Text kopieren";
  el.teilenDialog.showModal();
}

// ---------- Speicher ----------

function speichern(k) {
  speicherSchreiben(SPEICHER, { kriterien: k, plan, abgehakt: [...abgehakt] });
}

function laden() {
  const gespeichert = speicherLesen(SPEICHER);
  if (!gespeichert) return;
  if (gespeichert.kriterien) kriterienSetzen(gespeichert.kriterien);
  if (gespeichert.plan) plan = gespeichert.plan;
  if (gespeichert.abgehakt) abgehakt = new Set(gespeichert.abgehakt);
}

// ---------- Ereignisse ----------

el.form.addEventListener("submit", (e) => { e.preventDefault(); erstellen(); });
for (const a of ARTEN) {
  el.arten[a.schluessel].regler.addEventListener("input", (e) => {
    artenBegrenzen(e.target);
    reglerAnzeigen();
  });
}
el.tage.addEventListener("change", reglerAnzeigen);
el.zweiTage.addEventListener("input", reglerAnzeigen);
// Portionen ändern nur Mengen und Links, der Plan bleibt
el.portionen.addEventListener("change", () => {
  speichern(kriterienLesen());
  if (plan) anzeigen();
});
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
    case "extra": extraUmschalten(tag, knopf.dataset.art); break;
    case "extra-wuerfeln": extraWuerfeln(tag, knopf.dataset.art); break;
    case "zwei-tage": zweiTageUmschalten(tag); break;
    case "teilen": teilen(); break;
    case "uebernehmen": uebernehmen(); break;
    case "drucken": window.print(); break;
    case "leeren":
      plan = null;
      abgehakt = new Set();
      meldung = "";
      speichern(kriterienLesen());
      anzeigen();
      break;
  }
});
el.woche.addEventListener("change", (e) => {
  const box = e.target.closest("input[data-schluessel]");
  if (!box) return;
  if (box.checked) abgehakt.add(box.dataset.schluessel);
  else abgehakt.delete(box.dataset.schluessel);
  box.closest("li").classList.toggle("erledigt", box.checked);
  speichern(kriterienLesen());
});
el.teilenKopieren.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(el.teilenKopieren.dataset.text);
    el.teilenKopieren.textContent = "Kopiert";
  } catch {
    el.teilenKopieren.textContent = "Kopieren nicht möglich";
  }
});

formularAufbauen();
laden();
reglerAnzeigen();
anzeigen();
