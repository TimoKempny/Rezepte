// Gemeinsame Teile der Sammlungsseiten (Kaffee, Wein): Daten als JSON-Datei im Repository,
// neue Einträge und Fotos über die GitHub-Contents-API mit einem Fine-grained Token im localStorage

const REPO = "TimoKempny/Rezepte";
const ZWEIG = "main";
const TOKEN_SCHLUESSEL = "github-token";

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

async function datenLesenGithub(datei) {
  const antwort = await github(`${datei}?ref=${ZWEIG}`);
  return { eintraege: JSON.parse(base64ZuText(antwort.content)), sha: antwort.sha };
}

// Liest die Liste, ändert sie und schreibt sie zurück; bei gleichzeitiger Änderung ein zweiter Versuch
async function datenAendern(datei, aendern, nachricht) {
  for (let versuch = 0; ; versuch++) {
    const { eintraege, sha } = await datenLesenGithub(datei);
    const neu = aendern(eintraege);
    try {
      await github(datei, {
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

// Mit Token direkt aus dem Repository, dann sind neue Einträge sofort da (Pages braucht etwa eine Minute)
async function datenLaden(datei) {
  try {
    if (token()) return (await datenLesenGithub(datei)).eintraege;
    return await (await fetch(datei, { cache: "no-store" })).json();
  } catch {
    try {
      return await (await fetch(datei, { cache: "no-store" })).json();
    } catch {
      return [];
    }
  }
}

// Ein übrig gebliebenes Foto stört nicht, deshalb ohne Fehlermeldung
async function fotoLoeschen(pfad, nachricht) {
  try {
    const foto = await github(`${pfad}?ref=${ZWEIG}`);
    await github(pfad, {
      method: "DELETE",
      body: JSON.stringify({ message: nachricht, branch: ZWEIG, sha: foto.sha }),
    });
  } catch {
    // Foto bleibt im Repository liegen
  }
}

// Neue Fotos sind auf GitHub Pages erst nach dem Veröffentlichen da, bis dahin direkt aus dem Repository
function rohAdresse(pfad) {
  return `https://raw.githubusercontent.com/${REPO}/${ZWEIG}/${pfad}`;
}

function bilderAusRepoNachladen(bereich) {
  bereich.addEventListener("error", (e) => {
    const bild = e.target;
    if (bild.tagName !== "IMG" || bild.dataset.versucht || !bild.dataset.roh) return;
    bild.dataset.versucht = "1";
    bild.src = rohAdresse(bild.dataset.roh);
  }, true);
}

// ---------- Fotos ----------

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

function kennung(name, datum, ersatz) {
  const wort = name.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || ersatz;
  return `${wort}-${datum}-${Date.now().toString(36).slice(-4)}`;
}

// ---------- Texte und Links ----------

function datumText(iso) {
  const [j, m, t] = iso.split("-").map(Number);
  return new Date(j, m - 1, t).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

function heute() {
  return new Date().toLocaleDateString("sv-SE");
}

function sichererLink(adresse) {
  try {
    const url = new URL(adresse);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// Erster http(s)-Link im Text, damit auch geteilte Maps-Texte („Name … https://maps.app.goo.gl/…“) passen
function linkAusText(text) {
  const treffer = text.match(/https?:\/\/\S+/);
  return treffer ? sichererLink(treffer[0]) : null;
}

function linkName(url) {
  const host = url.hostname.replace(/^www\./, "");
  const istKarte = /^maps\.(app\.goo\.gl|google\.|apple\.com)/.test(host)
    || (host === "goo.gl" && url.pathname.startsWith("/maps"))
    || (/^google\./.test(host) && url.pathname.startsWith("/maps"))
    || /openstreetmap\.org$/.test(host);
  if (/(^|\.)vivino\.com$/.test(host)) return "Bei Vivino";
  return istKarte ? "Auf der Karte" : host;
}

function meldung(element, text, fehler = false) {
  element.textContent = text;
  element.classList.toggle("fehler", fehler);
}

// ---------- Darstellung ----------

// Netzdiagramm, eine Achse je Profilwert (1–5)
function profilSVG(profil, achsen) {
  const mitte = 60, radius = 40;
  const punkt = (i, anteil) => {
    const winkel = -Math.PI / 2 + i * 2 * Math.PI / achsen.length;
    return [mitte + Math.cos(winkel) * radius * anteil, mitte + Math.sin(winkel) * radius * anteil];
  };
  const ring = (anteil) => achsen.map((_, i) => punkt(i, anteil).map((z) => z.toFixed(1)).join(",")).join(" ");
  const ringe = [0.2, 0.4, 0.6, 0.8, 1].map((a) => `<polygon class="netz" points="${ring(a)}"/>`).join("");
  const linien = achsen.map((_, i) => `<line class="netz" x1="${mitte}" y1="${mitte}" x2="${punkt(i, 1)[0].toFixed(1)}" y2="${punkt(i, 1)[1].toFixed(1)}"/>`).join("");
  const werte = achsen.map((p, i) => punkt(i, (profil[p.schluessel] || 0) / 5).map((z) => z.toFixed(1)).join(",")).join(" ");
  const beschriftung = achsen.map((p, i) => {
    const [x, y] = punkt(i, 1.32);
    const anker = Math.abs(x - mitte) < 1 ? "middle" : x > mitte ? "start" : "end";
    return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anker}">${p.name}</text>`;
  }).join("");
  const text = achsen.map((p) => `${p.name} ${profil[p.schluessel] || "–"} von 5`).join(", ");
  return `<svg class="profil-netz" viewBox="-42 0 204 120" role="img" aria-label="Profil: ${esc(text)}">
    ${ringe}${linien}<polygon class="werte" points="${werte}"/>${beschriftung}
  </svg>`;
}

function ratingLeiste(rating) {
  const punkte = Array.from({ length: 10 }, (_, i) => `<i${i < rating ? ' class="voll"' : ""}></i>`).join("");
  return `<div class="rating-leiste" role="img" aria-label="${rating} von 10 Punkten">${punkte}</div>`;
}

// ---------- Dialoge ----------

document.querySelectorAll("[data-schliessen]").forEach((knopf) => {
  knopf.addEventListener("click", () => knopf.closest("dialog").close());
});

// GitHub-Zugang: Dialog mit Token-Feld; nachSpeichern lädt die Seite neu, nachEntfernen zeigt sie ohne Verwalten-Knöpfe
function zugangEinrichten(datei, nachSpeichern, nachEntfernen) {
  const dialog = document.getElementById("zugang-dialog");
  const form = document.getElementById("zugang-form");
  const ausgabe = document.getElementById("zugang-meldung");
  const feld = document.getElementById("z-token");

  function oeffnen(hinweis = "") {
    feld.value = token();
    meldung(ausgabe, hinweis);
    dialog.showModal();
  }

  document.getElementById("zugang-knopf").addEventListener("click", () => oeffnen());

  document.getElementById("z-entfernen").addEventListener("click", () => {
    try { localStorage.removeItem(TOKEN_SCHLUESSEL); } catch { /* nichts gespeichert */ }
    feld.value = "";
    meldung(ausgabe, "Token aus diesem Browser entfernt.");
    nachEntfernen();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const neu = feld.value.trim();
    if (!neu) return;
    meldung(ausgabe, "Prüfe Zugang …");
    try {
      await github(`${datei}?ref=${ZWEIG}`, {}, neu);
      speicherSchreiben(TOKEN_SCHLUESSEL, neu);
      dialog.close();
      nachSpeichern();
    } catch (fehler) {
      meldung(ausgabe, fehler.status === 401 || fehler.status === 404
        ? "Der Token passt nicht oder hat keinen Zugriff auf das Repository."
        : "GitHub ist gerade nicht erreichbar.", true);
    }
  });

  return oeffnen;
}

// Kamera und Galerie füllen dasselbe Foto; waehlen bekommt die Datei
function fotoWahlEinrichten(form, vorschau, waehlen) {
  form.querySelectorAll("[data-foto]").forEach((feld) => {
    feld.addEventListener("change", () => {
      if (!feld.files[0]) return;
      waehlen(feld.files[0]);
      if (vorschau.src.startsWith("blob:")) URL.revokeObjectURL(vorschau.src);
      vorschau.src = URL.createObjectURL(feld.files[0]);
      vorschau.hidden = false;
      feld.value = "";
    });
  });
}

// Vorschau beim Bearbeiten: vorhandenes Foto, sonst versteckt
function vorschauZeigen(vorschau, pfad) {
  if (vorschau.src.startsWith("blob:")) URL.revokeObjectURL(vorschau.src);
  vorschau.hidden = !pfad;
  if (pfad) {
    delete vorschau.dataset.versucht;
    vorschau.dataset.roh = pfad;
    vorschau.src = pfad;
  }
}

function vorschauNachladen(vorschau) {
  vorschau.addEventListener("error", () => {
    if (vorschau.dataset.versucht || !vorschau.dataset.roh || vorschau.src.startsWith("blob:")) return;
    vorschau.dataset.versucht = "1";
    vorschau.src = rohAdresse(vorschau.dataset.roh);
  });
}

// Fehlertext beim Speichern
function speicherFehler(fehler) {
  return fehler.status === 401
    ? "Der Token ist ungültig oder abgelaufen. Bitte unter „GitHub-Zugang“ neu hinterlegen."
    : `Speichern fehlgeschlagen: ${fehler.message}`;
}
