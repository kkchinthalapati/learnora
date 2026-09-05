/* Scheduled job: sends email reminders for exams coming up soon and
 * flashcards due for review. Same shape as ../send-push-reminders — this is
 * the channel that reaches a student who has never subscribed to push (which
 * is everyone who hasn't installed the PWA and clicked "Enable"), since an
 * email address exists on every account from signup, with no opt-in gesture
 * beyond a settings toggle.
 *
 * Like send-push-reminders, this runs on a cron trigger with no caller
 * session — it authenticates with a shared secret (CRON_SECRET) and reads
 * with the service role key. See ../../../EMAIL_NOTIFICATIONS.md for the
 * deploy story (Resend API key, secrets, scheduling) — none of that is done
 * by this file or by deploying it.
 *
 * Resend over a client library: its API is one POST with a JSON body and a
 * bearer token, so `fetch` is the whole integration — no SDK, no dependency
 * to pin, no Node-compat shim needed the way send-push-reminders needs one
 * for `npm:web-push`. Swapping providers later means changing sendEmail()
 * and nothing else in this file. */
import { createClient } from "npm:@supabase/supabase-js@2";

interface EmailPrefRow {
  user_id: string;
  notify_exams: boolean;
  notify_flashcards_due: boolean;
}

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

/* Same known limitation as send-push-reminders: no stored per-user timezone,
 * so "exam tomorrow" and the daily cron time are both computed in UTC. */

async function sendEmail(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  return res.ok;
}

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

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress = Deno.env.get("EMAIL_FROM") || "Learnora <notifications@learnora.app>";
  if (!resendApiKey) {
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: prefRows, error: prefError } = await supabase
    .from("email_notification_prefs")
    .select("user_id, notify_exams, notify_flashcards_due");
  if (prefError) {
    return new Response(JSON.stringify({ error: prefError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const prefs = (prefRows ?? []) as EmailPrefRow[];
  if (prefs.length === 0) {
    return new Response(JSON.stringify({ sent: 0, note: "no preferences rows" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  const prefByUser = new Map(prefs.map((p) => [p.user_id, p]));

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", prefs.map((p) => p.user_id));
  const profileByUser = new Map(
    (profileRows ?? []).map((p) => [p.id as string, p as { email: string | null; full_name: string | null }]),
  );

  const today = todayUtcStr();
  const tomorrow = todayUtcStr(1);
  const sentDate = today;

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

  const { data: dueRows } = await supabase
    .from("flashcards")
    .select("user_id, next_review_date")
    .or(`next_review_date.is.null,next_review_date.lte.${new Date().toISOString()}`);

  const dueCountByUser = new Map<string, number>();
  for (const row of dueRows ?? []) {
    dueCountByUser.set(row.user_id, (dueCountByUser.get(row.user_id) ?? 0) + 1);
  }

  let sent = 0;
  let skippedAlreadyNotified = 0;
  let skippedNoEmail = 0;

  async function sendToUser(
    userId: string,
    kind: "exam_soon" | "flashcards_due",
    wantsThisKind: (p: EmailPrefRow) => boolean,
    subject: string,
    html: string,
  ) {
    const pref = prefByUser.get(userId);
    if (!pref || !wantsThisKind(pref)) return;

    const profile = profileByUser.get(userId);
    if (!profile?.email) {
      skippedNoEmail += 1;
      return;
    }

    // Insert-first dedupe, same reasoning as push_notification_log: a
    // unique-violation means this kind was already sent today, so this run
    // skips rather than racing a concurrent one.
    const { error: logError } = await supabase
      .from("email_notification_log")
      .insert({ user_id: userId, kind, sent_date: sentDate });
    if (logError) {
      skippedAlreadyNotified += 1;
      return;
    }

    const ok = await sendEmail(resendApiKey, fromAddress, profile.email, subject, html);
    if (ok) sent += 1;
  }

  for (const [userId, info] of examsByUser) {
    const subject =
      info.count > 1 ? `${info.count} exams coming up` : "Exam coming up";
    const body =
      info.count > 1
        ? `${info.nearest} and ${info.count - 1} more in the next day.`
        : `${info.nearest} is today or tomorrow.`;
    await sendToUser(
      userId,
      "exam_soon",
      (p) => p.notify_exams,
      subject,
      `<p>${body}</p><p><a href="https://learnora.app/app/exams">Open your exams</a></p>`,
    );
  }

  for (const [userId, count] of dueCountByUser) {
    if (count === 0) continue;
    await sendToUser(
      userId,
      "flashcards_due",
      (p) => p.notify_flashcards_due,
      `${count} flashcard${count > 1 ? "s" : ""} due`,
      `<p>Time for a quick review round — ${count} card${count > 1 ? "s are" : " is"} due.</p><p><a href="https://learnora.app/app/review">Start reviewing</a></p>`,
    );
  }

  return new Response(
    JSON.stringify({ sent, skippedAlreadyNotified, skippedNoEmail }),
    { headers: { "Content-Type": "application/json" } },
  );
});
