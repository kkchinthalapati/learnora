import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import {
  PasswordField,
  PasswordStrengthMeter,
} from "../../components/PasswordField";
import { useSignup } from "../../hooks/useAuthActions";
import { AuthShell } from "./AuthShell";
import { useAuthStatus } from "./useAuthStatus";
import { RedirectIfSignedIn } from "./RedirectIfSignedIn";
import styles from "./auth.module.css";

/* Sign-up — ports index.html:205-292 + js/main.js:567-645.
 *
 * One deliberate omission: the vanilla's background poll. After a
 * "verification-sent" signup it re-attempted a silent login every 20 seconds,
 * fifteen times, so the tab would let itself in the moment the user confirmed
 * their email elsewhere. That is fifteen real auth requests against Supabase's
 * rate limit per signup, and it exists only because the vanilla had no way to
 * hear about a session it did not create. This app does: the confirmation link
 * lands on /verify, which signs the user in and drops them on the dashboard.
 * So the "check your inbox" state is terminal here, with a way back to sign-in
 * for anyone who confirms in a different browser.
 *
 * The age gate, the duplicate-account check and the password rules all live in
 * `api/auth.ts` (ported in Step 5) — this view only adds the two checks the
 * vanilla also did in the submit handler, before calling the API at all. */

export function SignupView() {
  const nameId = useId();
  const emailId = useId();
  const dobId = useId();
  const passwordId = useId();
  const confirmId = useId();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sent, setSent] = useState(false);

  const { setStatus, node: statusNode } = useAuthStatus();
  const signup = useSignup();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (signup.isPending) return;

    if (password.length < 8) {
      setStatus({
        kind: "error",
        message: "Password must be at least 8 characters long.",
      });
      return;
    }
    if (password !== confirmPassword) {
      setStatus({
        kind: "error",
        message: "Passwords do not match. Please re-enter them.",
      });
      return;
    }

    setStatus(null);
    try {
      const outcome = await signup.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        password,
        dob,
      });
      if (outcome === "verification-sent") {
        setSent(true);
        return;
      }
      /* outcome === "ok" means Supabase returned a live session, so
         RedirectIfSignedIn takes it from here. */
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="One more step to finish setting up your account."
      >
        <div className={styles.centered}>
          <p className={styles.intro}>
            We sent a confirmation link to <strong>{email.trim()}</strong>.
            Open it and you'll be signed in automatically.
          </p>
          <p className={styles.toggleText}>
            Confirmed somewhere else?{" "}
            <Link className={styles.link} to="/login">
              Log in
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <RedirectIfSignedIn>
      <AuthShell
        title="Create your account"
        subtitle="Start studying smarter in minutes."
        status={statusNode}
      >
        <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
          <div className={styles.inputGroup}>
            <label htmlFor={nameId}>Full name</label>
            <input
              id={nameId}
              type="text"
              placeholder="Your full name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

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

          <div className={styles.inputGroup}>
            <label htmlFor={dobId}>Date of birth</label>
            <input
              id={dobId}
              type="date"
              required
              aria-describedby={`${dobId}-desc`}
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
            {/* The vanilla put this in a `title` attribute *and* a sibling
                paragraph; aria-describedby ties the paragraph to the field so
                it is actually announced. */}
            <p className={styles.fieldDesc} id={`${dobId}-desc`}>
              You must be 13 or older to use Learnora
            </p>
          </div>

          <div>
            <PasswordField
              id={passwordId}
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              required
            />
            <PasswordStrengthMeter password={password} />
          </div>

          <PasswordField
            id={confirmId}
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            required
          />

          <Button
            type="submit"
            variant="primary"
            className={styles.submit}
            disabled={signup.isPending}
          >
            {signup.isPending ? "Creating account..." : "Create Account →"}
          </Button>

          <p className={styles.toggleText}>
            Already have an account?{" "}
            <Link className={styles.link} to="/login">
              Log In
            </Link>
          </p>
        </form>
      </AuthShell>
    </RedirectIfSignedIn>
  );
}
