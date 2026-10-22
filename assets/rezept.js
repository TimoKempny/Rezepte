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

  const EINHEIT_MEHRZAHL = { Dose: "Dosen", Prise: "Prisen", Scheibe: "Scheiben", Packung: "Packungen", Zehe: "Zehen", Tasse: "Tassen", Becher: "Becher", Glas: "Gläser", Flasche: "Flaschen" };
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

  setzen(basis);
})();
