import { Link, useLocation } from "react-router";
import { Icon } from "./Icon";
import { useOnlineStatus } from "../lib/offlineSync";
import styles from "./OfflineBanner.module.css";

/** "3 reviews", "1 review and 2 changes", "2 changes". Card reviews are named
 *  as such — they are what a student grades offline and waits on. */
function describeQueue(queueSize: number, reviewsQueued: number): string {
  const others = queueSize - reviewsQueued;
  const reviews = `${reviewsQueued} review${reviewsQueued === 1 ? "" : "s"}`;
  const changes = `${others} change${others === 1 ? "" : "s"}`;
  if (reviewsQueued > 0 && others > 0) return `${reviews} and ${changes}`;
  return reviewsQueued > 0 ? reviews : changes;
}

export function OfflineBanner() {
  const { isOnline, queueSize, reviewsQueued, isSyncing, syncNow } =
    useOnlineStatus();
  const { pathname } = useLocation();

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
  const waiting = describeQueue(queueSize, reviewsQueued);

  if (isSyncing) {
    pillClass = styles.syncing;
    icon = "refresh-cw";
    message = `Syncing ${waiting}…`;
  } else if (!isOnline) {
    pillClass = styles.offline;
    icon = "alert-triangle";
    /* Short on purpose: the pill is one line on a phone. Flashcard review is
       the one thing that works offline, so it is the thing named. */
    message =
      queueSize > 0
        ? `Offline · ${waiting} waiting to sync`
        : "Offline · flashcard review still works";
  } else {
    pillClass = styles.pending;
    icon = "clock";
    message = `${waiting} waiting to sync`;
  }

  return (
    <div className={styles.bannerWrapper} role="status" aria-live="polite">
      <div className={`${styles.pill} ${pillClass}`}>
        <Icon name={icon} size={14} aria-hidden />
        <span className={styles.message}>{message}</span>
        {/* Offline, the deck list can't load, so this is the way in: every
            card saved on the device (lib/offlineCards.ts). Not shown on a
            review screen, where it would only restart the session. */}
        {!isOnline && !pathname.startsWith("/review") ? (
          <Link to="/review/daily-drill" className={styles.syncBtn}>
            Review cards
          </Link>
        ) : null}
        {/* Offline, syncing is a no-op that fails the moment it is asked —
            the banner already says the work will sync on reconnect, so the
            button only appears when pressing it can do something. */}
        {isOnline && (
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
                <Icon
                  name="refresh-cw"
                  size={13}
                  className={styles.spin}
                  aria-hidden
                />{" "}
                Syncing…
              </>
            ) : (
              "Sync now"
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/* The pill says "offline"; this says what that means for the page underneath
 * it, which otherwise just sits on its loading placeholders. Not shown on a
 * review screen, the one place that does work offline, nor in a mock exam,
 * which says what offline means for it in its own bar (OfflineTestBar). */
export function OfflinePageNotice() {
  const { isOnline } = useOnlineStatus();
  const { pathname } = useLocation();
  if (isOnline || pathname.startsWith("/review") || pathname.endsWith("/mock-exam")) {
    return null;
  }
  return (
    <p className={styles.pageNotice}>
      You&apos;re offline, so this page can&apos;t load anything new until you reconnect.
      Flashcard review works offline —{" "}
      <Link to="/review/daily-drill">review your saved cards</Link>.
    </p>
  );
}

/* The test runner's own offline bar (2026-09 redesign). In flow and
   persistent rather than a toast: while it shows, Submit is unavailable, and
   the student has to be able to see why. Says what is being kept. */
export function OfflineTestBar() {
  const { isOnline } = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div className={styles.testBar} role="status" aria-live="polite">
      <span className={styles.testDot} aria-hidden="true" />
      You're offline. Answers are being saved on this device. Submit will be
      available again once you reconnect.
    </div>
  );
}
