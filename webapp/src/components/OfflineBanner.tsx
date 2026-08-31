import { Icon } from "./Icon";
import { useOnlineStatus } from "../lib/offlineSync";
import styles from "./OfflineBanner.module.css";

export function OfflineBanner() {
  const { isOnline, queueSize, isSyncing, syncNow } = useOnlineStatus();

  // Hide when connected with nothing pending and not currently syncing
  if (isOnline && !isSyncing && queueSize === 0) {
    return null;
  }

  /* The emoji these strings used to carry (🔄, ⚡) sat in front of a status
     message that is announced by a live region — a screen reader read them
     aloud as "counterclockwise arrows button". The app has an icon set; use it,
     and leave the message as words. */
  let message = "";
  let pillClass = styles.offline;
  let icon: "refresh-cw" | "alert-triangle" | "clock" = "alert-triangle";

  if (isSyncing) {
    pillClass = styles.syncing;
    icon = "refresh-cw";
    message = `Syncing ${queueSize} saved change${queueSize === 1 ? "" : "s"}…`;
  } else if (!isOnline) {
    pillClass = styles.offline;
    icon = "alert-triangle";
    message = "You're offline. Your work is saved and will sync when you reconnect.";
  } else {
    pillClass = styles.pending;
    icon = "clock";
    message = `${queueSize} change${queueSize === 1 ? "" : "s"} waiting to sync`;
  }

  return (
    <div className={styles.bannerWrapper} role="status" aria-live="polite">
      <div className={`${styles.pill} ${pillClass}`}>
        <Icon name={icon} size={14} aria-hidden />
        <span className={styles.message}>{message}</span>
        <button
          type="button"
          className={styles.syncBtn}
          onClick={() => {
            void syncNow();
          }}
          disabled={isSyncing}
          title="Sync your saved changes now"
        >
          {isSyncing ? (
            <>
              <Icon name="refresh-cw" size={13} className={styles.spin} aria-hidden />{" "}
              Syncing…
            </>
          ) : (
            "Sync now"
          )}
        </button>
      </div>
    </div>
  );
}
