import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "./Button";
import {
  CONSENT_EVENT,
  readCookieConsent,
  writeCookieConsent,
  type CookieConsent,
} from "../lib/cookieConsent";
import { initMonitoring } from "../lib/monitoring";
import styles from "./CookieBanner.module.css";

/* Asks once, at the bottom of the screen, and never blocks the app: the
   essential storage it describes is already needed to show this page.
   "Essential only" is offered as plainly as "Accept all". */
export function CookieBanner() {
  const [choice, setChoice] = useState<CookieConsent | null>(() =>
    readCookieConsent(),
  );

  useEffect(() => {
    const onChange = (event: Event) =>
      setChoice((event as CustomEvent<CookieConsent | null>).detail);
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  if (choice) return null;

  const decide = (next: CookieConsent) => {
    writeCookieConsent(next);
    if (next === "all") void initMonitoring();
  };

  return (
    <section className={styles.banner} aria-labelledby="cookie-banner-title">
      <div className={styles.copy}>
        <h2 id="cookie-banner-title" className={styles.title}>
          Cookies on Learnora
        </h2>
        <p className={styles.text}>
          We use essential cookies and browser storage to keep you signed in and
          remember your settings. With your OK, we'll also send crash reports
          (no names or passwords) so we can fix bugs. No advertising or
          cross-site tracking either way.{" "}
          <Link to="/privacy#section-6" className={styles.link}>
            Privacy policy
          </Link>
        </p>
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => decide("essential")}>
          Essential only
        </Button>
        <Button variant="primary" onClick={() => decide("all")}>
          Accept all
        </Button>
      </div>
    </section>
  );
}
