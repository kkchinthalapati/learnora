/* Learnora's Service Worker
 *
 * Capabilities:
 *  1. Enhanced offline caching strategy:
 *     - App-shell navigation: Network-first with offline cache fallback.
 *     - Static assets (JS, CSS, fonts, images, webmanifest): Stale-While-Revalidate with dynamic caching.
 *     - Dynamic/API/Edge requests: Network-only pass-through (managed by offlineSync & React Query).
 *  2. Web Push notifications & notification click routing.
 */

const SHELL_CACHE = "learnora-shell-v2";
const ASSETS_CACHE = "learnora-assets-v2";
const CURRENT_CACHES = [SHELL_CACHE, ASSETS_CACHE];

const PRECACHE_ASSETS = [
  "/app/",
  "/app/index.html",
  /* The app is served under /app/ (see vite.config's base), so its public
   * assets resolve there too — the bare "/learnora.jpg" and
   * "/manifest.webmanifest" 404'd, leaving the icon and manifest out of the
   * offline shell. */
  "/app/learnora.jpg",
  "/app/manifest.webmanifest",
];

const STATIC_EXTENSIONS = /\.(?:js|css|woff2?|ttf|png|jpe?g|gif|svg|ico|webp)$/i;

/* Deliberately no `skipWaiting()` here.
 *
 * Taking over immediately sounds like the helpful choice, but it cannot
 * actually update an open tab — that tab is already running the JavaScript it
 * downloaded, and swapping the worker underneath it changes nothing the
 * student can see. What it does do is remove the one signal the page could
 * have used: a worker sitting in `waiting` is precisely how the app knows a
 * new version exists (src/lib/appUpdate.ts). So the new worker waits, the page
 * offers a reload, and the message below is what the student's click sends. */
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => {
        return Promise.allSettled(
          PRECACHE_ASSETS.map((url) =>
            fetch(url)
              .then((res) => {
                if (res.ok) return cache.put(url, res);
              })
              .catch(() => {
                /* Offline during install - will cache on first navigation */
              }),
          ),
        );
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
            .filter((key) => !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept GET requests
  if (request.method !== "GET") return;

  // Never cache Supabase API, Edge Functions, or auth endpoints
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/functions/v1") ||
    url.pathname.startsWith("/rest/v1") ||
    url.pathname.startsWith("/auth/v1")
  ) {
    return;
  }

  // 1. Navigation requests: Network-first with Shell fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match(request)) ||
            (await caches.match("/app/")) ||
            (await caches.match("/app/index.html")) ||
            (await caches.match("/index.html"));
          if (cached) return cached;
          throw new Error("Offline and no shell cache available.");
        }),
    );
    return;
  }

  // 2. Static assets & bundle chunks: Stale-While-Revalidate
  const isStaticAsset =
    STATIC_EXTENSIONS.test(url.pathname) ||
    url.pathname.includes("/assets/") ||
    url.pathname.endsWith("/manifest.webmanifest");

  if (isStaticAsset) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      }),
    );
  }
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
