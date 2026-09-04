/* Account deletion — the right to erasure, implemented.
 *
 * `api/auth.ts`'s `deleteAccount()` has been POSTing to this endpoint since
 * the React port, but the function did not exist in this repository. The
 * Settings button therefore failed for every user who pressed it. This is
 * that missing half.
 *
 * Two things make it a privileged function rather than a client-side delete:
 *
 *  1. Deleting the row in `auth.users` needs the service-role key, which can
 *     never be shipped to a browser. RLS lets a user delete their own *data*,
 *     but the auth record is Supabase's, not ours.
 *  2. Deleting the auth user is what triggers the ON DELETE CASCADE across
 *     every user-owned table, so one privileged delete does the whole erasure
 *     atomically rather than the client racing through twenty tables and
 *     stopping halfway on a network blip.
 *
 * Re-authentication is required. The caller's JWT proves who they are, but a
 * live session is not proof that the *person* at the keyboard is the account
 * holder — an unlocked laptop is enough. For an irreversible, legally
 * significant action the password is checked immediately before the delete,
 * which is the same standard Supabase applies to changing an email.
 *
 * Deploy:
 *   supabase functions deploy delete-account
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
 * the platform; no secrets to set. Requires migration
 * 20260904000000_cascade_delete_user_account.sql to have been applied, or the
 * delete fails on a foreign-key violation from tasks/exams.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://learnora.app",
  "https://www.learnora.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

function allowedOrigins(): string[] {
  const configured = Deno.env.get("ALLOWED_ORIGINS");
  return configured
    ? configured.split(",").map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
}

/* Same shape as the other functions: the CORS allowlist is convenience for
   browsers, not the security boundary. The JWT gate below is. */
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = allowedOrigins();
  const ok =
    allowed.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    Vary: "Origin",
  };
}

function json(
  body: unknown,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  /* DELETE is the semantically correct verb and what a caller would reach
     for; POST is what the existing client sends. Both are accepted so this
     is not a breaking change for a deployed build. */
  if (req.method !== "POST" && req.method !== "DELETE") {
    return json({ error: "Method not allowed." }, 405, cors);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    console.error("[delete-account] Missing platform environment variables.");
    return json({ error: "Account deletion is not configured." }, 503, cors);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return json({ error: "Not signed in." }, 401, cors);
  }

  /* Who is asking. Verified against the auth server rather than decoded
     locally, so an expired or revoked token is rejected. */
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return json({ error: "Your session has expired. Sign in again." }, 401, cors);
  }

  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    /* No body at all — handled by the check below. */
  }

  /* An OAuth-only account has no password to check. Supabase records the
     providers on the identity list; when "email" is absent there is nothing
     to re-authenticate against, and demanding a password the user has never
     set would lock them out of erasing their own data — which is the exact
     right this endpoint exists to serve. The JWT plus the client's explicit
     confirmation stands as the check in that case. */
  const identities = user.identities ?? [];
  const hasPassword =
    identities.length === 0 || identities.some((i) => i.provider === "email");

  if (hasPassword) {
    if (!password) {
      return json(
        { error: "Enter your password to confirm.", passwordRequired: true },
        400,
        cors,
      );
    }
    if (!user.email) {
      return json({ error: "This account has no email to verify." }, 400, cors);
    }

    /* Re-authenticate with the anon key, exactly as a sign-in would. A wrong
       password must not be distinguishable from any other failure in timing
       or message beyond "that password is wrong". */
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await authClient.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (signInError) {
      console.warn("[delete-account] Re-authentication failed", {
        userId: user.id,
      });
      return json({ error: "That password is not correct." }, 401, cors);
    }
  }

  /* The delete. Every user-owned table cascades from auth.users, so this one
     statement removes the account and all its data together — no partial
     erasure if the connection drops mid-way, which a table-by-table client
     loop could not promise. */
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    /* A foreign-key violation here means some table still references
       auth.users without ON DELETE CASCADE — see the migration alongside this
       function. Logged loudly because it means erasure is silently failing,
       which is a compliance problem, not just a bug. */
    console.error("[delete-account] Delete failed", {
      userId: user.id,
      message: deleteError.message,
    });
    return json(
      { error: "Could not delete the account. Please contact support." },
      500,
      cors,
    );
  }

  console.info("[delete-account] Account deleted", { userId: user.id });
  return json({ message: "Account deleted" }, 200, cors);
});
