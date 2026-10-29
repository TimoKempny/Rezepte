// Küchentimer für Rezeptseiten.
// Zeitangaben in den Zubereitungsschritten (".schritte li", z. B. "etwa 20 Minuten", "10–13 Minuten", "1 Stunde")
// werden zu Knöpfen, die einen Timer starten. Bei Spannen läuft der Timer bis zur kürzeren Zeit, danach lässt er
// sich minutenweise verlängern. Mehrere Timer können gleichzeitig laufen und stehen in der Leiste unten.
// Endzeiten liegen im localStorage, damit die Timer ein Neuladen überstehen. Ist ein Timer fertig: Ton,
// Vibration und – wenn erlaubt – eine Mitteilung. Solange ein Timer läuft, bleibt der Bildschirm an.

(function () {
  const schritte = document.querySelectorAll(".schritte > li");
  if (!schritte.length) return;

  // Zahl oder Spanne ("10–13", "2,5") bzw. "eine (halbe)", danach die Einheit
  const MUSTER = /(?<![\wäöüß,–-])(?:(\d+(?:,\d+)?)(?:\s*[–-]\s*(\d+(?:,\d+)?))?|(einer?)(\s+halben?)?)\s+(Minuten?|Min\.|Stunden?|Std\.)(?![\wäöüß])/gi;
  // Kürzer ist kein Timer nötig, länger (über Nacht, Sauerteig) läuft kein Browser-Tab durch
  const MIN_SEK = 60, MAX_SEK = 12 * 3600;
  const SPEICHER = "kuechentimer:" + location.pathname;
  const ALARM_DAUER = 60000;

  const rezept = (document.querySelector("h1")?.textContent || document.title).trim();
  let timer = laden();
  let takt = null, ton = null, sperre = null, alarmBis = 0, letzterPiep = 0;

  // ---------- Zeitangaben erkennen ----------

  function sekunden(zahl, einheit) {
    return Math.round(Number(zahl.replace(",", ".")) * (/^(Std|Stunde)/i.test(einheit) ? 3600 : 60));
  }

  function treffer(text) {
    const liste = [];
    for (const m of text.matchAll(MUSTER)) {
      const [ganz, von, bis, , halb, einheit] = m;
      const davor = text.slice(0, m.index);
      const danach = text.slice(m.index + ganz.length);
      // "5 Minuten vor Ende", "in den letzten 10 Minuten", "alle 10 Minuten" sind keine Wartezeiten
      if (/^\s+vor\b/.test(danach) || /\b(letzten|alle|jeweils)\s+$/i.test(davor)) continue;

      const zahl = von || (halb ? "0,5" : "1");
      const dauer = sekunden(zahl, einheit);
      if (dauer < MIN_SEK || dauer > MAX_SEK) continue;
      liste.push({ index: m.index, laenge: ganz.length, dauer, bis: bis ? sekunden(bis, einheit) : 0, wort: taetigkeit(danach) });
    }
    return liste;
  }

  // Das Verb nach der Zeitangabe ("… 20 Minuten im Ofen backen") wird zum Namen des Timers
  function taetigkeit(danach) {
    const satz = danach.split(/[.,;:()!?]/)[0];
    const woerter = satz.trim().split(/\s+/).slice(0, 6);
    // Nach einem Artikel oder vor einem Nomen ist es ein Adjektiv ("zu einem glatten Teig kneten")
    const verb = woerter.find((w, i) => /^[a-zäöüß]{3,}(en|ern|eln)$/.test(w)
      && !/^[A-ZÄÖÜ]/.test(woerter[i + 1] || "") && !/^(einem|einen|einer|dem|den|der|im|zum)$/.test(woerter[i - 1]));
    return verb || "";
  }

  function knopfBauen(text, t, schritt) {
    const knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "zeit-knopf";
    knopf.dataset.dauer = t.dauer;
    if (t.bis) knopf.dataset.bis = t.bis;
    knopf.dataset.schritt = schritt;
    knopf.dataset.wort = t.wort;
    knopf.title = `Timer über ${dauerText(t.dauer)} starten`;
    knopf.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/></svg>';
    knopf.append(text);
    return knopf;
  }

  schritte.forEach((li, i) => {
    if (!treffer(li.textContent).length) return;
    // Die Schritte sind ein Raster (Nummer | Text): den Inhalt zusammenhalten, damit der Knopf im Fließtext bleibt
    const huelle = document.createElement("span");
    huelle.append(...li.childNodes);
    li.append(huelle);

    const knoten = [];
    const gang = document.createTreeWalker(huelle, NodeFilter.SHOW_TEXT);
    while (gang.nextNode()) knoten.push(gang.currentNode);
    for (const k of knoten) {
      const liste = treffer(k.data);
      if (!liste.length) continue;
      const stueck = document.createDocumentFragment();
      let pos = 0;
      for (const t of liste) {
        stueck.append(k.data.slice(pos, t.index), knopfBauen(k.data.substr(t.index, t.laenge), t, i + 1));
        pos = t.index + t.laenge;
      }
      stueck.append(k.data.slice(pos));
      k.replaceWith(stueck);
    }
  });

  const knoepfe = [...document.querySelectorAll(".zeit-knopf")];
  knoepfe.forEach((k, i) => (k.dataset.nr = i));
  if (!knoepfe.length) return;

  // ---------- Leiste mit den laufenden Timern ----------

  const leiste = document.createElement("aside");
  leiste.className = "timer-leiste";
  leiste.setAttribute("aria-label", "Timer");
  leiste.innerHTML = '<ul></ul><p class="nur-screenreader" aria-live="assertive"></p>';
  document.body.append(leiste);
  const liste = leiste.querySelector("ul");
  const ansage = leiste.querySelector("p");

  function dauerText(s) {
    const h = Math.floor(s / 3600), min = Math.round((s % 3600) / 60);
    if (!h) return `${min} Min.`;
    return min ? `${h} Std. ${min} Min.` : `${h} Std.`;
  }

  function uhr(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
    const zwei = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${zwei(m)}:${zwei(sek)}` : `${m}:${zwei(sek)}`;
  }

  const rest = (t) => (t.ende ? Math.max(0, Math.ceil((t.ende - Date.now()) / 1000)) : t.rest);

  function zeichnen() {
    liste.replaceChildren(...timer.map((t) => {
      const li = document.createElement("li");
      li.className = "timer";
      li.dataset.id = t.id;
      if (t.fertig) li.dataset.fertig = "";
      const spanne = t.bis ? ` · bis ${dauerText(t.bis)}` : "";
      li.innerHTML = `
        <div class="timer-info">
          <span class="timer-name"></span>
          <span class="timer-zeit" role="timer"></span>
        </div>
        <div class="timer-knoepfe">
          ${t.fertig ? "" : `<button type="button" data-aktion="pause">${t.ende ? "Pause" : "Weiter"}</button>`}
          <button type="button" data-aktion="mehr" aria-label="Eine Minute mehr">+1 Min.</button>
          <button type="button" data-aktion="weg" aria-label="Timer beenden">${t.fertig ? "Aus" : "×"}</button>
        </div>`;
      li.querySelector(".timer-name").textContent = `Schritt ${t.schritt}${t.wort ? " · " + t.wort : ""}${spanne}`;
      return li;
    }));
    leiste.hidden = !timer.length;
    document.body.style.paddingBottom = timer.length ? `${leiste.offsetHeight + 16}px` : "";
    for (const k of knoepfe) k.classList.toggle("laeuft", timer.some((t) => t.nr === k.dataset.nr));
    aktualisieren();
  }

  function aktualisieren() {
    for (const t of timer) {
      if (!t.fertig && t.ende && rest(t) === 0) fertig(t);
      const feld = liste.querySelector(`[data-id="${t.id}"] .timer-zeit`);
      if (feld) feld.textContent = t.fertig ? "Fertig!" : uhr(rest(t));
    }
    if (alarmBis > Date.now() && Date.now() - letzterPiep > 2000) piepen();
    if (alarmBis && alarmBis <= Date.now()) alarmBis = 0;

    const laeuft = timer.some((t) => t.ende && !t.fertig) || alarmBis;
    if (laeuft && !takt) takt = setInterval(aktualisieren, 250);
    if (!laeuft && takt) { clearInterval(takt); takt = null; }
    wachHalten(timer.some((t) => t.ende && !t.fertig));
  }

  function fertig(t) {
    t.fertig = true;
    t.ende = null;
    speichern();
    zeichnen();
    ansage.textContent = `Timer fertig: Schritt ${t.schritt}${t.wort ? ", " + t.wort : ""}`;
    alarmBis = Date.now() + ALARM_DAUER;
    letzterPiep = 0;
    navigator.vibrate?.([400, 200, 400, 200, 400]);
    melden(t);
  }

  // ---------- Bedienung ----------

  document.addEventListener("click", (e) => {
    const knopf = e.target.closest(".zeit-knopf");
    if (!knopf) return;
    tonVorbereiten();
    const vorhanden = timer.find((t) => t.nr === knopf.dataset.nr);
    if (vorhanden) {
      // Schon gestellt: in der Leiste kurz hervorheben statt doppelt starten
      const zeile = liste.querySelector(`[data-id="${vorhanden.id}"]`);
      zeile.classList.remove("blinkt");
      void zeile.offsetWidth;
      zeile.classList.add("blinkt");
      return;
    }
    timer.push({
      id: Date.now().toString(36),
      nr: knopf.dataset.nr,
      schritt: Number(knopf.dataset.schritt),
      wort: knopf.dataset.wort,
      bis: Number(knopf.dataset.bis) || 0,
      ende: Date.now() + Number(knopf.dataset.dauer) * 1000,
      rest: 0,
      fertig: false,
    });
    speichern();
    zeichnen();
    erlaubnisFragen();
  });

  liste.addEventListener("click", (e) => {
    const knopf = e.target.closest("button[data-aktion]");
    if (!knopf) return;
    tonVorbereiten();
    const t = timer.find((x) => x.id === knopf.closest(".timer").dataset.id);
    const aktion = knopf.dataset.aktion;
    if (aktion === "pause") {
      if (t.ende) { t.rest = rest(t); t.ende = null; } else t.ende = Date.now() + t.rest * 1000;
    } else if (aktion === "mehr") {
      if (t.fertig) { t.fertig = false; t.ende = Date.now() + 60000; }
      else if (t.ende) t.ende += 60000;
      else t.rest += 60;
    } else {
      timer = timer.filter((x) => x !== t);
    }
    if (!timer.some((x) => x.fertig)) alarmBis = 0;
    speichern();
    zeichnen();
  });

  // ---------- Ton, Mitteilung, Bildschirm ----------

  // Der Ton muss bei einem Tipp freigeschaltet werden, sonst bleibt er auf dem Handy stumm
  function tonVorbereiten() {
    const Kontext = window.AudioContext || window.webkitAudioContext;
    if (!ton && Kontext) ton = new Kontext();
    ton?.resume?.();
  }

  function piepen() {
    letzterPiep = Date.now();
    if (!ton) return;
    ton.resume?.();
    const jetzt = ton.currentTime;
    for (const start of [0, 0.22, 0.44]) {
      const osz = ton.createOscillator(), laut = ton.createGain();
      osz.frequency.value = 880;
      laut.gain.setValueAtTime(0.0001, jetzt + start);
      laut.gain.exponentialRampToValueAtTime(0.3, jetzt + start + 0.02);
      laut.gain.exponentialRampToValueAtTime(0.0001, jetzt + start + 0.18);
      osz.connect(laut).connect(ton.destination);
      osz.start(jetzt + start);
      osz.stop(jetzt + start + 0.2);
    }
  }

  function erlaubnisFragen() {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }

  async function melden(t) {
    if (!document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
    const titel = `Timer fertig: Schritt ${t.schritt}${t.wort ? " · " + t.wort : ""}`;
    const optionen = { body: rezept, tag: "timer-" + t.id, icon: new URL("../assets/app-192.png", location).href, vibrate: [400, 200, 400], data: { url: location.href } };
    try {
      // Auf Android gehen Mitteilungen nur über den Service Worker
      const anmeldung = await navigator.serviceWorker?.getRegistration();
      if (anmeldung) await anmeldung.showNotification(titel, optionen);
      else new Notification(titel, optionen);
    } catch {
      // Ohne Mitteilung bleiben Ton und Anzeige
    }
  }

  async function wachHalten(an) {
    if (!("wakeLock" in navigator)) return;
    try {
      if (an && !sperre && document.visibilityState === "visible") {
        sperre = await navigator.wakeLock.request("screen");
        sperre.addEventListener("release", () => (sperre = null));
      } else if (!an && sperre) {
        await sperre.release();
      }
    } catch {
      // Energiesparmodus o. Ä.: der Timer läuft trotzdem
    }
  }

  // Im Hintergrund drosselt der Browser den Takt: beim Zurückkehren sofort nachziehen
  document.addEventListener("visibilitychange", () => { if (!document.hidden) aktualisieren(); });

  // ---------- Speicher ----------

  function laden() {
    try {
      const daten = JSON.parse(localStorage.getItem(SPEICHER));
      return Array.isArray(daten) ? daten : [];
    } catch {
      return [];
    }
  }

  function speichern() {
    try {
      if (timer.length) localStorage.setItem(SPEICHER, JSON.stringify(timer));
      else localStorage.removeItem(SPEICHER);
    } catch {
      // Ohne Speicher gelten die Timer nur bis zum Neuladen
    }
  }

  // Timer, die abgelaufen sind, während die Seite zu war, gelten als fertig, aber ohne Alarm
  for (const t of timer) if (t.ende && t.ende <= Date.now()) { t.fertig = true; t.ende = null; }
  timer = timer.filter((t) => knoepfe[t.nr]);
  zeichnen();
})();
