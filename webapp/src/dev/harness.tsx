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
  /* The harness account is freshly created on every load, which OnboardingGate
     would read as a brand new student and redirect to /welcome — so the
     fixtures would never be visible. Marking it onboarded keeps the harness
     landing where it always did; the wizard itself is still reachable at
     ?route=/welcome (or ?route=/welcome%3Freplay=1 to see it pre-filled). */
  user_metadata: {
    full_name: "Harness Student",
    onboarding: {
      version: 1,
      goal: "university",
      focusAreas: ["deadlines", "planning", "recall"],
      coachStyle: "tutor",
      detail: "medium",
      studyTime: "steady",
      weekdayCapacityMins: 120,
      completedAt: "2026-01-01T00:00:00.000Z",
      skipped: false,
    },
  },
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
  learning_events: [],
  quizzes: fx.quizzes,
  quiz_attempts: fx.quizAttempts,
  weekly_plans: fx.plans,
  notebooks: fx.notebooks,
  misconceptions: fx.misconceptions,
  misconception_observations: fx.misconceptionObservations,
  question_bank: fx.questionBank,
  profiles: [
    {
      id: fx.USER_ID,
      life_context: null,
      life_context_updated_at: null,
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

/** The reply as server-sent events, a few characters at a time, ending with
 *  the closing event — the same wire format learnora-ai streams. */
function sseReply(text: string): Response {
  const enc = new TextEncoder();
  const pieces = text.match(/[\s\S]{1,18}/g) ?? [];
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const piece of pieces) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: piece })}\n\n`));
        await new Promise((r) => setTimeout(r, 35));
      }
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, modelUsed: "harness" })}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

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

    /* edge function — the harness has no model behind it, so every mode
       answers with something shaped like a real reply. A diagram request
       gets a real drawing back, which is the only way to look at how one
       renders without a live key. */
    if (path.startsWith("/functions/v1/learnora-ai")) {
      let prompt = "";
      try {
        const raw =
          init?.body ??
          (input instanceof Request ? await input.clone().text() : "");
        prompt = typeof raw === "string" ? raw : "";
      } catch {
        /* an unreadable body just means the generic reply below */
      }
      /* Typing "openui demo" returns one of every card, so the Ask drawer's
         OpenUI rendering can be looked at without a live model. */
      /* A streamed request gets the reply as server-sent events, a few
         characters at a time, so the progressive display can be looked at. */
      if (/"stream":\s*true/.test(prompt) && /openui demo/i.test(prompt)) {
        return sseReply(fx.sampleOpenUiReply);
      }
      /* Talk past you out of it: the next scripted line, by how many
         arguments the student has sent so far. */
      if (/Talk past you out of it/.test(prompt)) {
        const sent = Math.max(0, (prompt.match(/"role":"user"/g) ?? []).length - 1);
        const line = fx.pastYouScript[Math.min(sent, fx.pastYouScript.length - 1)];
        await new Promise((r) => setTimeout(r, 900));
        return json({ text: JSON.stringify(line) });
      }
      /* Mark my answer: a scripted marking of the first two scheme points,
         one earned with the student's words, one missed, and a belief. */
      if (/Mark my answer/.test(prompt)) {
        await new Promise((r) => setTimeout(r, 900));
        return json({
          text: JSON.stringify({
            legible: true,
            unreadable: "",
            points: [
              { index: 0, awarded: true, evidence: "the water moves into the cell by osmosis", note: "" },
              { index: 1, awarded: false, evidence: "", note: "Doesn't say which way the water moves" },
            ],
            beliefs: [{ concept: "Osmosis", belief: "Thinks the salt moves into the cell", quote: "the salt goes into the cell" }],
          }),
        });
      }
      if (/openui demo|Build the study guide/i.test(prompt)) {
        return json({ text: fx.sampleOpenUiReply });
      }
      if (/diagram|draw|sketch|\bsvg\b/i.test(prompt)) {
        return json({
          text: `Here is the whole set on one circle.\n\n\`\`\`svg\n${fx.sampleDiagramSvg}\n\`\`\`\n\nNotice that the angle at the centre (2x) is always double the angle at the circumference (x) standing on the same arc.`,
        });
      }
      return json({
        text: "This is the harness talking — there is no model behind it. Ask for a diagram to see one drawn.",
      });
    }

    /* rpc */
    if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.slice("/rest/v1/rpc/".length);
      return json(RPCS[name] ?? null);
    }

    /* tables */
    if (path.startsWith("/rest/v1/")) {
      const table = path.slice("/rest/v1/".length);
      const allRows = TABLES[table] ?? [];
      /* Simple `col=eq.value` filters on reads, so a page that looks one row
         up by id (`.eq("id", x).maybeSingle()`) gets that row and not the
         whole table — supabase-js rejects a list of several there. user_id
         is skipped: fixtures don't always carry it. Writes still echo. */
      const eqFilters = [...new URL(url).searchParams.entries()].filter(
        ([col, value]) => col !== "user_id" && value.startsWith("eq."),
      );
      const rows =
        method === "GET" || method === "HEAD"
          ? allRows.filter((row) =>
              eqFilters.every(
                ([col, value]) =>
                  !(col in (row as object)) ||
                  String((row as Record<string, unknown>)[col]) === decodeURIComponent(value.slice(3)),
              ),
            )
          : allRows;

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
        if (table === "learning_events" && method === "POST") {
          for (const row of echoed) {
            if (
              !rows.some(
                (existing) =>
                  (existing as { client_id?: string }).client_id ===
                  row.client_id,
              )
            ) {
              rows.push({ id: `harness-event-${rows.length}`, ...row });
            }
          }
        }
        return json(
          echoed.map((row, i) => ({
            id: `harness-${Date.now()}-${i}`,
            user_id: fx.USER_ID,
            created_at: new Date().toISOString(),
            ...(row as object),
          })),
        );
      }

      /* `.single()`/`.maybeSingle()` ask PostgREST for an object rather than
         a list, via the Accept header. Answering with the array anyway is
         what left the notebook studio on "Notebook not found". */
      /* supabase-js passes a Headers instance, not a plain object, so the
         header is read through Headers either way. */
      const accept =
        new Headers(init?.headers).get("accept") ??
        (input instanceof Request ? (input.headers.get("accept") ?? "") : "");
      if (accept.includes("vnd.pgrst.object+json")) {
        return json(rows[0] ?? null);
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
