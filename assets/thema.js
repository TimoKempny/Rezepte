// Hell-/Dunkelmodus. Wird im <head> geladen, damit die gespeicherte Wahl
// greift, bevor die Seite gezeichnet wird. Ohne Wahl folgt die Seite dem System.
// Außerdem: Farbe der Statusleiste (installierte App) und Anmeldung des Service Workers.

(function () {
  // Offline-Modus und Installierbarkeit: sw.js liegt im Hauptordner, eine Ebene über diesem Skript
  if ("serviceWorker" in navigator && window.isSecureContext) {
    const sw = new URL("../sw.js", document.currentScript.src);
    window.addEventListener("load", () => navigator.serviceWorker.register(sw).catch(() => {}));
  }

  const wurzel = document.documentElement;
  const systemDunkel = window.matchMedia("(prefers-color-scheme: dark)");

  try {
    const gespeichert = localStorage.getItem("thema");
    if (gespeichert === "light" || gespeichert === "dark") wurzel.dataset.theme = gespeichert;
  } catch {
    // Ohne Speicher gilt die Systemeinstellung
  }

  const istDunkel = () => (wurzel.dataset.theme || (systemDunkel.matches ? "dark" : "light")) === "dark";

  // Statusleiste in der Farbe der Kopfzeile (Token --flaeche des aktiven Designs)
  const statusleiste = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const farbe = getComputedStyle(wurzel).getPropertyValue("--flaeche").trim();
    if (meta && farbe) meta.content = farbe;
  };
  statusleiste();

  document.addEventListener("DOMContentLoaded", () => {
    const knopf = document.getElementById("thema-knopf");
    systemDunkel.addEventListener("change", statusleiste);
    if (!knopf) return;

    const text = knopf.querySelector(".thema-text");
    // Der Knopf nennt das Design, zu dem er wechselt
    const aktualisieren = () => {
      const dunkel = istDunkel();
      knopf.dataset.dunkel = String(dunkel);
      text.textContent = dunkel ? "Hell" : "Dunkel";
      knopf.title = dunkel ? "Helles Design einschalten" : "Dunkles Design einschalten";
      statusleiste();
    };

    knopf.addEventListener("click", () => {
      const neu = istDunkel() ? "light" : "dark";
      wurzel.dataset.theme = neu;
      try { localStorage.setItem("thema", neu); } catch { /* nur für diese Sitzung */ }
      aktualisieren();
    });
    systemDunkel.addEventListener("change", aktualisieren);
    aktualisieren();
  });
})();
