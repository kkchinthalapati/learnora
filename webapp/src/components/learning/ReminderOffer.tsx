import { useEffect, useState } from "react";
import { Button } from "../Button";
import { emailNotificationsApi } from "../../api/emailNotifications";
import { usePush } from "../../hooks/usePush";
import { isPushSupported } from "../../lib/push";
import { Storage } from "../../lib/storage";
import styles from "./reminderOffer.module.css";

/* "Want a nudge when it's due?", asked once something is due to come back.
 *
 * Spacing only works if the student is there on the day: cards come back on
 * schedule, and a re-taught mix-up gets a check on a new question two days
 * later. Reminders existed, but only behind Settings ▸ Notifications, and on
 * 2026-11-05 no account had turned push on and no reminder email had ever
 * been sent; no student had used the app on a second day in two weeks. This
 * asks at the two moments a reminder is obviously useful (the first lesson's
 * win, and the end of a Study session), says what it will remind them of,
 * and takes no for an answer for a fortnight.
 *
 * Push is offered where the browser can take it. Email only when
 * VITE_EMAIL_REMINDERS says the sending side is configured, so the prompt
 * never promises an email that cannot arrive. Either one turns on the daily
 * review reminder (cards and check-backs, supabase/functions/_shared/
 * reviewNudge.js) and nothing else new. */

export const REMINDER_OFFER_KEY = "learnora_reminder_offer_v1";
const SNOOZE_DAYS = 14;

type Choice = "pushed" | "emailed" | null;

function snoozed(now = Date.now()): boolean {
  const until = Storage.get<number>(REMINDER_OFFER_KEY);
  return typeof until === "number" && until > now;
}

export function ReminderOffer({ lead }: {
  /** One sentence on what comes back and when, e.g. "These cards come back
   *  tomorrow, before they fade." */
  lead: string;
}) {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  const emailOffered = import.meta.env.VITE_EMAIL_REMINDERS === "true";
  const pushOffered =
    isPushSupported() &&
    !!vapidKey &&
    typeof Notification !== "undefined" &&
    Notification.permission !== "denied";
  const push = usePush({ listDevices: false });
  const [hidden, setHidden] = useState(() => snoozed());
  const [emailOn, setEmailOn] = useState<boolean | null>(emailOffered ? null : false);
  const [choice, setChoice] = useState<Choice>(null);
  const [askedPush, setAskedPush] = useState(false);
  const [emailPending, setEmailPending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (!emailOffered) return;
    let cancelled = false;
    emailNotificationsApi
      .peek()
      .then((prefs) => {
        if (!cancelled) setEmailOn(!!prefs?.notifyFlashcardsDue);
      })
      .catch(() => {
        if (!cancelled) setEmailOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [emailOffered]);

  // The subscription lands asynchronously, after the permission prompt.
  useEffect(() => {
    if (askedPush && push.status === "subscribed") setChoice("pushed");
  }, [askedPush, push.status]);

  if (choice) {
    return (
      <div className={styles.offer} role="status">
        <p className={styles.title}>
          {choice === "pushed" ? "Reminders are on for this device." : "We'll email you."}
        </p>
        <p className={styles.body}>
          Once a day, only when something is due. Change it any time in Settings ▸ Notifications.
        </p>
      </div>
    );
  }

  const pushReady = pushOffered && push.status === "unsubscribed";
  const emailReady = emailOffered && emailOn === false;
  const stillChecking =
    (pushOffered && push.status === "checking") || (emailOffered && emailOn === null);
  const alreadyOn = push.status === "subscribed" || emailOn === true;
  if (hidden || stillChecking || alreadyOn || (!pushReady && !emailReady)) return null;

  const snooze = () => {
    Storage.set(REMINDER_OFFER_KEY, Date.now() + SNOOZE_DAYS * 86_400_000);
    setHidden(true);
  };

  const turnOnPush = () => {
    setAskedPush(true);
    void push.enable(vapidKey as string);
  };

  const turnOnEmail = async () => {
    setEmailPending(true);
    setEmailError(null);
    try {
      await emailNotificationsApi.optInToReview();
      setChoice("emailed");
    } catch {
      setEmailError("That didn't save. Try again, or turn it on in Settings ▸ Notifications.");
    } finally {
      setEmailPending(false);
    }
  };

  const pushFailed = askedPush && !!push.error;

  return (
    <section className={styles.offer} aria-labelledby="reminder-offer-title">
      <p id="reminder-offer-title" className={styles.title}>
        Want a nudge when it's due?
      </p>
      <p className={styles.body}>
        {lead} Spacing only works if you're here that day: one reminder a day, only when
        something is due.
      </p>
      <div className={styles.actions}>
        {pushReady ? (
          <Button variant="primary" size="sm" busy={push.pending} onClick={turnOnPush}>
            Remind me on this device
          </Button>
        ) : null}
        {emailReady ? (
          <Button
            variant={pushReady ? "secondary" : "primary"}
            size="sm"
            busy={emailPending}
            onClick={() => void turnOnEmail()}
          >
            Email me
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={snooze}>
          Not now
        </Button>
      </div>
      {emailError || pushFailed ? (
        <p className={styles.error} role="alert">
          {emailError ??
            "Notifications didn't turn on. If your browser asked, allow them for this site, then try again."}
        </p>
      ) : null}
    </section>
  );
}
