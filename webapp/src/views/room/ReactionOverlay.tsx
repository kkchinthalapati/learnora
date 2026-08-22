import type { FloatingReaction, CheerNotification } from "./types";
import styles from "./room.module.css";

export interface ReactionOverlayProps {
  reactions: FloatingReaction[];
  cheerFeed?: CheerNotification[];
}

export function ReactionOverlay({
  reactions,
  cheerFeed = [],
}: ReactionOverlayProps) {
  return (
    <>
      {/* Floating Emojis Animation Layer */}
      <div className={styles.reactionOverlay} aria-hidden="true">
        {reactions.map((reaction) => {
          // Clamp x between 5% and 90% so emoji doesn't clip screen boundaries
          const leftPos = Math.max(5, Math.min(90, reaction.x ?? 50));
          return (
            <span
              key={reaction.id}
              className={styles.floatingEmoji}
              style={{ left: `${leftPos}%` }}
            >
              {reaction.emoji}
            </span>
          );
        })}
      </div>

      {/* Non-intrusive Cheer Activity Feed */}
      {cheerFeed.length > 0 && (
        <aside
          className={styles.cheerFeed}
          aria-live="polite"
          aria-atomic="false"
          aria-label="Recent cheer notifications"
        >
          {cheerFeed.slice(-3).map((toast) => (
            <div key={toast.id} className={styles.cheerToast} role="status">
              <span className={styles.toastEmoji}>{toast.emoji}</span>
              <p className={styles.toastText}>
                <strong>{toast.fromName}</strong> cheered{" "}
                <strong>{toast.toName}</strong> {toast.emoji}
              </p>
            </div>
          ))}
        </aside>
      )}
    </>
  );
}
