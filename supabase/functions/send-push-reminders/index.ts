/* Scheduled job: sends Web Push notifications for exams coming up soon and
 * flashcards due for review. See ../../../PUSH_NOTIFICATIONS.md for the full
 * deploy story (VAPID keys, secrets, and how to actually put this on a
 * schedule — none of that is done by this file or by deploying it).
 *
 * Not a per-request user call like ../learnora-ai: nothing here runs with a
 * caller's JWT, because there is no caller — a cron trigger invokes this on
 * a timer with no user session at all. It authenticates with a shared
 * secret instead (CRON_SECRET) and reads/writes with the service role key,
 * which is the only way to see every user's push subscriptions in one pass.
 *
 * `npm:web-push`, not `esm.sh` (contrast with learnora-ai's
 * `https://esm.sh/@google/generative-ai`): web-push's Node build reaches for
 * `node:crypto` and `node:https` directly, and esm.sh's browser-targeted
 * transpile doesn't shim those. The `npm:` specifier gives it Deno's actual
 * Node-compat layer instead, which does. */
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  notify_exams: boolean;
  notify_flashcards: boolean;
}

/* Compares the presented secret against the configured one without leaking
 * where they first differ. `===` on strings returns as soon as it finds a
 * mismatched byte, which makes the comparison time a function of how much of
 * the prefix the caller guessed right — the signal a byte-at-a-time forgery
 * attack is built on. This is the only thing standing between an unauthorised
 * caller and a push to every registered device, so it does the full compare
 * either way.
 *
 * Lengths are compared first and non-secretly: that leaks the length of the
 * secret, which is not the part worth protecting, and hashing to a fixed
 * width to avoid it would need a subtle-crypto round trip for no real gain. */
function timingSafeEqual(presented: string | null, expected: string): boolean {
  if (presented === null || presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function todayUtcStr(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/* Every date/count computed here is in UTC — there is no per-user timezone
 * stored anywhere in this schema today (only the friends leaderboard passes
 * one, as an RPC argument the client supplies at call time; nothing persists
 * it). That means "exam tomorrow" and "cards due" can be off by up to a day
 * for a user far from UTC. Documented as a known limitation in
 * PUSH_NOTIFICATIONS.md rather than solved here — solving it means adding a
 * stored timezone column and is a bigger, separate change. */

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || !timingSafeEqual(req.headers.get("x-cron-secret"), cronSecret)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@learnora.app";
  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response(
      JSON.stringify({ error: "VAPID keys are not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: subscriptions, error: subError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, notify_exams, notify_flashcards");
  if (subError) {
    return new Response(JSON.stringify({ error: subError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const subs = (subscriptions ?? []) as PushSubscriptionRow[];
  if (subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0, note: "no subscriptions" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const today = todayUtcStr();
  const tomorrow = todayUtcStr(1);
  const sentDate = today;

  // --- Exam-soon: who has a non-completed exam today or tomorrow? -------
  const { data: examRows } = await supabase
    .from("exams")
    .select("user_id, exam_name, exam_date")
    .neq("status", "Completed")
    .gte("exam_date", today)
    .lte("exam_date", tomorrow);

  const examsByUser = new Map<string, { count: number; nearest: string }>();
  for (const row of examRows ?? []) {
    const existing = examsByUser.get(row.user_id);
    if (!existing) {
      examsByUser.set(row.user_id, { count: 1, nearest: row.exam_name });
    } else {
      existing.count += 1;
    }
  }

  // --- Flashcards due: count per user of cards due now or overdue. -------
  const { data: dueRows } = await supabase
    .from("flashcards")
    .select("user_id, next_review_date")
    .or(`next_review_date.is.null,next_review_date.lte.${new Date().toISOString()}`);

  const dueCountByUser = new Map<string, number>();
  for (const row of dueRows ?? []) {
    dueCountByUser.set(row.user_id, (dueCountByUser.get(row.user_id) ?? 0) + 1);
  }

  const subsByUser = new Map<string, PushSubscriptionRow[]>();
  for (const sub of subs) {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push(sub);
    subsByUser.set(sub.user_id, list);
  }

  let sent = 0;
  let skippedAlreadyNotified = 0;
  const staleEndpoints: string[] = [];

  async function sendToUser(
    userId: string,
    kind: "exam_soon" | "flashcards_due",
    payload: { title: string; body: string; url: string },
    wantsThisKind: (s: PushSubscriptionRow) => boolean,
  ) {
    const targets = (subsByUser.get(userId) ?? []).filter(wantsThisKind);
    if (targets.length === 0) return;

    // Insert-first dedupe: a unique-violation here means another concurrent
    // run (or a previous run today) already sent this, so this run skips
    // sending rather than racing it.
    const { error: logError } = await supabase
      .from("push_notification_log")
      .insert({ user_id: userId, kind, sent_date: sentDate });
    if (logError) {
      skippedAlreadyNotified += 1;
      return;
    }

    await Promise.all(
      targets.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          );
          sent += 1;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            staleEndpoints.push(sub.endpoint);
          }
        }
      }),
    );
  }

  for (const [userId, info] of examsByUser) {
    await sendToUser(
      userId,
      "exam_soon",
      {
        title: info.count > 1 ? `${info.count} exams coming up` : "Exam coming up",
        body:
          info.count > 1
            ? `${info.nearest} and ${info.count - 1} more in the next day.`
            : `${info.nearest} is today or tomorrow.`,
        url: "/app/exams",
      },
      (s) => s.notify_exams,
    );
  }

  for (const [userId, count] of dueCountByUser) {
    if (count === 0) continue;
    await sendToUser(
      userId,
      "flashcards_due",
      {
        title: `${count} flashcard${count > 1 ? "s" : ""} due`,
        body: "Time for a quick review round.",
        url: "/app/review",
      },
      (s) => s.notify_flashcards,
    );
  }

  if (staleEndpoints.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", staleEndpoints);
  }

  return new Response(
    JSON.stringify({
      sent,
      skippedAlreadyNotified,
      staleRemoved: staleEndpoints.length,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
