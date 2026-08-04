import { urlBase64ToUint8Array } from "./push";

/* Registration + subscribe/unsubscribe wrappers around the two browser APIs
 * push.ts's pure helpers feed into. Split out from push.ts the same way
 * lib/notifications.ts splits "decide" from "do" — nothing here is unit
 * tested against a real browser API, so keeping it to thin wrappers (no
 * branching worth testing) is deliberate.
 *
 * `public/sw.js` is the service worker itself: install/activate, a minimal
 * offline app-shell cache, and the `push`/`notificationclick` handlers that
 * turn a server-sent push message into a system notification. */

const SW_URL = `${import.meta.env.BASE_URL}sw.js`;

/** Registers the service worker scoped to this app's base path (`/app/`),
 *  not the origin root — the vanilla app and this one are served
 *  side-by-side, and a root-scoped worker would intercept its requests too. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register(SW_URL, {
      scope: import.meta.env.BASE_URL,
    });
  } catch {
    // A blocked worker (e.g. an extension, or http:// in dev) shouldn't take
    // the rest of the app down with it.
    return null;
  }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    /* TS's DOM lib types `applicationServerKey` against a `Uint8Array<ArrayBuffer>`
     * specifically, but `urlBase64ToUint8Array` returns the more general
     * `Uint8Array<ArrayBufferLike>` — the runtime value is fine (a real
     * `ArrayBuffer`, never a `SharedArrayBuffer`), only the generic is wider
     * than the DOM type admits. */
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  const existing = await getExistingPushSubscription();
  if (existing) await existing.unsubscribe();
}
