import { useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import {
  PasswordField,
  PasswordStrengthMeter,
} from "../../components/PasswordField";
import { initialUrlHash, supabase } from "../../lib/supabase";
import { authApi } from "../../api/auth";
import { validateNewPassword } from "../../lib/passwordStrength";
import { AuthShell } from "./AuthShell";
import { useAuthStatus } from "./useAuthStatus";
import styles from "./auth.module.css";

/* Reset-completion page — replaces reset-password.html + reset-password.js.
 *
 * The standalone page had to build its own Supabase client from a CDN import
 * and re-implement the theme sync, the popup, the password toggle and the
 * strength meter, because it was outside the app. All four are the app's own
 * infrastructure here (`lib/supabase`, `AppearanceProvider`, the status banner,
 * `PasswordField`), so this is only the flow.
 *
 * Note this route is deliberately *not* wrapped in `RedirectIfSignedIn`: a
 * recovery link produces a real (if limited) session, so the guard that keeps
 * signed-in users off /login would bounce the user off the very screen the link
 * was for.
 *
 * Supabase fires PASSWORD_RECOVERY when it successfully exchanges the token in
 * the URL. When the link is invalid or expired it fires nothing — except it
 * does append `#error=access_denied&error_code=otp_expired&...` to the
 * redirect, which is read from `initialUrlHash` below for a deterministic
 * answer. The three-second timeout is the vanilla's fallback heuristic for
 * the remaining case: no event and no error param either (e.g. a link with
 * no token at all). */

const RECOVERY_TIMEOUT_MS = 3000;

type Phase = "checking" | "ready" | "expired" | "done";

export function ResetPasswordView() {
  const passwordId = useId();
  const confirmId = useId();

  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const { setStatus, node: statusNode } = useAuthStatus();

  useEffect(() => {
    const params = new URLSearchParams(initialUrlHash.replace(/^#/, ""));
    if (params.get("error")) {
      setPhase("expired");
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPhase((p) => (p === "checking" ? "ready" : p));
      }
    });

    const timer = setTimeout(() => {
      setPhase((p) => (p === "checking" ? "expired" : p));
    }, RECOVERY_TIMEOUT_MS);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;

    const invalid = validateNewPassword(password, confirmPassword);
    if (invalid) {
      setStatus({ kind: "error", message: invalid.message });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      /* `changePassword` rather than `updatePassword`: it carries the
         "must differ from the current one" message the vanilla special-cased,
         and it signs other sessions out afterwards — which matters more here
         than in settings, since a password reset is what you do when you think
         someone else has your account. */
      await authApi.changePassword(password);
      /* Then drop the recovery session too, so the user proves the new password
         works by signing in with it (reset-password.js:169-173). */
      await supabase.auth.signOut();
      setPhase("done");
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (phase === "checking") {
    return (
      <AuthShell
        title="Checking your link"
        subtitle="One moment…"
        showLegal={false}
      >
        <div className={styles.centered}>
          <div className={styles.spinner} aria-hidden="true" />
        </div>
      </AuthShell>
    );
  }

  if (phase === "expired") {
    return (
      <AuthShell
        title="Link expired"
        subtitle="This reset link is no longer valid."
        showLegal={false}
      >
        <div className={styles.centered}>
          <p className={styles.intro}>
            Reset links can only be used once, and they expire after a while.
            Request a new one and it'll be in your inbox shortly.
          </p>
          <Link className={styles.link} to="/forgot-password">
            Send a new reset link
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (phase === "done") {
    return (
      <AuthShell
        title="All done!"
        subtitle="You can now sign in with your new password."
        showLegal={false}
      >
        <div className={styles.centered}>
          <p className={styles.intro} role="status">
            Your password has been updated, and every other session has been
            signed out.
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
      title="Reset Password"
      subtitle="Choose a strong, new password for your account."
      status={statusNode}
      showLegal={false}
    >
      <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
        <div>
          <PasswordField
            id={passwordId}
            label="New Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <PasswordField
          id={confirmId}
          label="Confirm Password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          placeholder="Re-enter new password"
          required
        />

        <Button
          type="submit"
          variant="primary"
          className={styles.submit}
          disabled={saving}
        >
          {saving ? "Updating..." : "Update Password →"}
        </Button>
      </form>
    </AuthShell>
  );
}
