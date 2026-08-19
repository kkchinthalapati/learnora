/* Dev harness — mounts the real signed-in app against fixture data.
 *
 * Why this exists: every view behind ProtectedRoute has only ever been
 * verified through jsdom unit tests, because looking at it in a browser
 * needs a real Supabase account. This entry fakes the two things a session
 * actually gates — an auth session and the REST responses behind it — so
 * the signed-in UI can be opened, clicked through and screenshotted.
 *
 * Dev-only by construction: Vite's build input is index.html, so nothing
 * here is reachable from a production bundle. Run `npm run dev` and open
 * /app/harness.html (add ?route=/library to land somewhere specific).
 *
 * It is a *look at the UI* tool, not a test double — the interceptor answers
 * the shape of each request, not its filters, so a fixture list comes back
 * whole regardless of the `.eq()` chain that asked for it. Assertions belong
 * in the vitest suite, which mocks at a level that respects them.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import * as fx from "./fixtures";

/* ---------------------------------------------------------------- session */

function fakeJwt(): string {
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  return [
    enc({ alg: "HS256", typ: "JWT" }),
    enc({ sub: fx.USER_ID, role: "authenticated", exp, aud: "authenticated" }),
    "harness-not-a-real-signature",
  ].join(".");
}

const USER = {
  id: fx.USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: fx.USER_EMAIL,
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  app_metadata: { provider: "email" },
  user_metadata: { full_name: "Harness Student" },
  identities: [],
};

function session() {
  const token = fakeJwt();
  return {
    access_token: token,
    refresh_token: "harness-refresh",
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    user: USER,
  };
}

/* ------------------------------------------------------------ interceptor */

/* Table name -> rows. Anything not listed answers with an empty list, which
   is what an untouched feature legitimately looks like. */
const TABLES: Record<string, unknown[]> = {
  tasks: fx.tasks,
  exams: fx.exams,
  folders: fx.folders,
  materials: fx.materials,
  notes: fx.notes,
  flashcard_decks: fx.decks,
  flashcards: fx.flashcards,
  study_sessions: fx.sessions,
  quizzes: fx.quizzes,
  quiz_attempts: fx.quizAttempts,
  weekly_plans: fx.plans,
  profiles: [
    {
      id: fx.USER_ID,
      full_name: "Harness Student",
      friend_code: "HARNESS1",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
  ],
};

const RPCS: Record<string, unknown> = {
  get_friends_leaderboard: fx.leaderboard,
  get_friend_requests: fx.friendRequests,
  regenerate_friend_code: "HARNESS2",
  resolve_friend_code: [{ user_id: "friend-9", full_name: "Jordan Blake" }],
  request_or_accept_friend: "pending",
  respond_to_friend_request: "accepted",
  remove_friend: null,
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

function install(supabaseUrl: string) {
  const real = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (!url.startsWith(supabaseUrl)) return real(input as RequestInfo, init);

    const path = new URL(url).pathname;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    /* auth */
    if (path.startsWith("/auth/v1/user")) return json(USER);
    if (path.startsWith("/auth/v1/token")) return json(session());
    if (path.startsWith("/auth/v1/logout"))
      return new Response(null, { status: 204 });
    if (path.startsWith("/auth/v1/")) return json({});

    /* rpc */
    if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.slice("/rest/v1/rpc/".length);
      return json(RPCS[name] ?? null);
    }

    /* tables */
    if (path.startsWith("/rest/v1/")) {
      const table = path.slice("/rest/v1/".length);
      const rows = TABLES[table] ?? [];

      /* Writes: echo the payload back so optimistic UI settles instead of
         rolling back with an error toast. */
      if (method !== "GET" && method !== "HEAD") {
        let body: unknown = null;
        try {
          const raw =
            init?.body ??
            (input instanceof Request ? await input.clone().text() : null);
          body = typeof raw === "string" ? JSON.parse(raw) : null;
        } catch {
          /* a write with no JSON body is fine — nothing to echo */
        }
        const echoed = Array.isArray(body) ? body : body ? [body] : [];
        return json(
          echoed.map((row, i) => ({
            id: `harness-${Date.now()}-${i}`,
            user_id: fx.USER_ID,
            created_at: new Date().toISOString(),
            ...(row as object),
          })),
        );
      }

      /* `count: "exact", head: true` reads the count out of content-range. */
      const wantsCount = /count=exact/.test(
        (init?.headers as Record<string, string>)?.Prefer ??
          (input instanceof Request ? (input.headers.get("prefer") ?? "") : ""),
      );
      const headers: Record<string, string> = wantsCount
        ? {
            "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
          }
        : {};

      if (method === "HEAD")
        return new Response(null, { status: 200, headers });
      return json(rows, { headers });
    }

    return real(input as RequestInfo, init);
  };
}

/* ------------------------------------------------------------------- boot */

async function boot() {
  const { SUPABASE_URL, supabase } = await import("../lib/supabase");
  install(SUPABASE_URL);

  const s = session();
  await supabase.auth.setSession({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
  });

  /* The document itself is /app/harness.html, which is not a route — without
     rewriting it the router renders its 404 no matter what. */
  const route = new URLSearchParams(location.search).get("route") ?? "/";
  window.history.replaceState({}, "", `/app${route}`);

  const { default: App } = await import("../App");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
