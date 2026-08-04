import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useTimer } from "../../context/timer";
import { useGenerateWeeklyPlan, usePlanForWeek } from "../../hooks/usePlans";
import { useTranslation } from "../../hooks/useTranslation";
import { AiError } from "../../api/ai";
import { PlanShapeError } from "../../api/aiPlan";
import {
  formatMonthDay,
  formatRelativeTime,
  localDateStr,
  mondayOfWeek,
  parseLocalDate,
  WEEKDAY_NAMES,
} from "../../lib/date";
import type { PlanBlock, PlanDay } from "../../lib/aiJson";
import { DEFAULT_BLOCK_MINUTES, parseStoredPlan } from "../../lib/planShape";
import { useFolders } from "../../hooks/useFolders";
import { useSessionsSince } from "../../hooks/useSessions";
import { computeWeekAdherence } from "../../lib/planAdherence";
import styles from "./plan.module.css";

/* The Weekly Plan — ports index.html:942-955 + js/router.js's `loadPlanView`
 * (:1046-1141) and `AI.generateWeeklyPlan`'s call site.
 *
 * The week is derived from `mondayOfWeek()` on render rather than held in
 * state: there is exactly one plan per user per week and no week-stepping UI
 * in the vanilla, so anything else would be inventing a feature.
 *
 * `plan_json` is model output round-tripped through the database, so it is
 * narrowed through `parseStoredPlan` before the grid touches it (see
 * planMeta.ts) instead of the vanilla's optimistic `d.blocks || []`. */

const SKELETON_CARDS = 5;

function DaySkeleton() {
  return (
    <div className={`${styles.dayCard} ${styles.skeleton}`} aria-hidden="true">
      <div className={styles.dayHeader} />
      <div className={styles.block} />
      <div className={styles.block} />
    </div>
  );
}

function BlockCard({
  block,
  onStart,
}: {
  block: PlanBlock;
  onStart: (block: PlanBlock) => void;
}) {
  const mins = block.durationMins ?? DEFAULT_BLOCK_MINUTES;
  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span className={styles.blockSubject}>{block.subject}</span>
        {/* The subject is in the accessible name because a week of blocks
            otherwise ships a dozen identically-named "Start" buttons, which is
            unusable from a screen reader's control list. */}
        <Button
          size="sm"
          className={styles.blockStart}
          aria-label={`Start a ${mins} minute focus session for ${block.subject}`}
          onClick={() => onStart(block)}
        >
          Start →
        </Button>
      </div>
      <div className={styles.blockMeta}>
        {mins}m{block.startHint ? ` · ${block.startHint}` : ""}
      </div>
      {block.reason ? (
        <p className={styles.blockReason}>{block.reason}</p>
      ) : null}
    </div>
  );
}

function DayCard({
  day,
  today,
  onStart,
}: {
  day: PlanDay;
  today: string;
  onStart: (block: PlanBlock) => void;
}) {
  const isToday = day.date === today;
  const isPast = day.date < today;
  const dateObj = day.date ? parseLocalDate(day.date) : null;
  const label =
    dateObj && !Number.isNaN(dateObj.getTime())
      ? `${WEEKDAY_NAMES[dateObj.getDay()]}, ${formatMonthDay(dateObj)}`
      : day.date;
  const blocks = day.blocks ?? [];

  const classes = [
    styles.dayCard,
    isToday ? styles.isToday : null,
    isPast ? styles.isPast : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={classes} aria-current={isToday ? "date" : undefined}>
      {/* "is-today" and "is-past" are colour-only in the vanilla, so the
          distinction never reached assistive tech; aria-current carries it. */}
      <h3 className={styles.dayHeader}>{label}</h3>
      <div className={styles.dayBlocks}>
        {blocks.length > 0 ? (
          blocks.map((block, i) => (
            <BlockCard
              key={`${block.subject}-${i}`}
              block={block}
              onStart={onStart}
            />
          ))
        ) : (
          <p className={styles.dayEmpty}>Free day — nothing scheduled</p>
        )}
      </div>
    </li>
  );
}

export function PlanView() {
  const t = useTranslation();
  const monday = mondayOfWeek();
  const weekStartISO = localDateStr(monday);
  const today = localDateStr();

  const {
    data: plan,
    isPending,
    isError,
    error,
  } = usePlanForWeek(weekStartISO);
  const generate = useGenerateWeeklyPlan();
  const { showToast } = useToast();
  const { confirm } = useDialog();
  const { prepareFocus } = useTimer();
  const navigate = useNavigate();

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekRange = `${formatMonthDay(monday)} – ${formatMonthDay(sunday)}`;

  const parsed = plan ? parseStoredPlan(plan.plan_json) : null;
  const hasPlan = !!parsed && parsed.days.length > 0;

  /* "Did last week's plan actually happen?" — a quiet recap, not a new
     generation input the student has to act on (that part happens inside
     the prompt api/aiPlan.ts builds; this is just showing the same signal
     back). Computed from whatever plan/sessions/folders are already
     cached — no dedicated fetch beyond the two extra reads. */
  const prevMonday = new Date(monday);
  prevMonday.setDate(prevMonday.getDate() - 7);
  const prevWeekStartISO = localDateStr(prevMonday);
  const { data: prevPlan } = usePlanForWeek(prevWeekStartISO);
  const { data: recentSessions } = useSessionsSince(14);
  const { data: folders } = useFolders();
  const prevParsed = prevPlan ? parseStoredPlan(prevPlan.plan_json) : null;
  const adherence =
    prevParsed && prevParsed.days.length > 0 && recentSessions && folders
      ? computeWeekAdherence(
          prevParsed.days,
          recentSessions,
          folders,
          prevWeekStartISO,
        )
      : null;

  /* Ports the vanilla's `start-plan-block` handoff (js/router.js:82-85): the
     block's duration and subject are pre-staged on the timer and the student
     lands on /timer with only Start left to press. */
  const startBlock = (block: PlanBlock) => {
    prepareFocus(block.durationMins ?? DEFAULT_BLOCK_MINUTES, block.subject);
    void navigate("/timer");
  };

  /* Regenerating overwrites this week's row (`Plans.upsert` is keyed on
     user + week_start), so it asks first — the vanilla did the same on both
     entry points (js/main.js:2446-2456, :2485-2491). Generating the first
     plan of the week destroys nothing and goes straight through. */
  const runGenerate = async () => {
    if (hasPlan) {
      const ok = await confirm(
        "This will overwrite your current weekly plan. Are you sure you want to regenerate it?",
        {
          title: "Regenerate Weekly Plan",
          confirmText: "Regenerate",
          danger: true,
        },
      );
      if (!ok) return;
    }

    generate.mutate(undefined, {
      onSuccess: () => showToast("Your weekly plan is ready."),
      onError: (err) => {
        /* A refusal and a shape failure both carry wording written for the
           student; anything else is a transport problem and gets the generic
           line the vanilla used. */
        const message =
          err instanceof PlanShapeError ||
          (err instanceof AiError && err.refused)
            ? err.message
            : "Failed to generate your weekly plan. Please try again.";
        showToast(message, { error: true });
      },
    });
  };

  return (
    <div className={styles.view}>
      {/* The app shell's Header supplies the page's real <h1> (t("nav_...")
          isn't defined for /plan, but sectionLabel.ts hardcodes the same
          "This week's plan" text this card used to duplicate as its own
          <h1>) — this card's title is plain text now, not a second
          heading. See redesign/DESIGN_MOVES.md move #2. */}
      <Card variant="panel" padding="none" className={styles.summaryCard}>
        <div>
          <p className={styles.title}>{t("header_plan")}</p>
          <p className={styles.weekRange}>{weekRange}</p>
        </div>
        <Button
          onClick={() => void runGenerate()}
          disabled={generate.isPending}
        >
          <Icon name={hasPlan ? "refresh-cw" : "bot"} size={15} />
          {generate.isPending
            ? "Generating…"
            : hasPlan
              ? "Regenerate"
              : "Generate Plan"}
        </Button>
      </Card>

      {adherence ? (
        <Card variant="panel" padding="none" className={styles.adherence}>
          <div className={styles.adherenceRow}>
            <span className={styles.adherencePct}>
              {adherence.completionPct}%
            </span>
            <span className={styles.adherenceLabel}>
              of last week&apos;s plan followed
            </span>
          </div>
          {adherence.neglectedSubjects.length > 0 ? (
            <p className={styles.adherenceNote}>
              Under-studied last week:{" "}
              <span className={styles.neglectedTags}>
                {adherence.neglectedSubjects.map((subject) => (
                  <span key={subject} className={styles.neglectedTag}>
                    {subject}
                  </span>
                ))}
              </span>{" "}
              — the next plan will ease these back in.
            </p>
          ) : null}
        </Card>
      ) : null}

      {isError ? (
        <p role="alert" className={styles.loadError}>
          Could not load this week&apos;s plan. {(error as Error).message}
        </p>
      ) : null}

      {hasPlan && parsed.summary ? (
        <Card variant="panel" padding="none" className={styles.summary}>
          <p>{parsed.summary}</p>
          {plan?.created_at ? (
            <p className={styles.lastGenerated}>
              Last generated {formatRelativeTime(plan.created_at)}
            </p>
          ) : null}
        </Card>
      ) : null}

      {isPending || generate.isPending ? (
        <div className={styles.weekGrid} aria-busy="true">
          {Array.from({ length: SKELETON_CARDS }, (_, i) => (
            <DaySkeleton key={i} />
          ))}
        </div>
      ) : hasPlan ? (
        <ul className={styles.weekGrid}>
          {parsed.days.map((day) => (
            <DayCard
              key={day.date}
              day={day}
              today={today}
              onStart={startBlock}
            />
          ))}
        </ul>
      ) : (
        <div className={styles.emptyWrap}>
          <Card variant="panel" padding="none" className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              <Icon name="calendar-week" size={44} />
            </span>
            <h2>No plan yet for this week</h2>
            <p className={styles.emptyMessage}>
              Learnora AI can build one from your open tasks and upcoming exams.
            </p>
            <Button
              variant="primary"
              className={styles.emptyCta}
              onClick={() => void runGenerate()}
              disabled={generate.isPending}
            >
              <Icon name="bot" size={17} />
              Generate Weekly Plan with AI
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
