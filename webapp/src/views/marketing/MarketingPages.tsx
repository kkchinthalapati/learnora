import type { ReactNode } from "react";
import { Link } from "react-router";
import { BrandLogo } from "../../components/BrandLogo";
import { Icon } from "../../components/Icon";
import styles from "./marketing.module.css";

function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.pageWrapper}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <BrandLogo size="small" showText />
          </Link>
          <div className={styles.headerActions}>
            <Link to="/timer" className={`${styles.actionBtn} ${styles.secondaryAction}`}>
              <Icon name="clock" size={14} />
              <span>Try Timer</span>
            </Link>
            <Link to="/login" className={`${styles.actionBtn} ${styles.primaryAction}`}>
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <main className={styles.mainContent}>
        <article className={styles.articleCard}>
          {children}
        </article>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerWrap}>
          <span>© 2026 Learnora. All rights reserved.</span>
          <nav className={styles.footerNav} aria-label="Footer navigation">
            <Link to="/about" className={styles.footerNavLink}>About</Link>
            <Link to="/contact" className={styles.footerNavLink}>Contact</Link>
            <Link to="/privacy" className={styles.footerNavLink}>Privacy</Link>
            <Link to="/developers" className={styles.footerNavLink}>Developers</Link>
            <Link to="/terms" className={styles.footerNavLink}>Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function AboutView() {
  return (
    <MarketingLayout>
      <h1 className={styles.pageTitle}>About Learnora</h1>
      <p className={styles.paragraph}>
        Learnora is an AI-assisted study workspace for students who want a calmer, more
        connected way to plan and complete their academic work. Instead of separating
        schedules, deadlines, notes, flashcards, timers, and revision materials into
        several fragmented tools, Learnora brings the essential parts of a study routine
        together in one cohesive web application.
      </p>

      <h2 className={styles.sectionHeading}>What the product is for</h2>
      <p className={styles.paragraph}>
        Students can organize subjects and tasks, keep learning materials and notes, run
        focused Pomodoro study sessions, build weekly plans, practise with quizzes and
        active recall flashcards, and prepare with mock exams.
      </p>
      <p className={styles.paragraph}>
        The built-in study assistant is there to support active learning: it can help turn
        a topic into revision material, explain concepts simply, spot distractor traps, and
        suggest practical next steps. Learnora is an educational aid, so students should
        always check important answers against their course materials and instructor guidance.
      </p>

      <h2 className={styles.sectionHeading}>How Learnora is built</h2>
      <p className={styles.paragraph}>
        Learnora runs as a fast, accessible web application with authenticated accounts to
        keep each student’s workspace private. Public pages explain the product and its
        policies, while private study data stays inside the signed-in experience.
      </p>
      <p className={styles.paragraph}>
        For technical integration details, explore the{" "}
        <Link to="/developers" className={styles.link}>Learnora developer resources</Link>{" "}
        and <a href="/llms.txt" className={styles.link}>agent guide</a>.
      </p>
    </MarketingLayout>
  );
}

export function ContactView() {
  return (
    <MarketingLayout>
      <h1 className={styles.pageTitle}>Contact Learnora</h1>
      <p className={styles.paragraph}>
        For product questions, account access issues, feedback, or concerns about Learnora,
        email{" "}
        <a href="mailto:support@learnora.app" className={styles.link}>
          support@learnora.app
        </a>
        . Please do not send passwords, one-time codes, full payment details, or sensitive
        study records by email. Include the email address associated with your account only
        when necessary for the support team to locate the issue.
      </p>

      <h2 className={styles.sectionHeading}>What to include in support tickets</h2>
      <p className={styles.paragraph}>
        A clear description of what happened, the page or feature you were using, the device
        and browser involved, and any error message will help us investigate quickly.
        Screenshots can be useful when they do not reveal private personal content.
      </p>
      <p className={styles.paragraph}>
        If you are reporting an issue with AI-generated study content, share the topic and
        the result you expected rather than personal information that is not needed to
        investigate.
      </p>

      <h2 className={styles.sectionHeading}>Privacy and safety requests</h2>
      <p className={styles.paragraph}>
        Questions about personal data, account deletion, or suspected security issues
        should be sent to the same support address with a concise subject line. Learnora
        uses authenticated accounts for private study work, and support may need to verify
        ownership before discussing account-specific information. Read our{" "}
        <Link to="/privacy" className={styles.link}>privacy notice</Link> and{" "}
        <Link to="/terms" className={styles.link}>terms</Link> before contacting us for
        policy questions.
      </p>
    </MarketingLayout>
  );
}

export function DevelopersView() {
  return (
    <MarketingLayout>
      <h1 className={styles.pageTitle}>Learnora Developer Resources</h1>
      <p className={styles.paragraph}>
        Learnora publishes a small, safe public interface for product discovery. It is
        intentionally separate from the authenticated study workspace: student accounts,
        tasks, notes, files, and other private data are not exposed by this public API.
      </p>

      <h2 className={styles.sectionHeading}>Public API</h2>
      <p className={styles.paragraph}>
        <code className={styles.codeBlock}>GET /api/product-info</code> returns current,
        machine-readable public product information. Its contract is published as OpenAPI 3.1
        JSON. No authentication is required because the endpoint contains no account or study
        data.
      </p>

      <h2 className={styles.sectionHeading}>Model Context Protocol (MCP)</h2>
      <p className={styles.paragraph}>
        The Streamable HTTP MCP endpoint is{" "}
        <code className={styles.codeBlock}>POST /api/mcp</code>. It supports MCP
        initialization, tool discovery, and the read-only{" "}
        <code>get_learnora_product_information</code> tool. Agents should use it when they
        need a canonical product description or links to Learnora’s public resources.
      </p>

      <h2 className={styles.sectionHeading}>Agent Guidance</h2>
      <p className={styles.paragraph}>
        Start with <a href="/llms.txt" className={styles.link}>llms.txt</a> for when-to-use
        guidance and a concise resource index. Questions about developer integrations can be
        sent to{" "}
        <a href="mailto:support@learnora.app" className={styles.link}>
          support@learnora.app
        </a>
        .
      </p>
    </MarketingLayout>
  );
}


