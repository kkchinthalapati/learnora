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

/** The effectful half — call only after `shouldNotifyDueCards` is true.
 *  No `now` parameter: unlike the pure decision half, nothing calls this
 *  with a fixed instant (there's nothing here to unit test against one). */
export function notifyDueCardsOncePerDay(count: number): void {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("Learnora", {
      body: `${count} flashcard${count > 1 ? "s" : ""} due for review today.`,
      icon: "learnora.jpg",
    });
    Storage.set(NOTIFIED_DATE_KEY, new Date().toDateString());
  } else if (Notification.permission !== "denied") {
    void Notification.requestPermission();
  }
}

/* --- Life Sync block reminders ----------------------------------------- */

const BLOCK_NOTIFIED_KEY = "learnora_block_notified";

/** How early a scheduled block is announced. Long enough to put a phone down
 *  and open the right tab, short enough that the nudge is still about *now*. */
export const BLOCK_LEAD_MINS = 5;

/** Should we announce this block yet?
 *
 * A block is announced once, in the window from `BLOCK_LEAD_MINS` before it
 * starts until it starts — not after. A "your 2pm block is starting" that
 * arrives at 3:40 is worse than silence: it is a notification about a plan the
 * student has already visibly failed, which is precisely the feeling this
 * whole feature exists to avoid.
 *
 * Pure, and keyed on the block's own id, so the effectful half below can be a
 * three-line wrapper and every rule here is testable. */
export function shouldNotifyBlock(
  block: { id: string; startMin: number },
  enabled: boolean,
  nowMin: number,
  lastNotifiedId: string | null = Storage.get<string>(BLOCK_NOTIFIED_KEY),
): boolean {
  if (!enabled) return false;
  if (lastNotifiedId === block.id) return false;
  const lead = block.startMin - nowMin;
  return lead <= BLOCK_LEAD_MINS && lead >= 0;
}

/** The effectful half — call only after `shouldNotifyBlock` is true. */
export function notifyBlockStarting(block: {
  id: string;
  label: string;
  startMin: number;
  endMin: number;
}): void {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("Learnora — next block", {
      body: `${block.label} · ${block.endMin - block.startMin} minutes. This is the slot you set aside.`,
      icon: "learnora.jpg",
      tag: "learnora-block",
    });
    Storage.set(BLOCK_NOTIFIED_KEY, block.id);
  } else if (Notification.permission !== "denied") {
    void Notification.requestPermission();
  }
}
