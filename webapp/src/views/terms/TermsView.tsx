import { Link } from "react-router";
import logoUrl from "../../assets/learnora.jpg";
import styles from "./terms.module.css";

/* Terms of Service — ports terms.html.
 *
 * The copy is reproduced verbatim; only the shell changes. The vanilla page
 * was standalone (its own CSP meta tag, its own font links, its own copy of
 * style.css) because it lived outside the app. As a route it inherits all of
 * that, and the "Back to Learnora" link becomes a router navigation instead of
 * a full page load back to index.html.
 *
 * Public on purpose: it sits outside ProtectedRoute so the sign-in and sign-up
 * screens can link to it, which is where most people will actually read it. */

const SECTIONS = [
  { id: "section-1", title: "1. Acceptance of Terms" },
  { id: "section-2", title: "2. Description of Service" },
  { id: "section-3", title: "3. Eligibility & User Accounts" },
  { id: "section-4", title: "4. Acceptable Use & Conduct" },
  { id: "section-5", title: "5. AI Services & Content Disclaimer" },
  { id: "section-6", title: "6. Intellectual Property Rights" },
  { id: "section-7", title: "7. User Content & Privacy" },
  { id: "section-8", title: "8. Subscriptions & Payments" },
  { id: "section-9", title: "9. Limitation of Liability" },
  { id: "section-10", title: "10. Termination & Modifications" },
  { id: "section-11", title: "11. Governing Law & Dispute Resolution" },
  { id: "section-12", title: "12. Contact Information" },
];

export function TermsView() {
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
            <h1 className={styles.title}>Terms of Service</h1>
            <p className={styles.meta}>
              Effective Date: July 25, 2026 &bull; Last Updated: July 2026
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

          <section id="section-1" className={styles.section}>
            <h2>1. Acceptance of Terms</h2>
            <p>
              Welcome to <strong>Learnora</strong> ("Company," "we," "us," or
              "our"). These Terms of Service ("Terms") govern your access to and
              use of the Learnora website, application, AI study workspace,
              mobile applications, services, and related tools (collectively,
              the "Service").
            </p>
            <p>
              By accessing, registering for, or using Learnora, you explicitly
              agree to be bound by these Terms and our Privacy Policy. If you do
              not agree to these Terms, you must not access or use the Service.
            </p>
          </section>

          <section id="section-2" className={styles.section}>
            <h2>2. Description of Service</h2>
            <p>
              Learnora provides an intelligent study workspace and planning
              platform designed to assist students and learners with:
            </p>
            <ul>
              <li>
                AI-powered study scheduling, task management, and exam
                countdowns.
              </li>
              <li>
                Automated study plan generation, flashcard creation, and quiz
                generation from uploaded study notes or files.
              </li>
              <li>
                Interactive focus session timers (Pomodoro) and learning
                analytics.
              </li>
              <li>
                AI study assistant tutoring and educational query resolution.
              </li>
            </ul>
            <p>
              We continuously improve and evolve the Service. Features may be
              updated, modified, or temporarily suspended for maintenance
              without prior notice.
            </p>
          </section>

          <section id="section-3" className={styles.section}>
            <h2>3. Eligibility &amp; User Accounts</h2>
            <p>
              <strong>Age Requirement:</strong> You must be at least 13 years
              old (or the minimum legal age of digital consent in your
              jurisdiction) to create an account or use Learnora. Users under 18
              years of age must have the permission and supervision of a parent
              or legal guardian.
            </p>
            <p>
              <strong>Account Security:</strong> You are responsible for
              maintaining the confidentiality of your login credentials (email
              and password) and for all activities that occur under your
              account. You agree to immediately notify Learnora of any
              unauthorized access or security breach.
            </p>
          </section>

          <section id="section-4" className={styles.section}>
            <h2>4. Acceptable Use &amp; Conduct</h2>
            <p>
              You agree to use Learnora exclusively for lawful, personal,
              non-commercial educational purposes. You agree NOT to:
            </p>
            <ul>
              <li>
                Use the Service for academic dishonesty, cheating, fraud, or
                violation of institutional academic integrity codes.
              </li>
              <li>
                Upload, post, or transmit content that is unlawful, harmful,
                abusive, harassing, defamatory, or infringing on intellectual
                property.
              </li>
              <li>
                Attempt to reverse-engineer, decompile, scrape, or extract
                source code or underlying AI models of the Service.
              </li>
              <li>
                Interfere with, disrupt, or overload the servers, network
                infrastructure, or security systems of Learnora.
              </li>
              <li>
                Bypass, disable, or tamper with security filters, access codes,
                or authentication mechanisms.
              </li>
              <li>
                Use automated scripts, bots, or spiders to access or harvest
                data from the Service.
              </li>
            </ul>
          </section>

          <section id="section-5" className={styles.section}>
            <h2>5. AI Services &amp; Content Disclaimer</h2>
            <p>
              <strong>Educational Tool Only:</strong> Learnora utilizes
              artificial intelligence and machine learning models to assist in
              generating study schedules, summaries, flashcards, and answers.
              While we strive for accuracy, AI-generated outputs may
              occasionally contain errors, hallucinated facts, or inaccuracies.
            </p>
            <p>
              <strong>User Verification:</strong> AI recommendations, summaries,
              and explanations are provided strictly for educational assistance
              and supplemental learning. Learnora does not guarantee academic
              performance or exam results. You are encouraged to verify critical
              information against authoritative textbooks and course materials.
            </p>
          </section>

          <section id="section-6" className={styles.section}>
            <h2>6. Intellectual Property Rights</h2>
            <p>
              <strong>Learnora Property:</strong> The Service, including its
              software code, design system, user interfaces, branding, logos,
              graphics, and underlying architecture, is protected by copyright,
              trademark, and other intellectual property laws. You are granted a
              limited, non-exclusive, non-transferable license to use Learnora
              for personal study.
            </p>
            <p>
              <strong>User Ownership:</strong> You retain ownership of all study
              materials, notes, and documents you upload to Learnora ("User
              Content"). By uploading content, you grant Learnora a limited,
              worldwide license to process and display your content solely for
              the purpose of operating and providing the Service to you.
            </p>
          </section>

          <section id="section-7" className={styles.section}>
            <h2>7. User Content &amp; Privacy</h2>
            <p>
              Your privacy is fundamental to us. Personal data collected during
              registration and usage is processed securely in accordance with
              our system security protocols and Supabase backend architecture.
              We do not sell your personal study content or notes to third
              parties.
            </p>
          </section>

          <section id="section-8" className={styles.section}>
            <h2>8. Subscriptions &amp; Payments</h2>
            <p>
              Certain premium features or tiers of Learnora may require
              subscription payments. If applicable:
            </p>
            <ul>
              <li>
                Pricing and payment terms will be clearly specified prior to
                purchase.
              </li>
              <li>
                Subscriptions automatically renew unless cancelled prior to the
                billing date.
              </li>
              <li>
                Learnora reserves the right to modify pricing with reasonable
                advance notice.
              </li>
            </ul>
          </section>

          <section id="section-9" className={styles.section}>
            <h2>9. Disclaimers &amp; Limitation of Liability</h2>
            <p>
              THE SERVICE IS PROVIDED ON AN <strong>"AS IS"</strong> AND{" "}
              <strong>"AS AVAILABLE"</strong> BASIS WITHOUT WARRANTIES OF ANY
              KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
              IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE, OR NON-INFRINGEMENT.
            </p>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, LEARNORA AND
              ITS OPERATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOSS OF DATA,
              STUDY NOTES, OR REVENUE ARISING OUT OF OR IN CONNECTION WITH YOUR
              USE OF THE SERVICE.
            </p>
          </section>

          <section id="section-10" className={styles.section}>
            <h2>10. Termination &amp; Service Modifications</h2>
            <p>
              We reserve the right to suspend or terminate your account or
              access to the Service at our sole discretion, without notice, for
              conduct that violates these Terms or is harmful to other users or
              our infrastructure. You may discontinue your use of Learnora at
              any time.
            </p>
          </section>

          <section id="section-11" className={styles.section}>
            <h2>11. Governing Law &amp; Dispute Resolution</h2>
            <p>
              These Terms shall be governed by and construed in accordance with
              applicable laws, without regard to its conflict of law principles.
              Any legal action or dispute arising out of these Terms shall be
              resolved through good-faith informal negotiation or binding
              arbitration.
            </p>
          </section>

          <section id="section-12" className={styles.section}>
            <h2>12. Contact Information &amp; Updates</h2>
            <p>
              We may revise these Terms from time to time. The most current
              version will always be posted on this page. Continued use of the
              Service after updates constitutes acceptance of the modified
              Terms.
            </p>
            <p>
              If you have any questions or concerns regarding these Terms,
              please contact us at:
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
