import { useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useGenerateWeeklyPlan, usePlanForWeek } from "../../hooks/usePlans";
import { useWeakTopics } from "../../hooks/useQuizzes";
import { AiError } from "../../api/ai";
import { PlanShapeError } from "../../api/aiPlan";
import { localDateStr, mondayOfWeek } from "../../lib/date";
import styles from "./dashboard.module.css";

/* "Ask Learnora AI" card — ports index.html:533-573.
 *
 * "Plan my week" is wired for real (js/main.js:2445-2466): it generates and
 * persists this week's plan, then lands the student on /plan. The other three
 * still open with a "not connected yet" message — the same honest affordance
 * Step 6's MaterialPanel established — because "What next?" and "Summarize
 * notes" are chat prompts (step 17) and "Quiz me" needs the Create pipeline's
 * generation path, which is not ported yet.
 *
 * The weak-topics chips beneath them are NOT AI-gated — `fetchWeakTopics`
 * only aggregates `quiz_attempts.weak_topics`, a plain read that has existed
 * since Step 5 — so they're wired for real. */

const NOT_CONNECTED_MESSAGE =
  "AI chat isn't connected yet — Step 17 wires this up.";

const CHAT_ACTIONS: { icon: IconName; label: string }[] = [
  { icon: "target", label: "What next?" },
  { icon: "brain", label: "Quiz me" },
  { icon: "file-text", label: "Summarize notes" },
];

export function AIActionsCard() {
  const { showToast } = useToast();
  const { confirm } = useDialog();
  const navigate = useNavigate();
  const { data: weakTopics } = useWeakTopics(3);

  const weekStartISO = localDateStr(mondayOfWeek());
  const { data: existingPlan } = usePlanForWeek(weekStartISO);
  const generate = useGenerateWeeklyPlan();

  const planMyWeek = async () => {
    if (existingPlan) {
      const ok = await confirm(
        "This will replace your current weekly plan. Continue?",
        {
          title: "Regenerate Weekly Plan",
          confirmText: "Regenerate",
          danger: true,
        },
      );
      if (!ok) return;
    }

    generate.mutate(undefined, {
      onSuccess: () => void navigate("/plan"),
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

  return (
    <div className={`${styles.card} ${styles.aiCard}`}>
      <span className={styles.eyebrow}>Ask Learnora AI</span>
      <p className={styles.sub}>Turn your workload into a plan in one tap.</p>
      <div className={styles.aiActions}>
        <button
          type="button"
          className={styles.aiBtn}
          disabled={generate.isPending}
          onClick={() => void planMyWeek()}
        >
          <span className={styles.aiIcon}>
            <Icon name="calendar-week" size={18} />
          </span>
          {generate.isPending ? "Generating…" : "Plan my week"}
        </button>
        {CHAT_ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            className={styles.aiBtn}
            onClick={() => showToast(NOT_CONNECTED_MESSAGE)}
          >
            <span className={styles.aiIcon}>
              <Icon name={a.icon} size={18} />
            </span>
            {a.label}
          </button>
        ))}
      </div>
      {weakTopics && weakTopics.length > 0 ? (
        <div className={styles.weakTopics}>
          <span className={styles.weakTopicsLabel}>Struggling with: </span>
          {weakTopics.map((t) => (
            <span key={t.topic} className={styles.weakTopicPill}>
              {t.topic}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
