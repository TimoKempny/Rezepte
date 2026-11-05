// Gemeinsame Einkaufsliste: Die Einträge liegen in Firestore unter listen/{liste}/eintraege und erscheinen auf allen
// Geräten mit demselben Link sofort. Der zufällige Listen-Schlüssel im Link ist der Zugangsschutz (siehe Regeln in
// firestore.rules). Wochenplaner und Rezeptseiten legen Zutaten unter IMPORT_SPEICHER ab, diese Seite übernimmt sie beim Öffnen.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Öffentliche Projektkennung aus der Firebase-Konsole (darf im Code stehen, geschützt wird über die Regeln)
const FIREBASE = {
  apiKey: "AIzaSyDof_taDJV8WOogkSQeenFRGIUcmHgz5Hg",
  authDomain: "rezepte-einkauf-9ec20.firebaseapp.com",
  projectId: "rezepte-einkauf-9ec20",
  appId: "1:669723607255:web:4b1eece79f47fa7feb7092",
};

const SCHLUESSEL_SPEICHER = "einkaufsliste-schluessel";
const IMPORT_SPEICHER = "einkaufsliste-import";

// Mengenangabe am Anfang eines Eintrags: "2 Zwiebeln", "500 g Hack", "1,5 l Milch", "½ Bund Petersilie"
const MENGE = /^((?:\d+(?:[.,]\d+)?|[¼½¾])(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:kg|g|ml|l|EL|TL|Pck\.?|Packungen?|Dosen?|Bund|Becher|Gläser|Glas|Flaschen?|Stück|Scheiben?|Zehen?|Prisen?)?\.?)\s+(.+)$/i;

const el = {
  start: document.getElementById("liste-start"),
  anlegen: document.getElementById("liste-anlegen"),
  liste: document.getElementById("liste"),
  neu: document.getElementById("liste-neu"),
  neuText: document.getElementById("neu-text"),
  meldung: document.getElementById("liste-meldung"),
  offen: document.getElementById("liste-offen"),
  leer: document.getElementById("liste-leer"),
  erledigtBlock: document.getElementById("liste-erledigt-block"),
  erledigtTitel: document.getElementById("liste-erledigt-titel"),
  erledigt: document.getElementById("liste-erledigt"),
  teilen: document.getElementById("liste-teilen"),
  erledigteLoeschen: document.getElementById("erledigte-loeschen"),
  allesLoeschen: document.getElementById("alles-loeschen"),
  status: document.getElementById("liste-status"),
  fehler: document.getElementById("liste-fehler"),
};

let db = null;
let eintraegeRef = null;
let eintraege = [];
let geladen = false;
let importiert = false;
// Eintrag, der gerade bearbeitet wird, mit dem bisher getippten Text
let bearbeitet = null;

const schluesselVon = (name) => name.trim().toLowerCase();

function zerlegen(text) {
  const t = text.trim().replace(/\s+/g, " ");
  const treffer = t.match(MENGE);
  return treffer ? { menge: treffer[1], name: treffer[2] } : { menge: "", name: t };
}

function zusammen(e) {
  return e.menge ? `${e.menge} ${e.name}` : e.name;
}

function melden(text) {
  el.meldung.textContent = text;
}

function fehlerZeigen(text) {
  el.start.hidden = true;
  el.liste.hidden = true;
  el.fehler.hidden = false;
  el.fehler.textContent = text;
}

// ---------- Listen-Schlüssel ----------

function neuerSchluessel() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}

function schluesselAusLink() {
  const wert = new URLSearchParams(location.hash.slice(1)).get("liste");
  return wert && /^[\w-]{20,64}$/.test(wert) ? wert : null;
}

function linkFuer(schluessel) {
  return `${location.origin}${location.pathname}#liste=${schluessel}`;
}

// ---------- Anzeige ----------

const ICON_STIFT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>`;
const ICON_KREUZ = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

function eintragHTML(e) {
  if (bearbeitet && bearbeitet.id === e.id) {
    return `<li data-id="${esc(e.id)}">
      <form class="liste-bearbeiten" data-aktion="speichern">
        <label for="bearbeiten-text" class="nur-screenreader">Eintrag bearbeiten</label>
        <input id="bearbeiten-text" type="text" maxlength="200" value="${esc(bearbeitet.text)}" enterkeyhint="done">
        <button type="submit" class="knopf klein">Speichern</button>
        <button type="button" class="knopf zweit klein" data-aktion="abbrechen">Abbrechen</button>
      </form>
    </li>`;
  }
  return `<li data-id="${esc(e.id)}"${e.erledigt ? ' class="erledigt"' : ""}>
    <label>
      <input type="checkbox" data-aktion="abhaken" ${e.erledigt ? "checked" : ""}>
      <b>${esc(e.menge || "")}</b>
      <span>${esc(e.name)}${e.rezepte ? `<small>${esc(e.rezepte)}</small>` : ""}</span>
    </label>
    <button type="button" class="eintrag-knopf" data-aktion="bearbeiten" aria-label="${esc(e.name)} bearbeiten">${ICON_STIFT}</button>
    <button type="button" class="eintrag-knopf" data-aktion="loeschen" aria-label="${esc(e.name)} löschen">${ICON_KREUZ}</button>
  </li>`;
}

function anzeigen() {
  const offen = eintraege.filter((e) => !e.erledigt).sort((a, b) => a.zeit - b.zeit);
  const erledigt = eintraege.filter((e) => e.erledigt).sort((a, b) => a.zeit - b.zeit);
  el.offen.innerHTML = offen.map(eintragHTML).join("");
  el.erledigt.innerHTML = erledigt.map(eintragHTML).join("");
  el.leer.hidden = !geladen || eintraege.length > 0;
  el.erledigtBlock.hidden = erledigt.length === 0;
  el.erledigtTitel.textContent = `Erledigt (${erledigt.length})`;
  el.erledigteLoeschen.hidden = erledigt.length === 0;
  el.allesLoeschen.hidden = eintraege.length === 0;

  const feld = document.getElementById("bearbeiten-text");
  if (feld && document.activeElement !== feld) {
    feld.focus();
    feld.setSelectionRange(feld.value.length, feld.value.length);
  }
}

// ---------- Firestore ----------

function verbinden(schluessel) {
  if (Object.values(FIREBASE).includes("EINTRAGEN")) {
    fehlerZeigen("Die Einkaufsliste ist noch nicht mit Firebase verbunden. Die Zugangsdaten fehlen in assets/einkauf.js.");
    return;
  }
  if (!db) {
    const app = initializeApp(FIREBASE);
    // Lokaler Zwischenspeicher: Die Liste funktioniert auch ohne Netz (im Laden) und gleicht später ab
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  }
  speicherSchreiben(SCHLUESSEL_SPEICHER, schluessel);
  history.replaceState(null, "", `#liste=${schluessel}`);
  eintraegeRef = collection(db, "listen", schluessel, "eintraege");
  el.start.hidden = true;
  el.liste.hidden = false;
  el.status.textContent = "Wird geladen …";

  onSnapshot(eintraegeRef, { includeMetadataChanges: true }, (schnappschuss) => {
    eintraege = schnappschuss.docs.map((d) => ({ id: d.id, ...d.data() }));
    geladen = true;
    anzeigen();
    const { fromCache, hasPendingWrites } = schnappschuss.metadata;
    el.status.textContent = fromCache
      ? "Offline: Änderungen werden abgeglichen, sobald wieder Internet da ist."
      : hasPendingWrites ? "Wird gespeichert …" : "Auf allen Geräten aktuell.";
    // Erst mit dem Stand vom Server übernehmen, sonst werden schon vorhandene Zutaten nicht erkannt
    if (!importiert && !fromCache) {
      importiert = true;
      importieren();
    }
  }, (fehler) => {
    console.error(fehler);
    fehlerZeigen("Die Liste konnte nicht geladen werden. Stimmt der Link? Sonst später noch einmal versuchen.");
  });
}

function hinzufuegen(text, extra = {}) {
  const { menge, name } = zerlegen(text);
  if (!name) return;
  return addDoc(eintraegeRef, {
    name, menge, schluessel: schluesselVon(name), rezepte: "", quelle: "hand",
    erledigt: false, zeit: Date.now(), ...extra,
  });
}

// Mengen zusammenzählen, wenn beide dieselbe Einheit haben ("120 g" + "200 g" = "320 g"), sonst "… + …"
const ZAHL_EINHEIT = /^(\d+(?:[.,]\d+)?|\d*[¼½¾])\s*(.*)$/;
function mengeZahl(text) {
  const t = text.replace("¼", ".25").replace("½", ".5").replace("¾", ".75").replace(",", ".");
  return Number(t.startsWith(".") ? "0" + t : t);
}
function mengenAddieren(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x = a.match(ZAHL_EINHEIT), y = b.match(ZAHL_EINHEIT);
  if (x && y && x[2] === y[2] && !a.includes("+")) {
    const summe = Math.round((mengeZahl(x[1]) + mengeZahl(y[1])) * 100) / 100;
    return `${summe.toLocaleString("de-DE")}${x[2] ? " " + x[2] : ""}`;
  }
  return `${a} + ${b}`;
}

// Zutaten aus dem Wochenplaner oder von einer Rezeptseite übernehmen. Ein offener Eintrag mit derselben Zutat wird
// nicht verdoppelt. Wochenplan (Liste der Posten): Stammt der Eintrag aus einer früheren Planübernahme, bekommt er die
// neue Menge. Rezept ({ quelle: "rezept", titel, posten }): Die Menge wird zum vorhandenen Eintrag dazugezählt.
// Von Hand Eingetragenes ohne Menge bleibt, wie es ist.
async function importieren() {
  const gespeichert = speicherLesen(IMPORT_SPEICHER);
  const ausRezept = gespeichert && gespeichert.quelle === "rezept";
  const posten = ausRezept ? gespeichert.posten : gespeichert;
  if (!Array.isArray(posten) || !posten.length) {
    if (gespeichert) speicherSchreiben(IMPORT_SPEICHER, null);
    return;
  }
  speicherSchreiben(IMPORT_SPEICHER, null);

  const offen = new Map(eintraege.filter((e) => !e.erledigt).map((e) => [e.schluessel, e]));
  const batch = writeBatch(db);
  let neu = 0, aktualisiert = 0, schonDa = 0;
  const zeit = Date.now();
  posten.forEach((p, i) => {
    const name = String(p.name || "").slice(0, 200);
    if (!name) return;
    const daten = { name, menge: String(p.menge || "").slice(0, 100), rezepte: String(p.rezepte || "").slice(0, 300) };
    const vorhanden = offen.get(schluesselVon(name));
    if (!vorhanden) {
      batch.set(doc(eintraegeRef), { ...daten, schluessel: schluesselVon(name), quelle: "plan", erledigt: false, zeit: zeit + i });
      neu++;
    } else if (ausRezept && (vorhanden.quelle !== "hand" || vorhanden.menge)) {
      batch.update(doc(eintraegeRef, vorhanden.id), {
        menge: mengenAddieren(vorhanden.menge || "", daten.menge).slice(0, 100),
        rezepte: [vorhanden.rezepte, daten.rezepte].filter(Boolean).join(", ").slice(0, 300),
      });
      aktualisiert++;
    } else if (!ausRezept && vorhanden.quelle === "plan") {
      batch.update(doc(eintraegeRef, vorhanden.id), daten);
      aktualisiert++;
    } else {
      schonDa++;
    }
  });
  await batch.commit();
  const herkunft = ausRezept ? `von „${String(gespeichert.titel || "Rezept").slice(0, 100)}“` : "aus dem Wochenplan";
  const teile = [`${neu} ${neu === 1 ? "Zutat" : "Zutaten"} ${herkunft} übernommen`];
  if (aktualisiert) teile.push(`${aktualisiert} ${ausRezept ? "zu vorhandenen Einträgen dazugezählt" : "aktualisiert"}`);
  if (schonDa) teile.push(`${schonDa} ${schonDa === 1 ? "stand" : "standen"} schon drauf`);
  melden(teile.join(", ") + ".");
}

async function alleLoeschen(liste) {
  // Ein Batch fasst höchstens 500 Schreibvorgänge
  for (let i = 0; i < liste.length; i += 500) {
    const batch = writeBatch(db);
    liste.slice(i, i + 500).forEach((e) => batch.delete(doc(eintraegeRef, e.id)));
    await batch.commit();
  }
}

// ---------- Ereignisse ----------

el.anlegen.addEventListener("click", () => verbinden(neuerSchluessel()));

el.neu.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = el.neuText.value;
  if (!text.trim()) return;
  hinzufuegen(text);
  el.neuText.value = "";
  melden("");
  el.neuText.focus();
});

for (const liste of [el.offen, el.erledigt]) {
  liste.addEventListener("change", (e) => {
    const box = e.target.closest('input[data-aktion="abhaken"]');
    if (!box) return;
    updateDoc(doc(eintraegeRef, box.closest("li").dataset.id), { erledigt: box.checked });
  });

  liste.addEventListener("click", (e) => {
    const knopf = e.target.closest("button[data-aktion]");
    if (!knopf) return;
    const id = knopf.closest("li").dataset.id;
    const eintrag = eintraege.find((x) => x.id === id);
    if (knopf.dataset.aktion === "loeschen") {
      deleteDoc(doc(eintraegeRef, id));
      melden(`„${eintrag ? eintrag.name : "Eintrag"}“ gelöscht.`);
    } else if (knopf.dataset.aktion === "bearbeiten" && eintrag) {
      bearbeitet = { id, text: zusammen(eintrag) };
      anzeigen();
    } else if (knopf.dataset.aktion === "abbrechen") {
      bearbeitet = null;
      anzeigen();
    }
  });

  liste.addEventListener("input", (e) => {
    if (bearbeitet && e.target.id === "bearbeiten-text") bearbeitet.text = e.target.value;
  });

  liste.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!bearbeitet) return;
    const { menge, name } = zerlegen(bearbeitet.text);
    const id = bearbeitet.id;
    bearbeitet = null;
    if (name) updateDoc(doc(eintraegeRef, id), { name, menge, schluessel: schluesselVon(name) });
    anzeigen();
  });

  liste.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && bearbeitet) {
      bearbeitet = null;
      anzeigen();
    }
  });
}

el.erledigteLoeschen.addEventListener("click", async () => {
  const erledigt = eintraege.filter((e) => e.erledigt);
  await alleLoeschen(erledigt);
  melden(erledigt.length === 1 ? "1 erledigter Eintrag gelöscht." : `${erledigt.length} erledigte Einträge gelöscht.`);
});

el.allesLoeschen.addEventListener("click", async () => {
  if (!confirm("Wirklich alle Einträge löschen? Das gilt für alle Geräte.")) return;
  await alleLoeschen([...eintraege]);
  melden("Die Liste ist geleert.");
});

el.teilen.addEventListener("click", async () => {
  const link = linkFuer(speicherLesen(SCHLUESSEL_SPEICHER));
  if (navigator.share) {
    try {
      await navigator.share({ title: "Unsere Einkaufsliste", url: link });
      return;
    } catch (fehler) {
      if (fehler.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    melden("Link kopiert. Wer ihn öffnet, sieht und bearbeitet dieselbe Liste.");
  } catch {
    melden(`Link zum Teilen: ${link}`);
  }
});

// Ein anderer Listen-Link im selben Tab
window.addEventListener("hashchange", () => {
  const schluessel = schluesselAusLink();
  if (schluessel && schluessel !== speicherLesen(SCHLUESSEL_SPEICHER)) location.reload();
});

// ---------- Start ----------

const schluessel = schluesselAusLink() || speicherLesen(SCHLUESSEL_SPEICHER);
if (schluessel) {
  verbinden(schluessel);
} else {
  el.start.hidden = false;
  if (speicherLesen(IMPORT_SPEICHER)) {
    document.getElementById("start-meldung").textContent =
      "Lege zuerst eine Liste an, dann werden die Zutaten übernommen.";
  }
}
