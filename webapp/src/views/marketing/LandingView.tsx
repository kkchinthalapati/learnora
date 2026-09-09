import { Link } from "react-router";
import { BrandLogo } from "../../components/BrandLogo";
import { Icon } from "../../components/Icon";
import { PLAN_PRICING_INR, formatPrice } from "../../lib/entitlements";
import styles from "./landing.module.css";

export function LandingView() {
  const plusPlan = PLAN_PRICING_INR.plus;
  const proPlan = PLAN_PRICING_INR.pro;
  const plusMonthly = formatPrice(plusPlan.prices.find((p) => p.id === "monthly")?.amountPence ?? 19900, "INR");
  const plusAnnual = formatPrice(plusPlan.prices.find((p) => p.id === "annual")?.amountPence ?? 199900, "INR");
  const proMonthly = formatPrice(proPlan.prices.find((p) => p.id === "monthly")?.amountPence ?? 39900, "INR");
  const proAnnual = formatPrice(proPlan.prices.find((p) => p.id === "annual")?.amountPence ?? 399900, "INR");

  return (
    <div className={styles.container}>
      <div className={styles.bgGlow} aria-hidden="true" />

      {/* Navigation */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <BrandLogo size="medium" showText />
          </Link>

          <nav className={styles.navLinks} aria-label="Main navigation">
            <a href="#vision" className={styles.navLink}>Why Learnora</a>
            <a href="#features" className={styles.navLink}>Features</a>
            <a href="#pricing" className={styles.navLink}>Pricing</a>
          </nav>

          <div className={styles.navActions}>
            <Link to="/timer" className={styles.guestTimerBtn} style={{ padding: "8px 16px", fontSize: "14px" }}>
              <Icon name="clock" size={16} />
              <span>Try Timer</span>
            </Link>
            <Link to="/login" className={styles.signUpBtn} style={{ padding: "8px 16px", fontSize: "14px" }}>
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.badge}>
          <Icon name="sparkles" size={13} />
          <span>Built for High School &amp; Board Exam Students</span>
        </div>

        <h1 className={styles.heroTitle}>
          Know Your Grade.<br />Own Your Study.
        </h1>

        <p className={styles.heroSubtitle}>
          The only study platform that forecasts your exam score and shows what every
          study block is worth. Zero academic jargon, 25m focus timer, and active recall
          that sticks under pressure.
        </p>

        <div className={styles.heroCtas}>
          <Link to="/timer" className={styles.guestTimerBtn}>
            <Icon name="clock" size={20} />
            <span>Try 25m Focus Timer (No Sign-Up)</span>
          </Link>
          <Link to="/signup" className={styles.signUpBtn}>
            <span>Create Free Account &rarr;</span>
          </Link>
        </div>

        <p className={styles.heroNote}>
          Free forever for essential study tools • No credit card required to start
        </p>
      </section>

      {/* Why Learnora is Different */}
      <section className={styles.section} id="vision">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionEyebrow}>Memory Science &amp; Action</div>
          <h2 className={styles.sectionTitle}>Why Learnora is Different</h2>
          <p className={styles.sectionSubtitle}>
            Every app generates flashcards. Only Learnora connects memory science to actual exam performance.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Icon name="clock" size={24} />
            </div>
            <h3 className={styles.featureTitle}>Instant 1-Click Focus</h3>
            <p className={styles.featureDesc}>
              No sign-up wall when you just need to work. Launch a 25-minute Pomodoro timer immediately with zero friction.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Icon name="layers" size={24} />
            </div>
            <h3 className={styles.featureTitle}>Step-by-Step Solver</h3>
            <p className={styles.featureDesc}>
              Identify exactly where reasoning broke down and test your repair before moving forward.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Icon name="book-open" size={24} />
            </div>
            <h3 className={styles.featureTitle}>Explain &amp; Teach</h3>
            <p className={styles.featureDesc}>
              Teach concepts in plain words to an AI apprentice that asks clarifying questions to reveal knowledge gaps.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Icon name="mic" size={24} />
            </div>
            <h3 className={styles.featureTitle}>Viva / Oral Practice</h3>
            <p className={styles.featureDesc}>
              Practice oral exam questions, defend your logic out loud, and build unshakeable test-day confidence.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Icon name="activity" size={24} />
            </div>
            <h3 className={styles.featureTitle}>Exam Trajectory Forecast</h3>
            <p className={styles.featureDesc}>
              Predict your exam day score with confidence intervals, calculated directly from your spaced repetition retention data.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Icon name="sparkles" size={24} />
            </div>
            <h3 className={styles.featureTitle}>Active Spaced Repetition</h3>
            <p className={styles.featureDesc}>
              Flashcards that adjust intervals dynamically based on how quickly you recall answers under real test conditions.
            </p>
          </div>
        </div>
      </section>

      {/* Features Overview */}
      <section className={styles.section} id="features">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionEyebrow}>Complete Workspace</div>
          <h2 className={styles.sectionTitle}>Everything You Need in One Place</h2>
          <p className={styles.sectionSubtitle}>
            Consolidate timers, notes, flashcards, mock quizzes, and study planning into a single calm interface.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📚</div>
            <h3 className={styles.featureTitle}>Notes &amp; Notebooks</h3>
            <p className={styles.featureDesc}>
              Rich markdown editor with LaTeX equation support and instant AI assistant docked alongside your notes.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🎯</div>
            <h3 className={styles.featureTitle}>Daily Recall Drills</h3>
            <p className={styles.featureDesc}>
              Quick 5-minute morning sessions targeting your highest-lapse cards before they slip from memory.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📝</div>
            <h3 className={styles.featureTitle}>Mock Exam Simulator</h3>
            <p className={styles.featureDesc}>
              Timed test runs with rubric grading and immediate step-by-step mistake repair.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className={styles.section} id="pricing">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionEyebrow}>Fair &amp; Transparent</div>
          <h2 className={styles.sectionTitle}>Simple, Student-Friendly Pricing</h2>
          <p className={styles.sectionSubtitle}>
            Free tier covers everything essential. Upgrade only if you want deeper AI allowances and advanced forecasting.
          </p>
        </div>

        <div className={styles.pricingGrid}>
          {/* Free Tier */}
          <div className={styles.pricingCard}>
            <div className={styles.planTier}>Free</div>
            <p className={styles.planDesc}>Forever free for students</p>
            <div className={styles.planPriceRow}>
              <span className={styles.planPrice}>₹0</span>
              <span className={styles.planPeriod}>/ forever</span>
            </div>
            <ul className={styles.planFeatures}>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> Focus Timer &amp; Presets (no account needed)
              </li>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> Unlimited Tasks &amp; Exam Countdowns
              </li>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> Spaced Repetition Flashcards
              </li>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> Study Rooms with friends
              </li>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> 3 Notebooks &amp; Basic AI generation
              </li>
            </ul>
            <Link to="/timer" className={styles.signUpBtn} style={{ textAlign: "center", justifyContent: "center" }}>
              Start Studying Free
            </Link>
          </div>

          {/* Plus Tier */}
          <div className={styles.pricingCard}>
            <div className={styles.planTier}>Plus</div>
            <p className={styles.planDesc}>For dedicated everyday study</p>
            <div className={styles.planPriceRow}>
              <span className={styles.planPrice}>{plusMonthly}</span>
              <span className={styles.planPeriod}>/ month</span>
            </div>
            <ul className={styles.planFeatures}>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> Everything in Free
              </li>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> 10 Notebooks &amp; 10 AI decks/day
              </li>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> 60 AI Tutor sessions per day
              </li>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> Timetable / Calendar import (.ics)
              </li>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> Priority query processing
              </li>
            </ul>
            <Link to="/signup" className={styles.signUpBtn} style={{ textAlign: "center", justifyContent: "center" }}>
              Get Plus ({plusAnnual}/yr)
            </Link>
          </div>

          {/* Pro Tier (Featured) */}
          <div className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
            <span className={styles.pricingBadge}>Most Popular</span>
            <div className={styles.planTier}>Pro</div>
            <p className={styles.planDesc}>Full mastery &amp; grade forecasting</p>
            <div className={styles.planPriceRow}>
              <span className={styles.planPrice}>{proMonthly}</span>
              <span className={styles.planPeriod}>/ month</span>
            </div>
            <ul className={styles.planFeatures}>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> Everything in Plus
              </li>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> Exam Trajectory score prediction
              </li>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> Unlimited Notebooks
              </li>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> 200 AI Tutor turns per day
              </li>
              <li className={styles.planFeatureItem}>
                <span className={styles.checkIcon}>✓</span> Auto-scheduled study blocks
              </li>
            </ul>
            <Link to="/signup" className={styles.guestTimerBtn} style={{ textAlign: "center", justifyContent: "center" }}>
              Get Pro ({proAnnual}/yr)
            </Link>
          </div>
        </div>

        {/* UPI Payment Support Badge */}
        <div className={styles.upiNotice}>
          <Icon name="check" size={18} className={styles.checkIcon} />
          <span>
            <strong>Supports UPI</strong> (Google Pay, PhonePe, Paytm), Net Banking &amp; Cards • Cancel anytime with 1-click
          </span>
        </div>
      </section>

      {/* CTA Banner */}
      <section className={styles.ctaBanner}>
        <h2 className={styles.ctaTitle}>Ready to own your exam prep?</h2>
        <p className={styles.ctaSubtitle}>
          Start forecasting your grades and studying with focus right now.
        </p>
        <div className={styles.heroCtas}>
          <Link to="/timer" className={styles.guestTimerBtn}>
            <Icon name="clock" size={18} />
            <span>Launch Focus Timer</span>
          </Link>
          <Link to="/signup" className={styles.signUpBtn}>
            <span>Sign Up Free</span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerCol}>
            <BrandLogo size="small" showText />
            <p style={{ fontSize: "13px", color: "var(--text-muted)", maxWidth: "240px", marginTop: "8px" }}>
              Built for high school students. Exam preparation, evolved.
            </p>
          </div>

          <div className={styles.footerCol}>
            <span className={styles.footerColTitle}>Product</span>
            <Link to="/timer" className={styles.footerLink}>Focus Timer</Link>
            <Link to="/study" className={styles.footerLink}>Study Lab</Link>
            <a href="#pricing" className={styles.footerLink}>Pricing</a>
            <Link to="/login" className={styles.footerLink}>Sign In</Link>
          </div>

          <div className={styles.footerCol}>
            <span className={styles.footerColTitle}>Company &amp; Legal</span>
            <Link to="/about" className={styles.footerLink}>About</Link>
            <Link to="/contact" className={styles.footerLink}>Contact</Link>
            <Link to="/privacy" className={styles.footerLink}>Privacy Notice</Link>
            <a href="/terms.html" className={styles.footerLink}>Terms of Service</a>
          </div>

          <div className={styles.footerCol}>
            <span className={styles.footerColTitle}>Developers</span>
            <Link to="/developers" className={styles.footerLink}>API &amp; MCP Docs</Link>
            <a href="/llms.txt" className={styles.footerLink}>llms.txt Guide</a>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <span>© 2026 Learnora. All rights reserved.</span>
          <span>Designed with high contrast &amp; calm focus for students everywhere.</span>
        </div>
      </footer>
    </div>
  );
}
