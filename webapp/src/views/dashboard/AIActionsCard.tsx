import { useNavigate } from "react-router";
import { Card } from "../../components/Card";
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
    // Keep the topic blank so the student chooses it before sending.
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
    <Card variant="elevated" className={styles.aiCard}>
      <div className={styles.aiCardHeader}>
        <span className={styles.eyebrow}>Ask Learnora AI</span>
        <span className={styles.kbdHint} aria-hidden="true">
          <kbd className={styles.kbd}>⌘K</kbd>
        </span>
      </div>
      <p className={styles.sub}>
        Generate a weekly plan or ask about your next study step.
      </p>
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
    </Card>
  );
}
