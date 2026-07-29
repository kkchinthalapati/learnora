import styles from "./SignInRequired.module.css";

/* Sign-in still belongs to the vanilla app: its auth screen lives in the root
 * index.html, and porting it is out of scope for this migration (no view moves
 * before its own step). Until then, an unauthenticated deep link into a
 * migrated route lands here.
 *
 * This deliberately does *not* call window.location.replace(). The vanilla app
 * is served from "/", which is also what the dev server serves for this app —
 * so an automatic bounce loops forever locally (guard → /login → "/" → React
 * app → guard). A visible page with a real link works in every environment and
 * tells the user what happened instead of spinning.
 *
 * Both apps share one Supabase session, so signing in over there is enough:
 * AuthProvider's onAuthStateChange picks it up on return. Revisit whether to
 * auto-redirect at Step 7, when the path-prefix rewrites make "/" unambiguous. */

const VANILLA_APP_URL = "/";

export function SignInRequired() {
  return (
    <main className={styles.wrap}>
      <h1 className={styles.title}>Sign in required</h1>
      <p className={styles.body}>
        Your session has ended, or you opened this page in a new browser. Sign
        in to Learnora to continue.
      </p>
      <a className={styles.action} href={VANILLA_APP_URL}>
        Go to sign in
      </a>
    </main>
  );
}
