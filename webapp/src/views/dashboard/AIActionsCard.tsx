import { useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useGenerateWeeklyPlan } from "../../hooks/useAI";
import { usePlanForWeek } from "../../hooks/usePlans";
import { useWeakTopics } from "../../hooks/useQuizzes";
import { localDateStr, mondayOfWeek } from "../../lib/date";
import styles from "./dashboard.module.css";

/* "Ask Learnora AI" card — ports index.html:533-573.
 *
 * "Plan my week" is wired for real as of Step 14 (api/ai.ts's
 * generateWeeklyPlan). The other three buttons ("What next?", "Quiz me",
 * "Summarize notes") stay stubbed: they're chat-driven in the vanilla
 * (`AI.send()`), and the chat surface is Step 17's job, not this one's — the
 * ledger's own dependency table has 17 depend on 13, not the other way
 * round. Each still opens with the same "not connected yet" message Step 6's
 * MaterialPanel established, a real affordance that's honest about not
 * doing anything yet rather than a silent dead end.
 *
 * The weak-topics chips beneath them are NOT AI-gated — `fetchWeakTopics`
 * only aggregates `quiz_attempts.weak_topics`, a plain read that has existed
 * since Step 5 — so they're wired for real too. */

const NOT_CONNECTED_MESSAGE =
  "AI features aren't connected yet — Step 14 wires this up.";

const STUB_ACTIONS: { icon: IconName; label: string }[] = [
  { icon: "target", label: "What next?" },
  { icon: "brain", label: "Quiz me" },
  { icon: "file-text", label: "Summarize notes" },
];

export function AIActionsCard() {
  const { showToast } = useToast();
  const { confirm } = useDialog();
  const navigate = useNavigate();
  const { data: weakTopics } = useWeakTopics(3);

  // Mirrors the vanilla dashboard button's own pre-check (js/main.js:2446-
  // 2457): generateWeeklyPlan() itself never confirms, in either app — the
  // caller decides whether an existing plan is worth warning about.
  const weekStartISO = localDateStr(mondayOfWeek());
  const existingPlan = usePlanForWeek(weekStartISO);
  const generatePlan = useGenerateWeeklyPlan();

  async function planMyWeek() {
    if (generatePlan.isPending) return;
    if (existingPlan.data) {
      const ok = await confirm(
        "This will replace your current weekly plan. Continue?",
        { title: "Regenerate Weekly Plan", confirmText: "Regenerate", danger: true },
      );
      if (!ok) return;
    }
    try {
      await generatePlan.mutateAsync();
      void navigate("/plan");
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : "Failed to generate your weekly plan. Please try again.",
        { error: true },
      );
    }
  }

  return (
    <div className={`${styles.card} ${styles.aiCard}`}>
      <span className={styles.eyebrow}>Ask Learnora AI</span>
      <p className={styles.sub}>Turn your workload into a plan in one tap.</p>
      <div className={styles.aiActions}>
        <button
          type="button"
          className={styles.aiBtn}
          disabled={generatePlan.isPending}
          onClick={() => void planMyWeek()}
        >
          <span className={styles.aiIcon}>
            <Icon name="calendar-week" size={18} />
          </span>
          {generatePlan.isPending ? "Planning…" : "Plan my week"}
        </button>
        {STUB_ACTIONS.map((a) => (
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
