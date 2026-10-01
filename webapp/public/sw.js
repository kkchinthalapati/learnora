/* Learnora's Service Worker
 *
 * Capabilities:
 *  1. Enhanced offline caching strategy:
 *     - App-shell navigation: Network-first with offline cache fallback.
 *     - Static assets (JS, CSS, fonts, images, webmanifest): Stale-While-Revalidate with dynamic caching.
 *     - Dynamic/API/Edge requests: Network-only pass-through (managed by offlineSync & React Query).
 *  2. Offline flashcard review: the page hands over the files the review
 *     screen needs (CACHE_URLS, below). Card data is NOT cached here — it is
 *     one student's private data and lives in IndexedDB, keyed to them and
 *     wiped on sign-out (src/lib/offlineCards.ts). This worker only ever
 *     holds the app's own static files and its one HTML shell.
 *  3. Web Push notifications & notification click routing.
 */

/* Bump both when caching behaviour changes: `activate` deletes every cache
 * not named here, so a new version never serves an old one's files. */
const SHELL_CACHE = "learnora-shell-v4";
const ASSETS_CACHE = "learnora-assets-v4";
const CURRENT_CACHES = [SHELL_CACHE, ASSETS_CACHE];

/* Every route under /app/ is the same index.html (vercel.json rewrites them
 * all), so the shell is kept under ONE key and refreshed by every online
 * navigation. Caching a copy per URL, as before, let an offline visit to a
 * route last opened weeks ago boot an old build whose files are long gone. */
const SHELL_KEY = "/app/index.html";

/* Hashed bundles accumulate across deploys (sw.js itself only changes when
 * this file does). Least-recently-fetched entries go past this; SWR re-puts
 * an entry on every fetch, which moves it to the end. */
const MAX_ASSET_ENTRIES = 300;

/* Servers commonly send `Vary: Origin` on static files (vite preview does).
 * The page requests its entry bundles with an Origin header (they carry
 * `crossorigin`) while the worker's own fetches don't, so a Vary-respecting
 * lookup misses files that are sitting right there in the cache — which is
 * how an offline start came up blank. These are this origin's own static
 * files; nothing about them varies by Origin. */
const MATCH = { ignoreVary: true };

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

const STATIC_EXTENSIONS =
  /\.(?:js|css|woff2?|ttf|png|jpe?g|gif|svg|ico|webp)$/i;

function isStaticAssetUrl(url) {
  return (
    STATIC_EXTENSIONS.test(url.pathname) ||
    url.pathname.includes("/assets/") ||
    url.pathname.endsWith("/manifest.webmanifest")
  );
}

async function trimAssets() {
  const cache = await caches.open(ASSETS_CACHE);
  const keys = await cache.keys();
  const excess = keys.length - MAX_ASSET_ENTRIES;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

/* The page asks for the files the offline review screen needs (it cannot be
 * precached at install: this file doesn't know the build's hashed names).
 * Only this app's own static files are accepted — never an API response,
 * never another origin — so a message can't turn this cache into a store
 * for anything a student's session can see. */
async function cacheAppFiles(urls) {
  const scope = new URL(self.registration.scope);
  const cache = await caches.open(ASSETS_CACHE);
  for (const raw of urls) {
    let url;
    try {
      url = new URL(raw, scope);
    } catch {
      continue;
    }
    if (url.origin !== scope.origin) continue;
    if (!url.pathname.startsWith(scope.pathname)) continue;
    if (!isStaticAssetUrl(url)) continue;
    const request = new Request(url.href);
    if (await cache.match(request, MATCH)) continue;
    try {
      const response = await fetch(request);
      if (response && response.status === 200) await cache.put(request, response);
    } catch {
      /* Offline or gone — the next warm-up will try again. */
    }
  }
  /* The shell too, so an offline start boots the build these files are from. */
  try {
    const shell = await fetch(new Request(scope.href, { cache: "no-cache" }));
    if (shell && shell.status === 200) {
      await (await caches.open(SHELL_CACHE)).put(SHELL_KEY, shell);
    }
  } catch {
    /* Keep the shell we have. */
  }
  await trimAssets();
}

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
  if (event.data?.type === "CACHE_URLS" && Array.isArray(event.data.urls)) {
    event.waitUntil(cacheAppFiles(event.data.urls.slice(0, 400)));
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
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

  /* Only this site's own files. Google's font files matched the static-asset
     rule below, so the worker re-fetched them itself — and a worker's fetch()
     is held to the page CSP's connect-src, which doesn't list
     fonts.gstatic.com. With nothing cached, respondWith got undefined and
     every font failed with a network error in production. The browser loads
     other origins' files better on its own. */
  if (url.origin !== self.location.origin) return;

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
            event.waitUntil(
              caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_KEY, copy)),
            );
          }
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match(SHELL_KEY, MATCH)) ||
            (await caches.match("/app/", MATCH)) ||
            (await caches.match("/index.html", MATCH));
          if (cached) return cached;
          throw new Error("Offline and no shell cache available.");
        }),
    );
    return;
  }

  // 2. Static assets & bundle chunks: Stale-While-Revalidate
  if (isStaticAssetUrl(url)) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request, MATCH);

        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              /* Not event.waitUntil: when the cached copy was served, this
                 runs after the event has finished and waitUntil would throw. */
              cache
                .put(request, networkResponse.clone())
                .then(trimAssets)
                .catch(() => {});
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
      icon: "/app/learnora.jpg",
      badge: "/app/learnora.jpg",
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
