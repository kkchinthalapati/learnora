import type { Page, Route } from "@playwright/test";

/* A stand-in for the whole Supabase project, served from inside the browser's
 * network layer.
 *
 * `src/lib/supabase.ts` hard-codes one project URL and every call the app
 * makes goes through it — PostgREST tables, GoTrue auth, and the three edge
 * functions. That single origin is what makes this possible: one `page.route`
 * glob catches the entire backend, so a test can seed rows, make the server
 * answer 429 or 500, or stall a response forever, without a network and
 * without touching the real project.
 *
 * The safety property matters as much as the convenience: nothing under this
 * origin is ever allowed to `continue()`. An endpoint this file does not
 * recognise is answered with an empty result and recorded, never forwarded, so
 * a test can never quietly write a row into production.
 *
 * What is implemented is the subset of PostgREST the app actually uses —
 * eq/gte/lte/in/is filters, order, limit, exact counts via HEAD, and the
 * `vnd.pgrst.object+json` single-row shape. Anything beyond that is a
 * deliberate omission rather than an oversight; add to it when a feature needs
 * it, and keep it honest about what it can answer.
 */

export const SUPABASE_URL = "https://mlvgqwqiynpwpwzqufdf.supabase.co";
const SUPABASE_GLOB = "**/mlvgqwqiynpwpwzqufdf.supabase.co/**";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

/** Free plan's daily AI allowance — mirrors QUOTAS in src/lib/entitlements.ts.
 *  The mocked edge function enforces it the way the real one does, by counting
 *  rows in `ai_request_log`, so the limit is observed rather than asserted. */
export const FREE_DAILY_AI_LIMIT = 25;
export const PRO_DAILY_AI_LIMIT = 400;

export type Row = Record<string, unknown>;

export interface SeedUser {
  id?: string;
  email?: string;
  fullName?: string;
  plan?: "free" | "pro";
  planStatus?: "active" | "trialing" | "past_due" | "canceled" | "none";
  cancelAtPeriodEnd?: boolean;
  renewsAt?: string | null;
}

interface HandlerContext {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  route: Route;
}

type Handler = (ctx: HandlerContext) => Promise<boolean> | boolean;

function json(route: Route, status: number, body: unknown, headers: Record<string, string> = {}) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `gen-${idCounter.toString().padStart(4, "0")}`;
}

/** Coerce a PostgREST filter operand ("eq.abc", "gte.2026-01-01") into a
 *  comparable JS value. Everything arrives as a string on the wire; numbers
 *  and booleans have to come back so `score >= 5` compares the way the caller
 *  meant it. */
function coerce(raw: string): unknown {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

function compare(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function matchesFilter(row: Row, column: string, expression: string): boolean {
  const [op, ...rest] = expression.split(".");
  const operand = rest.join(".");
  const value = row[column];

  switch (op) {
    case "eq":
      return String(value) === String(coerce(operand));
    case "neq":
      return String(value) !== String(coerce(operand));
    case "gt":
      return compare(value, coerce(operand)) > 0;
    case "gte":
      return compare(value, coerce(operand)) >= 0;
    case "lt":
      return compare(value, coerce(operand)) < 0;
    case "lte":
      return compare(value, coerce(operand)) <= 0;
    case "is":
      return operand === "null" ? value == null : value === coerce(operand);
    case "in": {
      const list = operand
        .replace(/^\(|\)$/g, "")
        .split(",")
        .map((entry) => entry.replace(/^"|"$/g, ""));
      return list.some((entry) => String(entry) === String(value));
    }
    case "like":
    case "ilike": {
      const pattern = operand.replace(/\*/g, "").replace(/%/g, "").toLowerCase();
      return String(value ?? "").toLowerCase().includes(pattern);
    }
    default:
      // An operator this mock doesn't model must not silently drop rows.
      return true;
  }
}

/* PostgREST reserves these query params; everything else is a column filter. */
const RESERVED_PARAMS = new Set([
  "select",
  "order",
  "limit",
  "offset",
  "on_conflict",
  "columns",
]);

export class MockBackend {
  readonly tables = new Map<string, Row[]>();
  /** Every request that reached the backend, in order. Tests assert on this
   *  when the interesting part is what the app *sent*, not what it drew. */
  readonly calls: { method: string; path: string; body: unknown }[] = [];
  /** Endpoints hit that this mock does not model — surfaced by
   *  `assertNoUnhandledCalls()` so a silently-empty screen is a failure rather
   *  than a mystery. */
  readonly unhandled: string[] = [];

  user: Required<Omit<SeedUser, "renewsAt">> & { renewsAt: string | null } = {
    id: TEST_USER_ID,
    email: "free@test.com",
    fullName: "Ada Lovelace",
    plan: "free",
    planStatus: "none",
    cancelAtPeriodEnd: false,
    renewsAt: null,
  };

  /** Per-test overrides, consulted before the built-in handlers. Each returns
   *  true once it has answered the route. */
  private readonly overrides: Handler[] = [];

  /** Password the mocked GoTrue accepts. Anything else is 400, exactly as a
   *  real wrong password is. */
  password = "correct-horse-battery";

  /** Flipped by tests that need a signed-in session to go stale mid-run. */
  sessionRevoked = false;

  constructor(seed: SeedUser = {}) {
    Object.assign(this.user, seed);
    this.resetTables();
  }

  /* ---------------------------------------------------------------- data */

  resetTables(): void {
    this.tables.clear();
    for (const name of [
      "profiles",
      "tasks",
      "exams",
      "folders",
      "materials",
      "notes",
      "quizzes",
      "quiz_attempts",
      "flashcards",
      "flashcard_decks",
      "study_sessions",
      "weekly_plans",
      "ai_request_log",
      "notebooks",
      "friendships",
      "push_subscriptions",
    ]) {
      this.tables.set(name, []);
    }
    this.tables.set("profiles", [this.profileRow()]);
  }

  private profileRow(): Row {
    return {
      id: this.user.id,
      email: this.user.email,
      full_name: this.user.fullName,
      avatar_url: null,
      timezone: "UTC",
      consent_given: true,
      plan: this.user.plan,
      plan_status: this.user.planStatus,
      plan_renews_at: this.user.renewsAt,
      plan_cancel_at_period_end: this.user.cancelAtPeriodEnd,
      updated_at: nowIso(),
    };
  }

  table(name: string): Row[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }

  seed(name: string, rows: Row[]): this {
    this.table(name).push(...rows.map((row) => ({ user_id: this.user.id, ...row })));
    return this;
  }

  setPlan(plan: "free" | "pro", extra: Partial<SeedUser> = {}): this {
    this.user.plan = plan;
    this.user.planStatus = extra.planStatus ?? (plan === "pro" ? "active" : "none");
    this.user.cancelAtPeriodEnd = extra.cancelAtPeriodEnd ?? false;
    this.user.renewsAt = extra.renewsAt ?? (plan === "pro" ? "2026-10-04T00:00:00Z" : null);
    this.tables.set("profiles", [this.profileRow()]);
    return this;
  }

  /** How many AI generations today's log holds — the same number the real
   *  edge function counts before deciding whether to refuse. */
  get aiRequestsToday(): number {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    return this.table("ai_request_log").filter(
      (row) => new Date(String(row.created_at)) >= midnight,
    ).length;
  }

  get dailyAiLimit(): number {
    return this.user.plan === "pro" ? PRO_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT;
  }

  /** Pre-spend part of today's allowance, so a test can stand one request away
   *  from the ceiling without making 25 real ones. */
  spendAiRequests(count: number): this {
    for (let i = 0; i < count; i++) {
      this.table("ai_request_log").push({
        id: nextId(),
        user_id: this.user.id,
        created_at: nowIso(),
      });
    }
    return this;
  }

  /* ------------------------------------------------------------ routing */

  /** Add a handler that runs before the built-ins. Return true to claim the
   *  request; return false to fall through. */
  intercept(handler: Handler): this {
    this.overrides.unshift(handler);
    return this;
  }

  /** Convenience for the common case: answer one endpoint with a fixed status
   *  and body. `pathFragment` is matched against the URL path. */
  stub(pathFragment: string, status: number, body: unknown, opts: { times?: number } = {}): this {
    let remaining = opts.times ?? Infinity;
    return this.intercept(async ({ url, route }) => {
      if (remaining <= 0 || !url.pathname.includes(pathFragment)) return false;
      remaining -= 1;
      await json(route, status, body);
      return true;
    });
  }

  /** Never answer — the request hangs until the test tears the page down.
   *  This is what "slow network" means for the UI: not an error, just nothing
   *  coming back, which is the state loading affordances have to survive. */
  stall(pathFragment: string, opts: { times?: number } = {}): this {
    let remaining = opts.times ?? Infinity;
    return this.intercept(({ url }) => {
      if (remaining <= 0 || !url.pathname.includes(pathFragment)) return false;
      remaining -= 1;
      // Deliberately never fulfils, aborts, or continues.
      return true;
    });
  }

  /** Delay an endpoint by `ms` and then let the normal handling run. */
  slow(pathFragment: string, ms: number): this {
    return this.intercept(async ({ url }) => {
      if (!url.pathname.includes(pathFragment)) return false;
      await new Promise((resolve) => setTimeout(resolve, ms));
      return false;
    });
  }

  async install(page: Page): Promise<void> {
    await page.route(SUPABASE_GLOB, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();

      if (method === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
          },
          body: "",
        });
        return;
      }

      let body: unknown = null;
      const raw = request.postData();
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }

      this.calls.push({ method, path: url.pathname + url.search, body });

      const ctx: HandlerContext = {
        url,
        method,
        headers: request.headers(),
        body,
        route,
      };

      for (const handler of this.overrides) {
        if (await handler(ctx)) return;
      }

      if (url.pathname.startsWith("/auth/v1/")) {
        await this.handleAuth(ctx);
        return;
      }
      if (url.pathname.startsWith("/rest/v1/")) {
        await this.handleRest(ctx);
        return;
      }
      if (url.pathname.startsWith("/functions/v1/")) {
        await this.handleFunctions(ctx);
        return;
      }

      this.unhandled.push(`${method} ${url.pathname}`);
      await json(route, 200, []);
    });
  }

  /* --------------------------------------------------------------- auth */

  session(): Row {
    const expiresIn = 3600;
    return {
      access_token: `test-access-token-${Date.now()}`,
      token_type: "bearer",
      expires_in: expiresIn,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      refresh_token: "test-refresh-token",
      user: this.authUser(),
    };
  }

  authUser(): Row {
    return {
      id: this.user.id,
      aud: "authenticated",
      role: "authenticated",
      email: this.user.email,
      email_confirmed_at: "2026-01-01T00:00:00Z",
      confirmed_at: "2026-01-01T00:00:00Z",
      last_sign_in_at: nowIso(),
      phone: "",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {
        full_name: this.user.fullName,
        dob: "2000-01-01",
        consent_given: true,
      },
      identities: [
        {
          id: this.user.id,
          user_id: this.user.id,
          identity_id: this.user.id,
          provider: "email",
          identity_data: { email: this.user.email, sub: this.user.id },
          created_at: "2026-01-01T00:00:00Z",
          last_sign_in_at: nowIso(),
          updated_at: nowIso(),
        },
      ],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: nowIso(),
      is_anonymous: false,
    };
  }

  private async handleAuth(ctx: HandlerContext): Promise<void> {
    const { url, method, route, body } = ctx;
    const endpoint = url.pathname.replace("/auth/v1/", "");
    const payload = (body ?? {}) as Record<string, unknown>;

    if (endpoint === "token") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "refresh_token") {
        if (this.sessionRevoked) {
          await json(route, 400, {
            error: "invalid_grant",
            error_description: "Invalid Refresh Token: Refresh Token Not Found",
          });
          return;
        }
        await json(route, 200, this.session());
        return;
      }
      /* Password grant. A wrong password has to fail the way GoTrue fails —
         400 with this exact code — because api/auth.ts maps the message into
         the "Incorrect email or password" the user sees. */
      if (payload.password !== this.password) {
        await json(route, 400, {
          error: "invalid_grant",
          error_description: "Invalid login credentials",
          msg: "Invalid login credentials",
          message: "Invalid login credentials",
        });
        return;
      }
      this.user.email = String(payload.email ?? this.user.email);
      await json(route, 200, this.session());
      return;
    }

    if (endpoint === "signup") {
      const email = String(payload.email ?? "");
      /* Supabase signals "already registered" by returning a user with an
         empty identities array rather than an error — the app depends on
         spotting that, so the mock has to reproduce it. */
      if (email.startsWith("taken")) {
        await json(route, 200, { user: { ...this.authUser(), identities: [] }, session: null });
        return;
      }
      await json(route, 200, {
        user: { ...this.authUser(), email, identities: [{ id: "identity-1" }] },
        session: null,
      });
      return;
    }

    if (endpoint === "recover") {
      await json(route, 200, {});
      return;
    }

    if (endpoint === "logout") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (endpoint === "user") {
      if (this.sessionRevoked) {
        await json(route, 401, { message: "invalid claim: missing sub claim" });
        return;
      }
      if (method === "PUT") {
        const data = payload.data as Record<string, unknown> | undefined;
        if (data?.full_name) this.user.fullName = String(data.full_name);
        if (payload.email) this.user.email = String(payload.email);
        this.tables.set("profiles", [this.profileRow()]);
      }
      await json(route, 200, this.authUser());
      return;
    }

    await json(route, 200, {});
  }

  /* --------------------------------------------------------- postgrest */

  private async handleRest(ctx: HandlerContext): Promise<void> {
    const { url, method, headers, route, body } = ctx;
    const tableName = url.pathname.replace("/rest/v1/", "").split("/")[0];
    const rows = this.table(tableName);
    const wantsSingle = (headers["accept"] ?? "").includes("vnd.pgrst.object");
    const preferReturn = (headers["prefer"] ?? "").includes("return=representation");

    const filters: [string, string][] = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (!RESERVED_PARAMS.has(key)) filters.push([key, value]);
    }
    const match = (row: Row) => filters.every(([col, expr]) => matchesFilter(row, col, expr));

    if (method === "GET" || method === "HEAD") {
      let result = rows.filter(match);

      const order = url.searchParams.get("order");
      if (order) {
        const [column, ...modifiers] = order.split(".");
        const descending = modifiers.includes("desc");
        result = [...result].sort((a, b) => {
          const delta = compare(a[column], b[column]);
          return descending ? -delta : delta;
        });
      }

      const total = result.length;
      const limit = url.searchParams.get("limit");
      if (limit) result = result.slice(0, Number(limit));

      const countHeaders = {
        "content-range": `0-${Math.max(result.length - 1, 0)}/${total}`,
      };

      if (method === "HEAD") {
        /* A `head: true` count carries its answer in the header and nothing
           in the body — supabase-js reads `content-range`, so an empty array
           here would report zero regardless of the rows above. */
        await route.fulfill({
          status: 200,
          headers: {
            ...countHeaders,
            "access-control-allow-origin": "*",
            "access-control-expose-headers": "content-range",
            "content-type": "application/json",
          },
          body: "",
        });
        return;
      }

      if (wantsSingle) {
        if (result.length === 0) {
          /* PostgREST's zero-rows answer for `.single()`/`.maybeSingle()`.
             supabase-js turns PGRST116 into `data: null` for maybeSingle and
             into an error for single — both of which the app handles. */
          await json(route, 406, {
            code: "PGRST116",
            details: "The result contains 0 rows",
            hint: null,
            message: "JSON object requested, multiple (or no) rows returned",
          });
          return;
        }
        await json(route, 200, result[0], {
          ...countHeaders,
          "access-control-expose-headers": "content-range",
        });
        return;
      }

      await json(route, 200, result, {
        ...countHeaders,
        "access-control-expose-headers": "content-range",
      });
      return;
    }

    if (method === "POST") {
      const incoming = (Array.isArray(body) ? body : [body]) as Row[];
      const inserted = incoming.map((row) => ({
        id: row.id ?? nextId(),
        created_at: nowIso(),
        ...row,
      }));
      rows.push(...inserted);
      if (!preferReturn) {
        await route.fulfill({ status: 201, body: "", headers: { "access-control-allow-origin": "*" } });
        return;
      }
      await json(route, 201, wantsSingle ? inserted[0] : inserted);
      return;
    }

    if (method === "PATCH") {
      const patch = body as Row;
      const updated: Row[] = [];
      for (const row of rows) {
        if (!match(row)) continue;
        Object.assign(row, patch);
        updated.push(row);
      }
      await json(route, 200, wantsSingle ? (updated[0] ?? null) : updated);
      return;
    }

    if (method === "DELETE") {
      const kept = rows.filter((row) => !match(row));
      const removed = rows.filter(match);
      this.tables.set(tableName, kept);
      await json(route, 200, wantsSingle ? (removed[0] ?? null) : removed);
      return;
    }

    await json(route, 200, []);
  }

  /* -------------------------------------------------------- edge funcs */

  /** What the model "says". Replaced by tests that need a specific answer.
   *
   *  The default branches on `mode` because the app parses the reply
   *  differently per mode — quiz and flashcard generation expect JSON, notes
   *  expect prose — so one fixed string would break every generation path but
   *  the one it was written for. */
  aiReply: (payload: Record<string, unknown>) => string = (payload) => {
    switch (payload.mode) {
      case "quiz":
        return JSON.stringify([
          {
            question: "Which organelle carries out photosynthesis?",
            choices: ["Nucleus", "Chloroplast", "Ribosome", "Lysosome"],
            correctIndex: 1,
            topic: "Photosynthesis",
            feedback: "Chloroplasts hold the chlorophyll.",
          },
          {
            question: "What gas does photosynthesis consume?",
            choices: ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"],
            correctIndex: 2,
            topic: "Photosynthesis",
            feedback: "CO2 in, O2 out.",
          },
        ]);
      case "flashcards":
        return JSON.stringify([
          { front: "Where does photosynthesis happen?", back: "In the chloroplast." },
        ]);
      case "plan":
        return JSON.stringify({ days: [] });
      case "notes":
        return "## Photosynthesis\n\nPlants convert light into chemical energy.";
      default:
        return "Here is a study plan for you.";
    }
  };

  private async handleFunctions(ctx: HandlerContext): Promise<void> {
    const { url, route, body } = ctx;
    const fn = url.pathname.replace("/functions/v1/", "");
    const payload = (body ?? {}) as Record<string, unknown>;

    if (fn === "learnora-ai") {
      /* The real function counts this user's rows in `ai_request_log` since
         midnight UTC and answers 429 past the plan's allowance. Reproducing
         that here — rather than hard-coding a 429 after N calls — is what
         makes the rate-limit tests test the app's handling of a real limit
         rather than a fixture. */
      if (this.aiRequestsToday >= this.dailyAiLimit) {
        await json(route, 429, {
          error: `Rate limit exceeded. You have used all ${this.dailyAiLimit} AI generations for today. Your allowance resets at midnight UTC.`,
        });
        return;
      }
      this.table("ai_request_log").push({
        id: nextId(),
        user_id: this.user.id,
        created_at: nowIso(),
      });
      await json(route, 200, { text: this.aiReply(payload) });
      return;
    }

    if (fn === "stripe-billing") {
      const action = String(payload.action ?? "");
      if (action.includes("portal")) {
        await json(route, 200, { url: "https://billing.stripe.com/p/session/test_portal" });
        return;
      }
      await json(route, 200, { url: "https://checkout.stripe.com/c/pay/cs_test_123" });
      return;
    }

    if (fn === "delete-account") {
      await json(route, 200, { message: "Account deleted" });
      return;
    }

    this.unhandled.push(`POST /functions/v1/${fn}`);
    await json(route, 200, {});
  }

  /* -------------------------------------------------------- assertions */

  callsTo(fragment: string): { method: string; path: string; body: unknown }[] {
    return this.calls.filter((call) => call.path.includes(fragment));
  }
}

/** Stripe's hosted pages are the one navigation that must not actually
 *  happen — the browser would leave the app and load a real third-party
 *  checkout. Intercepting it lets a test assert the redirect was attempted,
 *  which is the part the app is responsible for. */
export async function captureStripeRedirects(page: Page, sink: string[]): Promise<void> {
  for (const pattern of [/checkout\.stripe\.com/, /billing\.stripe\.com/]) {
    await page.route(pattern, async (route) => {
      sink.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><h1>Stripe test page</h1></body></html>",
      });
    });
  }
}
