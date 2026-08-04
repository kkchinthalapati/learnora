/* Pure helpers behind Web Push — kept separate from the browser-API calls in
 * api/push.ts and the service-worker registration in serviceWorker.ts, same
 * split lib/notifications.ts already draws between "decide" and "do".
 *
 * See PUSH_NOTIFICATIONS.md for the full picture: this is the client half of
 * a feature that also needs a VAPID keypair, a new `push_subscriptions`
 * table (supabase/migrations/20260804000000_add_push_notifications.sql) and
 * a scheduled edge function to actually send anything.
 */

/** True only when this browser can register a service worker and hold a
 *  push subscription. Safari on iOS needs the app installed to the home
 *  screen first even though both APIs are technically present — there is no
 *  feature-detectable way to tell that apart from here, so the caller finds
 *  out from `subscribe()` throwing instead. */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window
  );
}

/** A `PushSubscription`'s `applicationServerKey` option wants a `Uint8Array`,
 *  but VAPID public keys are handed out URL-safe base64. Standard atob/btoa
 *  vocabulary, ported rather than pulled in as a dependency — this exact
 *  function is the one everyone's blog post copies for this API. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export interface SerializedPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** `PushSubscription.toJSON()` types its `keys` as an optional plain object
 *  (the DOM lib can't express "always present after a successful
 *  subscribe"), so this is the one place that narrows it — the caller gets a
 *  typed shape or an explicit error instead of `keys?.p256dh` silently
 *  becoming `undefined` in the request body. */
export function serializeSubscription(
  subscription: PushSubscription,
): SerializedPushSubscription {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("Push subscription is missing its endpoint or keys.");
  }
  return { endpoint: json.endpoint, p256dh, auth };
}
