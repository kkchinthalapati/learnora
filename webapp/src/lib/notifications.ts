import { Storage } from "./storage";

/* Ports `notifyDueCardsOncePerDay` (js/main.js:2241-2256) — a browser
 * `Notification` when flashcards are due, gated on the `notifyStudyReminders`
 * setting and fired at most once per calendar day. Named in the ledger's
 * loose ends since Step 12 as never carried over; closed here. */

const NOTIFIED_DATE_KEY = "srs_notified_date";

/** The decision half, pure and testable without a `Notification` global. */
export function shouldNotifyDueCards(
  count: number,
  enabled: boolean,
  now = new Date(),
): boolean {
  if (!enabled || count <= 0) return false;
  return Storage.get<string>(NOTIFIED_DATE_KEY) !== now.toDateString();
}

/** The effectful half — call only after `shouldNotifyDueCards` is true. */
export function notifyDueCardsOncePerDay(count: number, now = new Date()): void {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("Learnora", {
      body: `${count} flashcard${count > 1 ? "s" : ""} due for review today.`,
      icon: "learnora.jpg",
    });
    Storage.set(NOTIFIED_DATE_KEY, now.toDateString());
  } else if (Notification.permission !== "denied") {
    void Notification.requestPermission();
  }
}
