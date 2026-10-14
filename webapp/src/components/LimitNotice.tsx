import { Link } from "react-router";
import { limitState } from "../lib/readiness";
import type { QuotaUsage } from "../lib/entitlements";
import { newSessionHref } from "../lib/sessionModes";
import styles from "./LimitNotice.module.css";

/* A heads-up before a session starts, never during one (2026-10 revamp,
 * Screens "Limits"). Silent until two goes or fewer are left. A started
 * session always completes — the edge function bills a session once — so the
 * last go says the whole session is covered. When none are left, the free
 * options come first and the upgrade is one underlined link to /upgrade,
 * never a modal. Warning colour is for exactly this: a heads-up before a
 * limit. */
export function LimitNotice({
  usage,
  toolName,
}: {
  usage: QuotaUsage | null;
  /** "Explain sessions", from lib/entitlements AI_TOOLS. */
  toolName: string;
}) {
  const state = limitState(usage);
  if (state === "none" || !usage) return null;
  const free = (
    <Link
      to={newSessionHref("recall", { minutes: 10 })}
      className={styles.link}
    >
      Use cards instead (free)
    </Link>
  );
  if (state === "out") {
    return (
      <div className={styles.notice} data-state="out" role="note">
        <p className={styles.text}>
          You’ve used today’s {toolName.toLowerCase()}. They come back tomorrow.
          Cards and bank questions are always free.
        </p>
        <p className={styles.actions}>
          {free}
          <Link to="/upgrade" className={styles.upgrade}>
            See plans
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className={styles.notice} role="note">
      <p className={styles.text}>
        {state === "last"
          ? "This uses your last tutor go for today. The whole session is covered."
          : `Uses 1 tutor go · ${usage.remaining} left today`}
      </p>
      <p className={styles.actions}>{free}</p>
    </div>
  );
}
