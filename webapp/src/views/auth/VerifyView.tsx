import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { useAuth } from "../../context/auth";
import { AuthShell } from "./AuthShell";
import styles from "./auth.module.css";

/* Email-verification landing page — replaces verify.html + verify.js.
 *
 * The vanilla pair was a static page that waited three seconds and then did
 * `window.location.replace("index.html" + window.location.hash)`, handing the
 * tokens along in the hash for the *other* page's Supabase client to consume.
 * That hop only existed because verify.html had no client of its own.
 *
 * Here the app's own client has `detectSessionInUrl: true`, so it exchanges the
 * tokens as soon as this route mounts, `AuthProvider` hears the resulting
 * SIGNED_IN, and the redirect is a router navigation with no page load and no
 * token ever being re-attached to a URL.
 *
 * The timeout is the failure path, not the happy one: an expired or reused link
 * leaves the client with nothing to exchange and fires no event at all, so
 * without a deadline this screen would spin forever. */

const VERIFY_TIMEOUT_MS = 8000;

export function VerifyView() {
  const { session, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), VERIFY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  if (session) return <Navigate to="/" replace />;

  if (timedOut && !loading) {
    return (
      <AuthShell
        title="Link expired"
        subtitle="This verification link is no longer valid."
        showLegal={false}
      >
        <div className={styles.centered}>
          <p className={styles.intro}>
            Verification links can only be used once, and they expire after a
            while. Try signing in — if your email still isn't confirmed, sign up
            again to get a fresh link.
          </p>
          <Link className={styles.link} to="/login">
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Account verified!"
      subtitle="Your email has been securely confirmed."
      showLegal={false}
    >
      <div className={styles.centered}>
        <p className={styles.intro} role="status">
          Taking you to your dashboard now…
        </p>
        <div className={styles.spinner} aria-hidden="true" />
      </div>
    </AuthShell>
  );
}
