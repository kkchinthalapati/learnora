import { useEffect, useRef } from "react";
import { useSettings } from "../context/settings";
import { useStudySchedule } from "./useStudySchedule";
import {
  BLOCK_LEAD_MINS,
  notifyBlockStarting,
  shouldNotifyBlock,
} from "../lib/notifications";

/* The nudge that makes the schedule real.
 *
 * A plan a student has to remember to look at is a plan they stop looking at.
 * This watches today's blocks and announces each one a few minutes before it
 * starts — the difference between "I have a study plan somewhere" and "it is
 * twenty to seven and my phone just told me what I decided to do at quarter
 * to".
 *
 * Deliberately in-tab only. Real web push already exists in this app
 * (`lib/push.ts` plus the `send-push-reminders` edge function), and moving
 * these reminders there is the right next step — but that function runs on a
 * server that cannot see this schedule, because the life context it is built
 * from never leaves the device. Closing that gap means either syncing the
 * schedule server-side or scheduling the pushes from the client; both are real
 * decisions, and shipping an in-tab reminder now is honest about which one has
 * been made.
 *
 * The interval is one minute because that is the resolution of the thing being
 * watched. Anything faster burns battery to re-check a number that changes
 * sixty times an hour. */

const CHECK_INTERVAL_MS = 60_000;

export function useBlockReminders(): void {
  const { settings } = useSettings();
  const { today } = useStudySchedule();

  /* A "latest ref" so the interval is installed once and never restarts. The
     schedule object is rebuilt whenever any of its queries settle; an effect
     that depended on it directly would tear down and re-create the timer, and
     a reminder due at 18:55 would be pushed past its own window by a refetch
     at 18:54 — the same class of self-cancelling-timer bug useExamProctor was
     fixed for. */
  const latest = useRef({ today, enabled: settings.notifyStudyReminders });
  latest.current = { today, enabled: settings.notifyStudyReminders };

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const { today: blocks, enabled } = latest.current;
      for (const block of blocks) {
        if (shouldNotifyBlock(block, enabled, nowMin)) {
          notifyBlockStarting(block);
          /* One announcement per pass. Two blocks cannot start within the same
             lead window unless the schedule is degenerate, and stacking
             notifications is how an app teaches someone to dismiss them. */
          break;
        }
      }
    };

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}

export { BLOCK_LEAD_MINS };
