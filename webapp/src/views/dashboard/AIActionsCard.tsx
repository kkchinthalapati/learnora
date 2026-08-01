import { useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { useChat } from "../../context/chat";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useGenerateWeeklyPlan, usePlanForWeek } from "../../hooks/usePlans";
import { useWeakTopics } from "../../hooks/useQuizzes";
import { AiError } from "../../api/ai";
import { PlanShapeError } from "../../api/aiPlan";
import { localDateStr, mondayOfWeek } from "../../lib/date";
import styles from "./dashboard.module.css";

/* "Ask Learnora AI" card — ports index.html:533-573 and its wiring in
 * js/main.js (:2445-2482).
 *
 * "Plan my week" generates and persists this week's plan, then lands the
 * student on /plan. The other three are chat prompts: the vanilla put two of
 * them on `data-chat-prompt` + `data-chat-send`, and "Quiz me" opened the
 * Create dialog pre-filled. This one drops a half-written prompt into the
 * composer instead — the chat's `<ADD_QUIZ>` tag reaches the very same
 * generator the Create dialog does (`generateQuizFrom`, api/aiQuiz.ts), with
 * the same confirmation in front of it, and it doesn't commit the student to
 * a topic before they've named one.
 *
 * The weak-topic chips beneath are not AI-gated: `fetchWeakTopics` only
 * aggregates `quiz_attempts.weak_topics`, a plain read. */

interface ChatAction {
  icon: IconName;
  label: string;
  prompt: string;
  /** False drops the prompt into the composer instead of sending it. */
  autoSend: boolean;
}

const CHAT_ACTIONS: ChatAction[] = [
  {
    icon: "target",
    label: "What next?",
    prompt:
      "What should I focus on right now given my next exam and open tasks?",
    autoSend: true,
  },
  {
    icon: "brain",
    label: "Quiz me",
    /* Left unsent on purpose: the vanilla's version pre-selected a material
       in a dialog the student could still change, so firing a quiz on a topic
       nobody named would be a downgrade. */
    prompt: "Quiz me on ",
    autoSend: false,
  },
  {
    icon: "file-text",
    label: "Summarize notes",
    prompt: "Summarize the notes I uploaded most recently into key points.",
    autoSend: true,
  },
];

export function AIActionsCard() {
  const { showToast } = useToast();
  const { confirm } = useDialog();
  const { open, compose, send } = useChat();
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

  const runChatAction = (action: ChatAction) => {
    if (!action.autoSend) {
      compose(action.prompt);
      return;
    }
    open();
    void send(action.prompt);
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
        {CHAT_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            className={styles.aiBtn}
            onClick={() => runChatAction(action)}
          >
            <span className={styles.aiIcon}>
              <Icon name={action.icon} size={18} />
            </span>
            {action.label}
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
