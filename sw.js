// Service Worker für den Offline-Modus. Strategie: immer zuerst das Netz, damit Änderungen sofort ankommen.
// Jede erfolgreiche Antwort wird zwischengespeichert; ohne Verbindung (oder wenn das Netz zu lange braucht)
// kommt die zuletzt gespeicherte Fassung. Seiten, die noch nie geöffnet wurden, sind offline nicht verfügbar.
// Firestore (Einkaufsliste) und die GitHub-API (Kaffee) laufen am Service Worker vorbei.

const CACHE = "rezepte-v1";
// Fremde Server, deren Dateien offline gebraucht werden: Schriften und das Firebase-SDK
const FREMDE = ["fonts.googleapis.com", "fonts.gstatic.com", "www.gstatic.com"];
// So lange auf das Netz warten, bevor eine gespeicherte Fassung genommen wird (schlechtes Netz im Laden)
const WARTEZEIT = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const anfrage = e.request;
  if (anfrage.method !== "GET") return;
  const url = new URL(anfrage.url);
  if (url.origin !== location.origin && !FREMDE.includes(url.hostname)) return;
  e.respondWith(netzZuerst(e, anfrage));
});

// Tipp auf die Mitteilung eines fertigen Küchentimers: offene Rezeptseite nach vorn holen
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const ziel = e.notification.data?.url;
    const offen = fenster.find((f) => f.url === ziel) || fenster[0];
    if (offen) return offen.focus();
    if (ziel) return self.clients.openWindow(ziel);
  })());
});

async function netzZuerst(e, anfrage) {
  const cache = await caches.open(CACHE);
  const netz = fetch(anfrage).then((antwort) => {
    if (antwort.ok || antwort.type === "opaque") e.waitUntil(cache.put(anfrage, antwort.clone()));
    return antwort;
  });
  // Kommt die gespeicherte Fassung zum Zug, darf ein späterer Netzfehler nicht als unbehandelt gemeldet werden
  netz.catch(() => {});

  // Gespeicherte Fassung: exakt, sonst ohne ?v=… bzw. ?portionen=… (ältere Version derselben Datei)
  const gespeichert = () => cache.match(anfrage).then((t) => t || cache.match(anfrage, { ignoreSearch: true }));

  try {
    const zuLangsam = new Promise((_, nein) => setTimeout(() => nein(new Error("langsam")), WARTEZEIT));
    return await Promise.race([netz, zuLangsam]);
  } catch {
    const treffer = await gespeichert();
    if (treffer) return treffer;
    // Nichts gespeichert: auf das Netz weiter warten, notfalls Hinweis-Seite
    try {
      return await netz;
    } catch {
      if (anfrage.mode === "navigate") return offlineSeite();
      return Response.error();
    }
  }
}

function offlineSeite() {
  return new Response(`<!doctype html><html lang="de"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline</title>
<body style="font-family:system-ui,sans-serif;padding:2rem;max-width:32rem;margin:auto;line-height:1.5">
<h1>Keine Verbindung</h1>
<p>Diese Seite wurde auf diesem Gerät noch nicht geöffnet und ist deshalb offline nicht verfügbar.
Bereits besuchte Rezepte, der Wochenplaner und die Einkaufsliste funktionieren auch ohne Netz.</p>
<p><a href="${self.registration.scope}">Zur Übersicht</a></p></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
