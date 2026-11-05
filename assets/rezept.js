// Portionsrechner für Rezeptseiten.
// Erwartet:
//   <div class="portionen" data-basis="4"> mit Knöpfen [data-schritt="-1"], [data-schritt="1"] und <output>
//   <b data-menge="200" data-einheit="g"> in den Zutaten (ohne data-menge bleibt die Zeile unverändert)
//   optional <span data-einzahl="Zwiebel" data-mehrzahl="Zwiebeln"> für den Zutatennamen

(function () {
  const regler = document.querySelector(".portionen[data-basis]");
  if (!regler) return;

  const basis = Number(regler.dataset.basis);
  const anzeige = regler.querySelector("output");
  const weniger = regler.querySelector('[data-schritt="-1"]');
  const mehr = regler.querySelector('[data-schritt="1"]');
  // Obergrenze mindestens doppelte Grundmenge, damit auch Rezepte mit 60 Stück verdoppelt werden können
  const MIN = 1, MAX = Math.max(24, basis * 2);

  const EINHEIT_MEHRZAHL = { Dose: "Dosen", Prise: "Prisen", Scheibe: "Scheiben", Packung: "Packungen", Zehe: "Zehen", Tasse: "Tassen", Becher: "Becher", Glas: "Gläser", Flasche: "Flaschen", Messerspitze: "Messerspitzen" };
  const BRUECHE = { 0.25: "¼", 0.5: "½", 0.75: "¾" };

  function zahl(wert, einheit) {
    // Gramm und Milliliter auf sinnvolle Schritte runden, alles andere auf Viertel
    if (einheit === "g" || einheit === "ml") {
      const schritt = wert >= 200 ? 10 : wert >= 30 ? 5 : 1;
      return String(Math.max(schritt, Math.round(wert / schritt) * schritt));
    }
    if (einheit === "kg" || einheit === "l") {
      return (Math.round(wert * 10) / 10).toLocaleString("de-DE");
    }
    const viertel = Math.max(0.25, Math.round(wert * 4) / 4);
    const ganz = Math.floor(viertel);
    const rest = BRUECHE[viertel - ganz] || "";
    return ganz ? `${ganz}${rest}` : rest;
  }

  function zahlwert(text) {
    return Number(text.replace("¼", ".25").replace("½", ".5").replace("¾", ".75").replace(",", ".")) || 0;
  }

  function setzen(portionen) {
    const faktor = portionen / basis;
    anzeige.value = portionen;
    weniger.disabled = portionen <= MIN;
    mehr.disabled = portionen >= MAX;

    for (const b of document.querySelectorAll(".zutaten [data-menge]")) {
      const einheit = b.dataset.einheit || "";
      const text = zahl(Number(b.dataset.menge) * faktor, einheit);
      const viele = zahlwert(text) > 1;
      const einheitText = viele && EINHEIT_MEHRZAHL[einheit] ? EINHEIT_MEHRZAHL[einheit] : einheit;
      b.textContent = einheitText ? `${text} ${einheitText}` : text;

      const name = b.parentElement.querySelector("[data-einzahl]");
      if (name) name.textContent = viele ? name.dataset.mehrzahl : name.dataset.einzahl;
    }
  }

  regler.addEventListener("click", (e) => {
    const knopf = e.target.closest("button[data-schritt]");
    if (!knopf) return;
    const neu = Math.min(MAX, Math.max(MIN, Number(anzeige.value) + Number(knopf.dataset.schritt)));
    setzen(neu);
  });

  // ---------- Zutaten auf die Einkaufsliste ----------
  // Übernimmt die sichtbaren Zutaten (aktuelle Portionen, gewählte Variante) über localStorage
  // ("einkaufsliste-import", wie der Wochenplaner) und öffnet die Einkaufsliste. Zutaten ohne Menge (Salz, Fett
  // für die Form), Prisen und Wasser bleiben weg, gleiche Zutaten aus mehreren Gruppen werden zusammengezählt.
  const NICHT_KAUFEN = /^(lauwarmes |warmes |kaltes |heißes )?wasser$/i;

  function nameBereinigen(name) {
    const ohne = name.replace(/\s*\([^)]*\)/g, "").replace(/,\s*\p{Ll}.*$/u, "").replace(/^etwas\s+/i, "").trim();
    return ohne.charAt(0).toUpperCase() + ohne.slice(1);
  }

  function einkaufPosten() {
    const faktor = Number(anzeige.value) / basis;
    const posten = new Map();
    for (const li of document.querySelectorAll(".zutaten li")) {
      if (li.closest("[hidden]")) continue;
      const b = li.querySelector("b[data-menge]");
      // Ohne Menge (Salz, Fett für die Form) und Prisen braucht man nicht einzukaufen
      if (!b || ["Prise", "Messerspitze"].includes(b.dataset.einheit)) continue;
      const span = li.querySelector("[data-einzahl]");
      const text = li.textContent.replace(b.textContent, "").trim();
      const einzahl = nameBereinigen(span ? span.dataset.einzahl : text);
      if (!einzahl || NICHT_KAUFEN.test(einzahl)) continue;
      const schluessel = einzahl.toLowerCase();
      if (!posten.has(schluessel)) {
        posten.set(schluessel, { einzahl, mehrzahl: nameBereinigen(span ? span.dataset.mehrzahl : text), mengen: new Map() });
      }
      const p = posten.get(schluessel);
      const einheit = b.dataset.einheit || "";
      p.mengen.set(einheit, (p.mengen.get(einheit) || 0) + Number(b.dataset.menge) * faktor);
    }
    return [...posten.values()].map((p) => {
      const teile = [...p.mengen].map(([einheit, wert]) => {
        const t = zahl(wert, einheit);
        const e = zahlwert(t) > 1 && EINHEIT_MEHRZAHL[einheit] ? EINHEIT_MEHRZAHL[einheit] : einheit;
        return e ? `${t} ${e}` : t;
      });
      const stueck = p.mengen.get("") || 0;
      return { name: stueck > 1 ? p.mehrzahl : p.einzahl, menge: teile.join(" + ") };
    });
  }

  const einkaufKnopf = document.createElement("button");
  einkaufKnopf.type = "button";
  einkaufKnopf.className = "knopf zweit klein einkauf-uebernehmen";
  einkaufKnopf.textContent = "Auf die Einkaufsliste";
  regler.closest(".zutaten").append(einkaufKnopf);
  einkaufKnopf.addEventListener("click", () => {
    const titel = document.querySelector("h1").innerText.replace(/\s+/g, " ").trim();
    const portionen = Number(anzeige.value);
    try {
      localStorage.setItem("einkaufsliste-import", JSON.stringify({
        quelle: "rezept",
        titel,
        posten: einkaufPosten().map((p) => ({ ...p, rezepte: `${titel} (${portionen} ${portionen === 1 ? "Portion" : "Portionen"})` })),
      }));
    } catch {
      return;
    }
    location.href = new URL("../einkaufsliste.html", location.href).href;
  });

  // Der Wochenplaner verlinkt bei Gerichten für zwei Tage mit ?portionen=…
  const ausLink = Number(new URLSearchParams(location.search).get("portionen"));
  setzen(ausLink >= MIN && ausLink <= MAX ? Math.round(ausLink) : basis);
})();

// Varianten-Umschalter (z. B. con/sin Carne):
//   <div class="chips varianten" role="group" aria-label="Variante">
//     <button type="button" class="chip ohne-punkt" data-variante="con" aria-pressed="true">…</button> …
//   Elemente mit data-nur="con" (auch mehrere: data-nur="con sin") sind nur in dieser Variante sichtbar.
//   ?variante=… im Link wählt die Variante vor; Übersicht und Wochenplaner verlinken so auf Einträge derselben Seite.
(function () {
  const knoepfe = [...document.querySelectorAll("[data-variante]")];
  if (!knoepfe.length) return;
  const namen = knoepfe.map((k) => k.dataset.variante);

  function waehlen(variante) {
    for (const k of knoepfe) k.setAttribute("aria-pressed", String(k.dataset.variante === variante));
    for (const e of document.querySelectorAll("[data-nur]")) e.hidden = !e.dataset.nur.split(" ").includes(variante);
    const titel = document.querySelector("h1");
    if (titel) document.title = titel.innerText.replace(/\s+/g, " ").trim();
    const url = new URL(location.href);
    url.searchParams.set("variante", variante);
    history.replaceState(null, "", url);
  }

  for (const k of knoepfe) k.addEventListener("click", () => waehlen(k.dataset.variante));
  const ausLink = new URLSearchParams(location.search).get("variante");
  waehlen(namen.includes(ausLink) ? ausLink : namen[0]);
})();
