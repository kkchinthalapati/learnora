import { Link } from "react-router";
import logoUrl from "../../assets/learnora.jpg";
import styles from "./privacy.module.css";

/* Privacy Policy — ports privacy.html, expanded to actually cover what the
 * product does with a user's data rather than the two-paragraph placeholder
 * it started as.
 *
 * Same shell as TermsView for the same reason: it sits outside ProtectedRoute
 * so it can be linked from the sign-up screen (and from the consent checkbox
 * on it) before an account exists to protect, and reads no context so it has
 * nothing to fail loading. */

const SECTIONS = [
  { id: "section-1", title: "1. Information We Collect" },
  { id: "section-2", title: "2. AI Providers We Use" },
  { id: "section-3", title: "3. How We Use Your Information" },
  { id: "section-4", title: "4. Data Retention" },
  { id: "section-5", title: "5. Account Deletion" },
  { id: "section-6", title: "6. Cookies & Local Storage" },
  { id: "section-7", title: "7. Data Security" },
  { id: "section-8", title: "8. Your Rights (GDPR — EU/UK Users)" },
  { id: "section-9", title: "9. Your Rights (CCPA — California Users)" },
  { id: "section-10", title: "10. Children's Privacy" },
  { id: "section-11", title: "11. Changes to This Policy" },
  { id: "section-12", title: "12. Contact Us" },
];

export function PrivacyView() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.nav}>
            <Link to="/" className={styles.backBtn}>
              &larr; Back to Learnora
            </Link>
            <div className={styles.brand}>
              <img src={logoUrl} alt="" />
              <span>Learnora</span>
            </div>
          </div>
          <div>
            <h1 className={styles.title}>Privacy Policy</h1>
            <p className={styles.meta}>
              Effective Date: September 4, 2026 &bull; Last Updated: September
              2026
            </p>
          </div>
        </header>

        <main className={styles.card}>
          <nav className={styles.tocBox} aria-labelledby="toc-title">
            <div className={styles.tocTitle} id="toc-title">
              Table of Contents
            </div>
            <ul className={styles.tocList}>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ul>
          </nav>

          <p className={styles.section}>
            This policy explains, in plain English, what information Learnora
            collects, why, who it is shared with, and the choices and rights
            you have over it. If a term here isn't clear, email{" "}
            <a href="mailto:support@learnora.app">support@learnora.app</a> and
            we'll clarify it — and fix the policy if it wasn't clear enough.
          </p>

          <section id="section-1" className={styles.section}>
            <h2>1. Information We Collect</h2>
            <p>
              <strong>Account information:</strong> your name, email address,
              date of birth (used only for the age check), and password
              (stored hashed — we never see or store it in plain text).
            </p>
            <p>
              <strong>Study content:</strong> the tasks, exams, notes,
              uploaded materials, flashcards, quizzes, and quiz answers you
              create or upload while using Learnora.
            </p>
            <p>
              <strong>Usage and service data:</strong> things like study
              session logs, timer presets, sign-in timestamps, and the
              technical data (IP address, browser type, device) needed to keep
              the service secure and working.
            </p>
          </section>

          <section id="section-2" className={styles.section}>
            <h2>2. AI Providers We Use</h2>
            <p>
              Learnora's AI features — the study assistant, flashcard and quiz
              generation, and forecasting — are powered by third-party AI
              models. We currently use{" "}
              <strong>Claude, made by Anthropic</strong>, and{" "}
              <strong>Gemini, made by Google</strong>. Which provider handles
              a given request depends on the feature; either way, the same
              rule applies:
            </p>
            <p>
              <strong>
                When you use an AI feature, the relevant content (your prompt,
                and any study material or quiz history needed to answer it) is
                sent to Anthropic and/or Google to generate a response.
              </strong>{" "}
              Nothing is sent to an AI provider unless you actively use an AI
              feature — browsing your tasks, notes, or exams does not.
            </p>
            <p>
              <strong>
                We do not allow Anthropic or Google to train their models on
                your data,
              </strong>{" "}
              and neither provider retains your data beyond what is needed to
              process the request, per their respective API terms. We don't
              sell access to your data to these providers or anyone else —
              this is a service we pay for, not a data-sharing arrangement.
            </p>
            <p>
              We encourage you to avoid pasting sensitive personal
              information (e.g. medical or financial details unrelated to
              your studies) into AI prompts or uploads, since it will be
              transmitted the same as any other prompt content.
            </p>
          </section>

          <section id="section-3" className={styles.section}>
            <h2>3. How We Use Your Information</h2>
            <p>We use the information above to:</p>
            <ul>
              <li>Create and authenticate your account, and keep it secure.</li>
              <li>
                Provide the features you ask for — saving your tasks and
                exams, generating study aids, and showing your progress.
              </li>
              <li>Respond to support requests you send us.</li>
              <li>
                Detect and prevent abuse, fraud, and security incidents (for
                example, rate-limiting AI requests).
              </li>
              <li>
                Maintain and improve the reliability of the service, including
                through error monitoring (see Section 4).
              </li>
            </ul>
            <p>
              We do not sell your study content, notes, or personal
              information to advertisers or data brokers.
            </p>
          </section>

          <section id="section-4" className={styles.section}>
            <h2>4. Data Retention</h2>
            <p>
              We keep your account and study data for as long as your account
              is active, so it's there the next time you sign in. We also use
              Sentry, an error-monitoring service, to catch bugs and crashes;
              error reports may include the page you were on and a portion of
              your session state, but we scrub tokens and other credentials
              from them before they're sent, and error data is retained
              separately from your study content under Sentry's own retention
              limits.
            </p>
            <p>
              If you stop using Learnora without deleting your account, your
              data simply remains as-is — we don't delete it for inactivity
              alone. To have it removed, delete your account (Section 5).
            </p>
          </section>

          <section id="section-5" className={styles.section}>
            <h2>5. Account Deletion</h2>
            <p>
              You can permanently delete your account and all associated data
              at any time from Settings &rarr; Danger Zone. Deleting your
              account removes your profile, tasks, exams, study logs, weekly
              plans, notes, materials, flashcards, and quizzes — everything
              tied to your account.
            </p>
            <p>
              Your live data is deleted immediately when the request
              completes. Copies that exist in routine database backups or
              server logs are purged automatically within{" "}
              <strong>30 days</strong>. This is the right to erasure under
              GDPR Article 17 (see Section 8), and it applies to every
              Learnora account, not only EU or UK residents.
            </p>
            <p>
              Deletion is permanent and cannot be undone — there is no
              recovery window after you confirm it.
            </p>
          </section>

          <section id="section-6" className={styles.section}>
            <h2>6. Cookies &amp; Local Storage</h2>
            <p>
              Learnora uses your browser's local storage to keep you signed in
              and to remember preferences like your theme. We don't use
              third-party advertising cookies or cross-site tracking.
            </p>
          </section>

          <section id="section-7" className={styles.section}>
            <h2>7. Data Security</h2>
            <p>
              Your data is stored with Supabase, using row-level security so
              that only you (and, for narrow features like the AI tools and
              friends, code acting on your explicit request) can read your
              own data. Passwords are hashed, not stored in plain text, and
              all traffic between your browser and our servers is encrypted
              in transit.
            </p>
          </section>

          <section id="section-8" className={styles.section}>
            <h2>8. Your Rights (GDPR — EU/UK Users)</h2>
            <p>
              If you're located in the European Economic Area or the United
              Kingdom, the GDPR (and UK GDPR) gives you these rights over your
              personal data:
            </p>
            <ul>
              <li>
                <strong>Access</strong> — request a copy of the personal data
                we hold about you.
              </li>
              <li>
                <strong>Rectification</strong> — correct inaccurate data
                (most of this you can already edit yourself in Settings).
              </li>
              <li>
                <strong>Erasure</strong> — request deletion of your data (see
                Section 5 for the fastest way: the in-app deletion flow).
              </li>
              <li>
                <strong>Portability</strong> — receive your data in a
                structured, machine-readable format.
              </li>
              <li>
                <strong>Restriction &amp; objection</strong> — ask us to limit
                or stop certain processing of your data.
              </li>
              <li>
                <strong>Withdraw consent</strong> — where we rely on your
                consent (for example, the AI-provider consent given at
                sign-up), you can withdraw it at any time by contacting us,
                though this may limit your access to AI features.
              </li>
            </ul>
            <p>
              To exercise any of these rights, email{" "}
              <a href="mailto:support@learnora.app">support@learnora.app</a>.
              We'll respond within one month, as GDPR requires.
            </p>
          </section>

          <section id="section-9" className={styles.section}>
            <h2>9. Your Rights (CCPA — California Users)</h2>
            <p>
              If you're a California resident, the CCPA (as amended by the
              CPRA) gives you the right to:
            </p>
            <ul>
              <li>
                Know what personal information we collect, use, and disclose.
              </li>
              <li>Request deletion of your personal information.</li>
              <li>Correct inaccurate personal information.</li>
              <li>
                Opt out of the sale or sharing of personal information — we
                don't sell or share your personal information, so there is
                nothing to opt out of.
              </li>
              <li>
                Not be discriminated against for exercising any of these
                rights.
              </li>
            </ul>
            <p>
              To exercise any of these rights, email{" "}
              <a href="mailto:support@learnora.app">support@learnora.app</a>.
            </p>
          </section>

          <section id="section-10" className={styles.section}>
            <h2>10. Children's Privacy</h2>
            <p>
              Learnora requires users to be at least 13 years old (see our{" "}
              <Link to="/terms">Terms of Service</Link>). We do not knowingly
              collect personal information from children under 13. If you
              believe a child under 13 has created an account, contact us and
              we will delete it.
            </p>
          </section>

          <section id="section-11" className={styles.section}>
            <h2>11. Changes to This Policy</h2>
            <p>
              We may update this policy as the product changes. The current
              version is always published at this address, with its effective
              date at the top of the page. Material changes will be
              communicated to users where practical.
            </p>
          </section>

          <section id="section-12" className={styles.section}>
            <h2>12. Contact Us</h2>
            <p>
              Questions about this policy, or about your data, go to:
            </p>
            <p>
              <strong>Email:</strong>{" "}
              <a href="mailto:support@learnora.app">support@learnora.app</a>
              <br />
              <strong>Learnora AI Study Planner Team</strong>
            </p>
          </section>

          <footer className={styles.footer}>
            &copy; 2026 Learnora AI Study Planner. All rights reserved.
          </footer>
        </main>
      </div>
    </div>
  );
}
