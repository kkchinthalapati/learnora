import styles from "../slackWorkspace.module.css";
import type { AIMentionTarget } from "../../../lib/slack/mentions";

export interface ThinkingIndicatorProps {
  persona: AIMentionTarget;
}

export function ThinkingIndicator({ persona }: ThinkingIndicatorProps) {
  const name = persona === "k_ai" ? "K AI" : "N AI";
  const avatarLetter = persona === "k_ai" ? "K" : "N";
  const avatarBg = persona === "k_ai" ? "#7c3aed" : "#0d9488";
  const statusPhrase =
    persona === "k_ai"
      ? "is formulating strategic recommendation..."
      : "is analyzing operational risks...";

  return (
    <div
      className={styles.thinkingMessageRow}
      role="status"
      aria-live="polite"
      aria-label={`${name} is thinking`}
    >
      <div
        className={styles.messageAvatar}
        style={{ backgroundColor: avatarBg }}
        aria-hidden="true"
      >
        {avatarLetter}
      </div>

      <div className={styles.messageBody}>
        <div className={styles.messageAuthorHeader}>
          <span className={styles.messageAuthorName}>{name}</span>
          <span className={styles.messageRoleBadgeAi}>AI Advisor</span>
        </div>

        <div className={styles.thinkingContentRow}>
          <span className={styles.thinkingStatusText}>{statusPhrase}</span>
          <span className={styles.thinkingDots} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </span>
        </div>
      </div>
    </div>
  );
}
