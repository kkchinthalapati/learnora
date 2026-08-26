import { useId, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useTimer } from "../../context/timer";
import {
  useGenerateWeeklyPlan,
  usePlanForWeek,
  useUpdatePlan,
} from "../../hooks/usePlans";
import { useTranslation } from "../../hooks/useTranslation";
import { useExams } from "../../hooks/useExams";
import { useQuizAttempts } from "../../hooks/useQuizzes";
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
import {
  computeHourlyDistribution,
  detectPeakFocusWindow,
} from "../../lib/analyticsEngine";
import {
  detectPlanDeficit,
  rebalanceWeeklyPlan,
} from "../../lib/planRebalancer";
import {
  addStoredPlanBlock,
  PlanEditError,
  removeStoredPlanBlock,
  toPlanBlockInput,
  updateStoredPlanBlock,
  type PlanBlockInput,
  type PlanBlockLocation,
} from "./planEdits";
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

interface WeekDateOption {
  date: string;
  label: string;
}

type BlockEditorState =
  | {
      kind: "edit";
      location: PlanBlockLocation;
      initial: PlanBlockInput;
    }
  | { kind: "add"; initial: PlanBlockInput }
  | null;

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
  onEdit,
  saving,
}: {
  block: PlanBlock;
  onStart: (block: PlanBlock) => void;
  onEdit: () => void;
  saving: boolean;
}) {
  const mins = block.durationMins ?? DEFAULT_BLOCK_MINUTES;
  const isPeak =
    block.startHint?.includes("Peak Focus") ||
    block.startHint?.toLowerCase().includes("optimal") ||
    block.reason?.includes("Peak Focus");

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span className={styles.blockSubject}>
          {block.subject}
          {isPeak && (
            <span className={styles.peakBadge}>
              <Icon name="zap" size={10} /> Peak Focus
            </span>
          )}
        </span>
        {/* The subject is in the accessible name because a week of blocks
            otherwise ships a dozen identically-named "Start" buttons, which is
            unusable from a screen reader's control list. */}
        <span className={styles.blockActions}>
          <Button
            size="sm"
            className={styles.blockEdit}
            aria-label={`Edit ${block.subject} plan block`}
            onClick={onEdit}
            disabled={saving}
          >
            <Icon name="pencil" size={13} />
            Edit
          </Button>
          <Button
            size="sm"
            className={styles.blockStart}
            aria-label={`Start a ${mins} minute focus session for ${block.subject}`}
            onClick={() => onStart(block)}
          >
            Start →
          </Button>
        </span>
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
  dayIndex,
  today,
  onStart,
  onEdit,
  onAdd,
  saving,
}: {
  day: PlanDay;
  dayIndex: number;
  today: string;
  onStart: (block: PlanBlock) => void;
  onEdit: (location: PlanBlockLocation, block: PlanBlock, date: string) => void;
  onAdd: (date: string) => void;
  saving: boolean;
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
      <div className={styles.dayHeadingRow}>
        <h3 className={styles.dayHeader}>{label}</h3>
        <button
          type="button"
          className={styles.addBlockButton}
          onClick={() => onAdd(day.date)}
          disabled={saving}
          aria-label={`Add a study block on ${label}`}
          title="Add study block"
        >
          +
        </button>
      </div>
      <div className={styles.dayBlocks}>
        {blocks.length > 0 ? (
          blocks.map((block, i) => (
            <BlockCard
              key={`${block.subject}-${i}`}
              block={block}
              onStart={onStart}
              onEdit={() =>
                onEdit({ dayIndex, blockIndex: i }, block, day.date)
              }
              saving={saving}
            />
          ))
        ) : (
          <p className={styles.dayEmpty}>Free day — nothing scheduled</p>
        )}
      </div>
    </li>
  );
}

function BlockEditor({
  state,
  weekDates,
  saving,
  onClose,
  onSave,
  onRemove,
}: {
  state: Exclude<BlockEditorState, null>;
  weekDates: WeekDateOption[];
  saving: boolean;
  onClose: () => void;
  onSave: (input: PlanBlockInput) => void;
  onRemove: () => void;
}) {
  const formId = useId();
  const subjectId = useId();
  const durationId = useId();
  const hintId = useId();
  const dateId = useId();
  const [draft, setDraft] = useState(state.initial);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const subject = draft.subject.trim();
    if (!subject || !Number.isFinite(draft.durationMins)) return;
    onSave({
      ...draft,
      subject,
      durationMins: Math.max(5, Math.min(240, Math.round(draft.durationMins))),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={state.kind === "edit" ? "Edit study block" : "Add study block"}
      subtitle="Adjust this block without regenerating the rest of your week."
      contentClassName={styles.editorModal}
      footer={
        <>
          {state.kind === "edit" ? (
            <Button variant="danger" onClick={onRemove} disabled={saving}>
              Remove block
            </Button>
          ) : null}
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={saving || !draft.subject.trim()}
          >
            {saving ? "Saving…" : "Save block"}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.editorForm} onSubmit={submit}>
        <label htmlFor={subjectId}>
          Subject or focus
          <input
            id={subjectId}
            value={draft.subject}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                subject: event.target.value,
              }))
            }
            placeholder="e.g. Organic chemistry"
            autoFocus
            required
          />
        </label>
        <div className={styles.editorRow}>
          <label htmlFor={durationId}>
            Duration
            <span className={styles.inputWithSuffix}>
              <input
                id={durationId}
                type="number"
                min={5}
                max={240}
                step={5}
                value={draft.durationMins}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    durationMins: Number(event.target.value),
                  }))
                }
                required
              />
              <span>minutes</span>
            </span>
          </label>
          <label htmlFor={dateId}>
            Day
            <select
              id={dateId}
              value={draft.date}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  date: event.target.value,
                }))
              }
            >
              {weekDates.map((option) => (
                <option key={option.date} value={option.date}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label htmlFor={hintId}>
          Preferred time <span className={styles.optional}>(optional)</span>
          <input
            id={hintId}
            value={draft.startHint ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                startHint: event.target.value,
              }))
            }
            placeholder="e.g. After class or 7:00 PM"
          />
        </label>
      </form>
    </Modal>
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
  const updatePlan = useUpdatePlan();
  const [editor, setEditor] = useState<BlockEditorState>(null);
  const { showToast } = useToast();
  const { confirm } = useDialog();
  const { prepareFocus } = useTimer();
  const navigate = useNavigate();
  const { data: exams } = useExams();

  const isTriageAvailable = exams?.some((e) => {
    if (e.status === "Completed") return false;
    /* Exam dates are calendar dates, not instants. Comparing a date-only
       value with Date.now() made an exam scheduled for today look past its
       deadline as soon as local midnight passed. Compare local midnights so
       today's exam remains eligible and a genuinely past exam does not. */
    const examDate = parseLocalDate(e.exam_date);
    const todayDate = parseLocalDate(today);
    if (Number.isNaN(examDate.getTime())) return false;
    const diffDays = Math.round(
      (examDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diffDays >= 0 && diffDays <= 3;
  });

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekRange = `${formatMonthDay(monday)} – ${formatMonthDay(sunday)}`;
  const weekDates: WeekDateOption[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      date: localDateStr(date),
      label: `${WEEKDAY_NAMES[date.getDay()]}, ${formatMonthDay(date)}`,
    };
  });

  const parsed = plan ? parseStoredPlan(plan.plan_json) : null;
  const hasPlan = !!parsed && parsed.days.length > 0;
  const isTriageActive = parsed?.isTriage === true;

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
  const { data: quizAttempts = [] } = useQuizAttempts();
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

  /* Chronotype & Peak Focus Window calculation */
  const hourlyStats = useMemo(
    () => computeHourlyDistribution(recentSessions || [], quizAttempts || []),
    [recentSessions, quizAttempts],
  );
  const peakFocusWindow = useMemo(
    () => detectPeakFocusWindow(hourlyStats),
    [hourlyStats],
  );

  /* Plan Deficit & Intelligent Auto-Rebalancing */
  const deficit = useMemo(
    () =>
      hasPlan && plan
        ? detectPlanDeficit(plan.plan_json, recentSessions || [], folders || [])
        : null,
    [hasPlan, plan, recentSessions, folders],
  );

  const showRebalanceBanner =
    hasPlan && deficit?.isBehind && deficit.remainingDaysCount > 0;

  const handleAutoRebalance = () => {
    if (!plan) return;
    const result = rebalanceWeeklyPlan(plan.plan_json, recentSessions || [], {
      folders: folders || [],
      peakFocusWindow,
    });
    if (result.isRebalanced) {
      saveEditedPlan(result.rebalancedPlan, result.summary);
    }
  };

  /* Ports the vanilla's `start-plan-block` handoff (js/router.js:82-85): the
     block's duration and subject are pre-staged on the timer and the student
     lands on /timer with only Start left to press. */
  const startBlock = (block: PlanBlock) => {
    prepareFocus(block.durationMins ?? DEFAULT_BLOCK_MINUTES, block.subject);
    void navigate("/timer");
  };

  const saveEditedPlan = (nextPlanJson: unknown, message: string) => {
    updatePlan.mutate(
      { weekStartISO, planJson: nextPlanJson },
      {
        onSuccess: () => {
          setEditor(null);
          showToast(message);
        },
        onError: (saveError) =>
          showToast(
            saveError instanceof PlanEditError
              ? saveError.message
              : "Could not save your plan change. Please try again.",
            { error: true },
          ),
      },
    );
  };

  const saveBlock = (input: PlanBlockInput) => {
    if (!plan || !editor) return;
    try {
      const nextPlanJson =
        editor.kind === "edit"
          ? updateStoredPlanBlock(plan.plan_json, editor.location, input)
          : addStoredPlanBlock(plan.plan_json, input);
      saveEditedPlan(
        nextPlanJson,
        editor.kind === "edit" ? "Study block updated." : "Study block added.",
      );
    } catch (editError) {
      showToast(
        editError instanceof PlanEditError
          ? editError.message
          : "Could not prepare that plan change.",
        { error: true },
      );
    }
  };

  const removeBlock = async () => {
    if (!plan || editor?.kind !== "edit") return;
    const ok = await confirm("Remove this study block from your week?", {
      title: "Remove Study Block",
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      saveEditedPlan(
        removeStoredPlanBlock(plan.plan_json, editor.location),
        "Study block removed.",
      );
    } catch (editError) {
      showToast(
        editError instanceof PlanEditError
          ? editError.message
          : "Could not prepare that plan change.",
        { error: true },
      );
    }
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

    generate.mutate(false, {
      onSuccess: () => showToast("Your weekly plan is ready."),
      onError: (err) => {
        const message =
          err instanceof PlanShapeError ||
          (err instanceof AiError && err.refused)
            ? err.message
            : "Failed to generate your weekly plan. Please try again.";
        showToast(message, { error: true });
      },
    });
  };

  const runTriage = async () => {
    if (hasPlan) {
      const ok = await confirm(
        "This will replace your current weekly plan with an emergency 48-hour survival schedule. Proceed?",
        {
          title: "Emergency Triage",
          confirmText: "Triage Mode",
          danger: true,
        },
      );
      if (!ok) return;
    }

    generate.mutate(true, {
      onSuccess: () => showToast("Triage plan generated! Focus up."),
      onError: (err) => {
        const message =
          err instanceof PlanShapeError ||
          (err instanceof AiError && err.refused)
            ? err.message
            : "Failed to generate your triage plan. Please try again.";
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
          heading. See archive/redesign/DESIGN_MOVES.md move #2. */}
      <Card
        variant="panel"
        padding="none"
        className={`${styles.summaryCard} ${isTriageActive ? styles.triageSummary : ""}`}
      >
        <div>
          <p className={styles.title}>{t("header_plan")}</p>
          <p className={styles.weekRange}>{weekRange}</p>
          {peakFocusWindow && (
            <div
              className={styles.chronotypeBadge}
              title={peakFocusWindow.description}
            >
              <Icon name="zap" size={13} />
              <span>
                Optimal Focus: <strong>{peakFocusWindow.label}</strong>
              </span>
            </div>
          )}
          {isTriageActive && (
            <p
              style={{
                color: "var(--accent-red)",
                fontWeight: "bold",
                marginTop: "4px",
              }}
            >
              <Icon name="alert-triangle" size={14} /> EMERGENCY TRIAGE ACTIVE
            </p>
          )}
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
        {isTriageAvailable && (
          <Button
            onClick={() => void runTriage()}
            disabled={generate.isPending}
            variant="danger"
            style={{ marginLeft: "8px" }}
          >
            <Icon name="zap" size={15} />
            Triage
          </Button>
        )}
      </Card>

      {showRebalanceBanner && deficit && (
        <Card
          variant="panel"
          padding="none"
          className={styles.rebalanceBanner}
          role="region"
          aria-label="Auto-rebalance study schedule"
        >
          <div className={styles.rebalanceContent}>
            <div className={styles.rebalanceIcon} aria-hidden="true">
              <Icon name="refresh-cw" size={18} />
            </div>
            <div>
              <div className={styles.rebalanceTitle}>
                Schedule Rebalancing Available ({deficit.totalMissedMinutes}m behind)
              </div>
              <p className={styles.rebalanceMessage}>
                {deficit.recommendation}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            onClick={handleAutoRebalance}
            disabled={updatePlan.isPending}
            className={styles.rebalanceButton}
          >
            <Icon name="refresh-cw" size={14} />
            {updatePlan.isPending ? "Rebalancing…" : "Auto-Rebalance Schedule"}
          </Button>
        </Card>
      )}

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
          {parsed.days.map((day, dayIndex) => (
            <DayCard
              key={day.date}
              day={day}
              dayIndex={dayIndex}
              today={today}
              onStart={startBlock}
              saving={updatePlan.isPending}
              onAdd={(date) =>
                setEditor({
                  kind: "add",
                  initial: { subject: "", durationMins: 25, date },
                })
              }
              onEdit={(location, block, date) =>
                setEditor({
                  kind: "edit",
                  location,
                  initial: toPlanBlockInput(block, date),
                })
              }
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

      {editor ? (
        <BlockEditor
          key={`${editor.kind}-${editor.initial.date}-${editor.kind === "edit" ? `${editor.location.dayIndex}-${editor.location.blockIndex}` : "new"}`}
          state={editor}
          weekDates={weekDates}
          saving={updatePlan.isPending}
          onClose={() => {
            if (!updatePlan.isPending) setEditor(null);
          }}
          onSave={saveBlock}
          onRemove={() => void removeBlock()}
        />
      ) : null}
    </div>
  );
}
