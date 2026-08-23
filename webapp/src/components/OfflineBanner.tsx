import { useOnlineStatus } from "../lib/offlineSync";
import styles from "./OfflineBanner.module.css";

export function OfflineBanner() {
  const { isOnline, queueSize, isSyncing, syncNow } = useOnlineStatus();

  // Hide when connected with nothing pending and not currently syncing
  if (isOnline && !isSyncing && queueSize === 0) {
    return null;
  }

  let message = "";
  let pillClass = styles.offline;

  if (isSyncing) {
    pillClass = styles.syncing;
    message = `🔄 Syncing ${queueSize} offline action${queueSize === 1 ? "" : "s"}...`;
  } else if (!isOnline) {
    pillClass = styles.offline;
    message = "⚡ Offline Mode — Changes will sync when reconnected";
  } else {
    pillClass = styles.pending;
    message = `⚡ ${queueSize} offline action${queueSize === 1 ? "" : "s"} pending sync`;
  }

  return (
    <div className={styles.bannerWrapper} role="status" aria-live="polite">
      <div className={`${styles.pill} ${pillClass}`}>
        <span className={styles.message}>{message}</span>
        <button
          type="button"
          className={styles.syncBtn}
          onClick={() => {
            void syncNow();
          }}
          disabled={isSyncing}
          title="Attempt to synchronize queued actions now"
        >
          {isSyncing ? (
            <>
              <span className={styles.spin}>🔄</span> Syncing...
            </>
          ) : (
            "Sync Now"
          )}
        </button>
      </div>
    </div>
  );
}
