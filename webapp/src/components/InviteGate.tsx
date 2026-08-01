import { useEffect, useState, type ReactNode } from "react";
import { COMING_SOON_PATH, hasInviteAccess } from "../lib/inviteAccess";

/* Ports the pre-launch "coming soon" gate check (js/main.js:61-63) — the
 * very first thing that runs in the vanilla app, before its own router or
 * even the login form. It's a client-side, publicly-known password
 * (`coming-soon.html`) setting a localStorage flag; not real access
 * control, just a marketing wall to keep a general visitor from landing on
 * an unfinished app before launch.
 *
 * This app had no equivalent at all — found while auditing residual
 * vanilla-only behaviour. In production this app is already served at
 * `/app/*` (Step 21), so `/app/signup` was a real, live bypass of even that
 * weak wall. Ported for parity with the vanilla, at the same altitude: one
 * check, before anything else renders, covering every route including
 * `/login` — the vanilla's check ran before its own auth wall too.
 * Mounted in main.tsx, wrapping `<App />`, so it gates the entire tree. */

export function InviteGate({ children }: { children: ReactNode }) {
  const [allowed] = useState(hasInviteAccess);

  /* The redirect is a side effect, so it belongs in an effect, not the
     render body — but *not* rendering `children` happens synchronously on
     the same first render, so nothing gated ever flashes on screen while
     the effect is pending. */
  useEffect(() => {
    if (!allowed) window.location.replace(COMING_SOON_PATH);
  }, [allowed]);

  if (!allowed) return null;

  return <>{children}</>;
}
