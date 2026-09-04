import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import type {
  FeedbackKind,
  FeedbackState,
} from "../../components/InlineFeedback";
/* Imported rather than referenced as `/learnora.jpg`: Vite rewrites the URL to
 * include whatever `base` the build uses, so the logo survives being served
 * from the `/app/` path prefix. A root-absolute path would not. */
import logoUrl from "../../assets/learnora.jpg";
import styles from "./auth.module.css";

/* The auth wall's chrome — ports index.html:59-326.
 *
 * The vanilla kept one card in the DOM and swapped which of its four forms was
 * visible, rewriting the shared `.brand-header` text on every switch
 * (`setAuthHeader`, js/main.js:455-460). Each screen is its own route here, so
 * the heading is simply a prop and there is nothing to keep in sync. */

const FEATURES: { icon: IconName; label: string }[] = [
  { icon: "clock", label: "Focus timer" },
  { icon: "list-checks", label: "Task manager" },
  { icon: "calendar", label: "Exams" },
  { icon: "bot", label: "AI study assistant" },
];

export function AuthShell({
  title,
  subtitle,
  status,
  children,
  showLegal = true,
}: {
  title: string;
  subtitle: string;
  status?: ReactNode;
  children: ReactNode;
  showLegal?: boolean;
}) {
  return (
    <main className={styles.wrapper}>
      <div className={styles.layout}>
        <div className={styles.card}>
          <div className={styles.brandHeader}>
            {/* alt="" — the <h1> right below carries the name, so announcing
                the logo too would just repeat it. */}
            <img src={logoUrl} className={styles.logo} alt="" />
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          {status}
          {children}

          {showLegal && (
            <div className={styles.legal}>
              <p>
                By using Learnora, you agree to our{" "}
                {/* <Link>, not <a href="/terms">: the route table is mounted
                    under a basename in production, and only Link accounts for
                    it. */}
                <Link to="/terms" target="_blank" rel="noopener noreferrer">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          )}
        </div>

        {/* aria-hidden: pure decoration, and every claim it makes is repeated
            by the app itself once you are inside. */}
        <div className={styles.visual} aria-hidden="true">
          <div className={styles.visualContent}>
            <h2>
              Everything you need to study,
              <br />
              in one calm place.
            </h2>
            <p className={styles.visualSubtitle}>
              Focus sessions, tasks, exams, and an AI tutor — working together.
            </p>
            <div className={styles.visualFeatures}>
              {FEATURES.map((f) => (
                <div className={styles.visualFeature} key={f.label}>
                  <span className={styles.featureIcon}>
                    <Icon name={f.icon} size={20} />
                  </span>
                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/* Reuses `InlineFeedback`'s kind rather than declaring a parallel
 * "error" | "success" | "info" type: no auth screen ever constructs an
 * "info" status (grep confirms every `setStatus` call is "error" or
 * "success"), so the third kind was dead code duplicating a type the
 * codebase already has, not a real third state. */
export type AuthStatusState = FeedbackState;

const STATUS_CLASS: Record<FeedbackKind, string> = {
  error: styles.statusError,
  success: styles.statusSuccess,
};

/* Ports the `#auth-status` banner and `showAuthStatus` (js/main.js:464-478).
 *
 * Its own component rather than `InlineFeedback` reused directly: this is a
 * centered banner sitting above the form (`style.css:2464-2487`), while
 * `InlineFeedback` is a lighter note appended after a field/section — same
 * colour semantics, different layout role. `role` follows the same
 * convention `InlineFeedback` set: an error is assertive because it blocks
 * what the user just tried to do, anything else is polite. The vanilla div
 * had no role, so none of it was announced. */
export function AuthStatus({ kind, message }: AuthStatusState) {
  return (
    <div
      className={`${styles.status} ${STATUS_CLASS[kind]}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {message}
    </div>
  );
}
