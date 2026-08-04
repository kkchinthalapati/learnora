/* Learnora's service worker.
 *
 * Two jobs, kept deliberately small:
 *  1. Installability + a tiny offline app-shell cache, so reopening the app
 *     with no connection doesn't just show the browser's own offline page.
 *  2. Turn a Web Push message from the scheduled reminder edge function
 *     (see PUSH_NOTIFICATIONS.md) into a system notification, and route a
 *     click on it back into the app.
 *
 * Not a build artifact — Vite serves everything under webapp/public/
 * untouched, at the same path, in both dev and prod. That matters here
 * specifically: a service worker's scope is fixed to the directory it's
 * served from, so this has to be a static file next to index.html, not a
 * bundled asset with a hashed filename that would change its URL (and
 * therefore silently orphan the previous registration) on every deploy.
 */

const SHELL_CACHE = "learnora-shell-v1";
const SHELL_URL = "/app/";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(SHELL_URL))
      .catch(() => {
        /* Offline during install (e.g. first load over a flaky connection) —
           the shell just isn't cached yet; nothing else here depends on it. */
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/* Network-first for the app shell's own navigation, falling back to the
 * cached shell only when the network is unreachable. Everything else
 * (API calls, hashed JS/CSS bundles, fonts) passes straight through — the
 * hashed asset URLs already give the browser's normal HTTP cache correct
 * long-lived caching (see vercel.json's Cache-Control header), so a second
 * cache layer here would only add staleness risk for zero benefit. */
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => caches.match(SHELL_URL) ?? fetch(event.request),
    ),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Learnora", body: event.data.text() };
  }
  const { title = "Learnora", body, url = "/app/" } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/learnora.jpg",
      badge: "/learnora.jpg",
      data: { url },
    }),
  );
});

/* Focuses an already-open Learnora tab rather than always opening a new one
 * — the common case is "I have it open in another tab and forgot", not "I
 * have no tabs open at all". */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/app/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes("/app/") && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
