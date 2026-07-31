import { formatFocusTime } from "./analytics";
import { useLocalSessions } from "./useLocalSessions";
import styles from "./dashboard.module.css";

const MAX_VISIBLE = 8;

/* "Recent focus sessions" — ports js/main.js:1937-1963. Only the most recent
 * handful render; the full history stays in storage, same as the vanilla. */
export function SessionHistoryCard() {
  const sessions = useLocalSessions();

  return (
    <div className={styles.historyCard}>
      <h2>Recent focus sessions</h2>
      <p className={styles.sub}>
        Every completed focus block is logged here automatically.
      </p>
      <ul className={styles.logList}>
        {sessions.length === 0 ? (
          <li className={styles.emptySm}>
            No sessions yet — start a focus block to see it here.
          </li>
        ) : (
          sessions.slice(0, MAX_VISIBLE).map((log) => (
            <li key={log.id} className={styles.logItem}>
              <span>
                <strong className={styles.logMinutes}>
                  {formatFocusTime(log.minutes)} Focus
                </strong>
                {log.task !== "General Study" ? ` on ${log.task}` : ""}
              </span>
              <span className={styles.logTimestamp}>{log.timestamp}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
