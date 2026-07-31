import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { useResetPasswordRequest } from "../../hooks/useAuthActions";
import { AuthShell } from "./AuthShell";
import { useAuthStatus } from "./useAuthStatus";
import { RedirectIfSignedIn } from "./RedirectIfSignedIn";
import styles from "./auth.module.css";

/* "Forgot password" — ports index.html:123-150 + js/main.js:675-685.
 *
 * The success message stays deliberately vague ("if an account exists"): it is
 * the vanilla's wording and it is the right one, since a message that confirmed
 * the address would turn this form into an account-enumeration oracle.
 *
 * The vanilla flipped straight back to the login form on success, which threw
 * away the confirmation it had just set. This stays put and shows it. */

export function ForgotPasswordView() {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const { setStatus, node: statusNode } = useAuthStatus();
  const request = useResetPasswordRequest();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (request.isPending) return;
    setStatus(null);
    try {
      await request.mutateAsync(email.trim());
      setStatus({
        kind: "success",
        message:
          "If an account exists, a reset link has been sent to your email.",
      });
      setEmail("");
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  }

  return (
    <RedirectIfSignedIn>
      <AuthShell
        title="Reset Password"
        subtitle="We'll send you a recovery link."
        status={statusNode}
      >
        <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
          <p className={styles.intro}>
            Enter your email address and we'll send you a link to reset your
            password.
          </p>

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

          <Button
            type="submit"
            variant="primary"
            className={styles.submit}
            disabled={request.isPending}
          >
            {request.isPending ? "Sending..." : "Send Reset Link →"}
          </Button>

          <p className={styles.toggleText}>
            Remembered your password?{" "}
            <Link className={styles.link} to="/login">
              Log In
            </Link>
          </p>
        </form>
      </AuthShell>
    </RedirectIfSignedIn>
  );
}
