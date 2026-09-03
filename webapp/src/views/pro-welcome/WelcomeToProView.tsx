import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { Skeleton } from "../../components/Skeleton";
import {
  useEntitlements,
  useRefreshSubscription,
} from "../../hooks/useSubscription";
import {
  FEATURES,
  PRO_FEATURES,
  QUOTAS,
  type FeatureId,
} from "../../lib/entitlements";
import styles from "./welcomeToPro.module.css";

/* The Pro onboarding screen.
 *
 * Two entry points, one screen: Stripe sends a freshly-paying student back to
 * `/app/settings?checkout=success`, and BillingTab forwards them straight
 * here. Everyone else reaches it on purpose, from the "See what's included"
 * link BillingTab shows once they're already Pro. Either way the content is
 * identical — this is not a sales pitch (that's PaywallModal's job), it's a
 * tour of what they now have.
 *
 * The webhook that actually grants Pro can land a second or two after
 * Stripe's redirect does, so arriving here mid-checkout means briefly
 * polling rather than trusting the first read — the same race BillingTab
 * already handles, done here so the "welcome" moment doesn't flash a
 * paywall at somebody who just paid. */

const FEATURE_ICON: Record<FeatureId, IconName> = {
  trajectory: "target",
  calendarImport: "calendar",
  autoSchedule: "zap",
  scheduleExport: "calendar-week",
  unlimitedNotebooks: "layers",
  prioritySupport: "award",
  customAppearance: "palette",
};

const FEATURE_ROUTE: Partial<Record<FeatureId, { to: string; cta: string }>> =
  {
    trajectory: { to: "/trajectory", cta: "See your trajectory" },
    calendarImport: { to: "/my-week", cta: "Import your timetable" },
    autoSchedule: { to: "/my-week", cta: "Set up your week" },
    scheduleExport: { to: "/my-week", cta: "Set up your week" },
    unlimitedNotebooks: { to: "/notebooks", cta: "Open notebooks" },
    customAppearance: { to: "/settings", cta: "Pick a colour" },
  };

const RETRY_DELAYS_MS = [1500, 3000, 5000];

function FeatureCard({ id }: { id: FeatureId }) {
  const [expanded, setExpanded] = useState(false);
  const meta = FEATURES[id];
  const route = FEATURE_ROUTE[id];

  return (
    <Card
      as="section"
      variant="elevated"
      radius="lg"
      padding="lg"
      className={styles.featureCard}
    >
      <div className={styles.featureHead}>
        <span className={styles.featureIcon} aria-hidden="true">
          <Icon name={FEATURE_ICON[id]} size={20} />
        </span>
        <div>
          <h3>{meta.name}</h3>
          <p>{meta.blurb}</p>
        </div>
      </div>

      <button
        type="button"
        className={styles.expandBtn}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Show less" : "How it works"}
        <Icon
          name="chevron-down"
          size={16}
          className={expanded ? styles.expandIconOpen : undefined}
        />
      </button>

      {expanded && <p className={styles.featurePitch}>{meta.pitch}</p>}

      {route && (
        <Link to={route.to} className={styles.featureCta}>
          {route.cta}
          <Icon name="chevron-down" size={14} className={styles.ctaArrow} />
        </Link>
      )}
    </Card>
  );
}

function QuotaRow({
  label,
  free,
  pro,
}: {
  label: string;
  free: string;
  pro: string;
}) {
  return (
    <li className={styles.quotaRow}>
      <span className={styles.quotaLabel}>{label}</span>
      <span className={styles.quotaFree}>{free}</span>
      <span className={styles.quotaArrow} aria-hidden="true">
        <Icon name="chevron-down" size={14} className={styles.quotaArrowIcon} />
      </span>
      <span className={styles.quotaPro}>{pro}</span>
    </li>
  );
}

function WelcomeBody() {
  const navigate = useNavigate();

  return (
    <div className={styles.view}>
      <header className={styles.hero}>
        <span className={styles.heroSparkle} aria-hidden="true">
          <Icon name="sparkles" size={28} />
        </span>
        <p className={styles.heroEyebrow}>You're on Learnora Pro</p>
        <h1 className={styles.heroTitle}>Welcome to Pro.</h1>
        <p className={styles.heroSub}>
          Everything you already had still works exactly the same. Here's
          what just got added.
        </p>
      </header>

      <section className={styles.featureGrid} aria-label="Pro features">
        {PRO_FEATURES.map((f) => (
          <FeatureCard key={f.id} id={f.id} />
        ))}
      </section>

      <Card
        as="section"
        variant="panel"
        radius="lg"
        padding="lg"
        className={styles.quotaCard}
      >
        <h2 className={styles.quotaTitle}>Your new limits</h2>
        <ul className={styles.quotaList}>
          <QuotaRow
            label="AI generations / day"
            free={String(QUOTAS.free.aiGenerationsPerDay)}
            pro={String(QUOTAS.pro.aiGenerationsPerDay)}
          />
          <QuotaRow
            label="Notebooks"
            free={String(QUOTAS.free.notebooks)}
            pro="Unlimited"
          />
          <QuotaRow
            label="Imported calendars"
            free={String(QUOTAS.free.importedCalendars)}
            pro={String(QUOTAS.pro.importedCalendars)}
          />
        </ul>
      </Card>

      <footer className={styles.footer}>
        <Button
          variant="secondary"
          onClick={() => navigate("/settings")}
        >
          Manage billing
        </Button>
        <Button variant="primary" onClick={() => navigate("/")}>
          Take me to my dashboard
        </Button>
      </footer>
    </div>
  );
}

function SettingUpBody() {
  return (
    <div className={styles.settingUp} aria-busy="true">
      <span className={styles.heroSparkle} aria-hidden="true">
        <Icon name="sparkles" size={28} />
      </span>
      <h1 className={styles.heroTitle}>Setting up your Pro account…</h1>
      <p className={styles.heroSub}>
        This usually takes a couple of seconds. Hang tight.
      </p>
      <Skeleton height={64} className={styles.settingUpSkeleton} />
      <Skeleton height={160} className={styles.settingUpSkeleton} />
    </div>
  );
}

export function WelcomeToProView() {
  const { isPro, isPending } = useEntitlements();
  const refresh = useRefreshSubscription();
  const [params] = useSearchParams();
  const fromCheckout = params.get("checkout") === "success";
  const [attempt, setAttempt] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  /* Poll a few times if we arrived straight from checkout and the plan
     hasn't caught up yet — same race BillingTab already covers, just with
     somewhere to land while it resolves instead of a bare toast. */
  useEffect(() => {
    if (isPro || isPending || !fromCheckout) return;
    if (attempt >= RETRY_DELAYS_MS.length) {
      setGaveUp(true);
      return;
    }
    const t = setTimeout(() => {
      refresh();
      setAttempt((n) => n + 1);
    }, RETRY_DELAYS_MS[attempt]);
    return () => clearTimeout(t);
  }, [isPro, isPending, fromCheckout, attempt, refresh]);

  if (isPending) {
    return <SettingUpBody />;
  }

  if (!isPro) {
    if (fromCheckout && !gaveUp) return <SettingUpBody />;
    // Reached directly by a free account (bookmark, back button, a stale
    // link) — there's nothing to onboard them into, so send them to the
    // place that explains what they'd be onboarded into.
    return <Navigate to="/settings" replace />;
  }

  return <WelcomeBody />;
}
