import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { PasswordField } from "../../components/PasswordField";
import { useLogin } from "../../hooks/useAuthActions";
import { AuthShell } from "./AuthShell";
import { useAuthStatus } from "./useAuthStatus";
import { RedirectIfSignedIn } from "./RedirectIfSignedIn";
import styles from "./auth.module.css";

/* Sign-in — ports index.html:77-120 + js/main.js:541-565.
 *
 * The vanilla reloaded the page on success (`window.location.reload()`) because
 * the auth wall and the app were the same document and only a reload re-ran the
 * session check. Nothing here reloads: `AuthProvider` is subscribed to
 * `onAuthStateChange`, so a successful sign-in updates the session in place and
 * `RedirectIfSignedIn` moves the user on. That is also what makes the
 * `state.from` return trip work — a reload would lose it. */

export function LoginView() {
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { setStatus, node: statusNode } = useAuthStatus();
  const login = useLogin();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (login.isPending) return;
    setStatus(null);
    try {
      await login.mutateAsync({ email: email.trim(), password });
      /* No navigate() here on purpose — RedirectIfSignedIn owns that, so the
         session becoming live is the single trigger for leaving this screen,
         however it happened. */
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  }

  return (
    <RedirectIfSignedIn>
      <AuthShell
        title="Welcome back"
        subtitle="Sign in to your study workspace."
        status={statusNode}
      >
        <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
          <div className={styles.inputGroup}>
            <label htmlFor={emailId}>Email</label>
            <input
              id={emailId}
              type="email"
              placeholder="you@email.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <PasswordField
            id={passwordId}
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            labelSuffix={
              <Link className={styles.linkSmall} to="/forgot-password">
                Forgot Password?
              </Link>
            }
          />

          <Button
            type="submit"
            variant="primary"
            className={styles.submit}
            disabled={login.isPending}
          >
            {login.isPending ? "Signing in..." : "Log In →"}
          </Button>

          <p className={styles.toggleText}>
            New here?{" "}
            <Link className={styles.link} to="/signup">
              Create an account
            </Link>
          </p>
        </form>
      </AuthShell>
    </RedirectIfSignedIn>
  );
}
