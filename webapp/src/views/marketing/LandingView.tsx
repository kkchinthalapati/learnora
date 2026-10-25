import { useEffect } from "react";

/* /app/landing used to be a second, React copy of the landing page. It had
 * drifted from the real one at / (landing.html): the old look, and claims
 * the app doesn't back ("Try the timer, no sign-up" when /timer needs an
 * account). There is one landing page now; this route sends an old link
 * there. A full navigation, because / is a static page outside the router. */
export function LandingView() {
  useEffect(() => {
    window.location.replace("/");
  }, []);
  return null;
}
