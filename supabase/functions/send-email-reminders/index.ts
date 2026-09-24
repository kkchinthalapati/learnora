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
 * Two ways to send, picked by which secrets are set (see pickMailer):
 *  - Resend (RESEND_API_KEY): the long-term route, once Learnora has its own
 *    verified domain. One POST per email, so `fetch` is the integration.
 *  - SMTP (SMTP_USER + SMTP_PASS, Gmail by default): the bridge until then.
 *    Resend can't send "from" an @gmail.com address — nobody can verify
 *    gmail.com — but Gmail's own server can, with an app password. Port 465,
 *    because Supabase blocks outbound 25 and 587. Capped per run, since a
 *    personal Gmail account allows about 500 messages a day.
 * Setting RESEND_API_KEY later switches over with no code change. */
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

interface Mailer {
  name: "resend" | "smtp";
  /** Most emails one run may send; beyond it the rest wait for tomorrow. */
  limit: number;
  send(to: string, subject: string, html: string): Promise<boolean>;
  close(): Promise<void>;
}

/* Gmail's limit for a personal account is about 500 a day, and running into
 * it can get the account restricted. 400 leaves room for the account
 * owner's own mail. */
const DEFAULT_SMTP_DAILY_CAP = 400;

function pickMailer(): Mailer | null {
  const replyTo = Deno.env.get("EMAIL_REPLY_TO") || undefined;

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (resendApiKey) {
    const from = Deno.env.get("EMAIL_FROM") || "Learnora <notifications@learnora.app>";
    return {
      name: "resend",
      limit: Number.POSITIVE_INFINITY,
      async send(to, subject, html) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to,
            subject,
            html,
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        });
        return res.ok;
      },
      async close() {},
    };
  }

  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  if (user && pass) {
    const client = new SMTPClient({
      connection: {
        hostname: Deno.env.get("SMTP_HOST") || "smtp.gmail.com",
        port: Number(Deno.env.get("SMTP_PORT") || 465),
        tls: true,
        auth: { username: user, password: pass },
      },
    });
    // Gmail rewrites any other From address to the account's own.
    const from = Deno.env.get("EMAIL_FROM") || `Learnora <${user}>`;
    const cap = Number(Deno.env.get("EMAIL_DAILY_CAP") || DEFAULT_SMTP_DAILY_CAP);
    return {
      name: "smtp",
      limit: Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_SMTP_DAILY_CAP,
      async send(to, subject, html) {
        try {
          await client.send({ from, to, subject, html, ...(replyTo ? { replyTo } : {}) });
          return true;
        } catch (err) {
          console.error("smtp send failed", err instanceof Error ? err.message : err);
          return false;
        }
      },
      async close() {
        try {
          await client.close();
        } catch {
          /* Nothing left to send; a failed goodbye is harmless. */
        }
      },
    };
  }

  return null;
}

/* Links in the email. learnora.app isn't live yet, so the default is the
 * address the app is actually served from; APP_URL switches it later. */
const APP_URL = (Deno.env.get("APP_URL") || "https://learnora-app.vercel.app").replace(/\/$/, "");

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

  const picked = pickMailer();
  if (!picked) {
    return new Response(
      JSON.stringify({
        error: "No email provider configured: set RESEND_API_KEY, or SMTP_USER and SMTP_PASS",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  // Named separately so the nested sendToUser keeps the non-null type.
  const mailer: Mailer = picked;

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
    await mailer.close();
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
  let skippedOverCap = 0;

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

    /* Checked before the dedupe row is written, so anyone past the cap is
       still due and gets tomorrow's run. */
    if (sent >= mailer.limit) {
      skippedOverCap += 1;
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

    const ok = await mailer.send(profile.email, subject, html);
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
      `<p>${body}</p><p><a href="${APP_URL}/app/exams">Open your exams</a></p>`,
    );
  }

  for (const [userId, count] of dueCountByUser) {
    if (count === 0) continue;
    await sendToUser(
      userId,
      "flashcards_due",
      (p) => p.notify_flashcards_due,
      `${count} flashcard${count > 1 ? "s" : ""} due`,
      `<p>Time for a quick review round — ${count} card${count > 1 ? "s are" : " is"} due.</p><p><a href="${APP_URL}/app/review">Start reviewing</a></p>`,
    );
  }

  await mailer.close();

  return new Response(
    JSON.stringify({
      provider: mailer.name,
      sent,
      skippedAlreadyNotified,
      skippedNoEmail,
      skippedOverCap,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
