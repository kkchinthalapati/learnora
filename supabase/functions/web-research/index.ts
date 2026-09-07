import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://learnora.app",
  "https://www.learnora.app",
  "http://localhost:5173",
  "http://localhost:4173",
];
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_QUERY_CHARS = 400;
const MAX_EXTRACT_CHARS = 40_000;

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const configured = Deno.env.get("ALLOWED_ORIGINS");
  const allowed = configured
    ? configured
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
  const accepted =
    allowed.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin);
  return {
    "Access-Control-Allow-Origin": accepted ? origin : allowed[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function safePublicUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > 2_048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

async function enforceResearchLimit(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, plan_status")
    .eq("id", userId)
    .maybeSingle();
  const paid = ["active", "trialing", "past_due"].includes(
    profile?.plan_status,
  );
  const plan: "free" | "plus" | "pro" =
    paid && (profile?.plan === "plus" || profile?.plan === "pro")
      ? profile.plan
      : "free";
  const limits = { free: 20, plus: 80, pro: 250 } as const;
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("ai_request_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("tool", "webResearch")
    .gte("created_at", midnight.toISOString());
  if (error) throw new Error("Research usage could not be checked.");
  if ((count ?? 0) >= limits[plan]) {
    throw new Error(
      "You've reached today's web research allowance. It resets at midnight UTC.",
    );
  }
  const { error: logError } = await supabase
    .from("ai_request_log")
    .insert({ user_id: userId, mode: "research", tool: "webResearch" });
  if (logError) throw new Error("Research usage could not be recorded.");
}

async function tavily(
  path: "search" | "extract",
  payload: Record<string, unknown>,
) {
  const apiKey = Deno.env.get("TAVILY_API_KEY");
  if (!apiKey) throw new Error("Live web research is not configured yet.");
  const response = await fetch(`https://api.tavily.com/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, ...payload }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(
      "[web-research] Tavily request failed",
      response.status,
      body,
    );
    throw new Error("The research provider could not complete that request.");
  }
  return body as Record<string, any>;
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return json({ error: "Method not allowed." }, 405, cors);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Please log in to use web research." }, 401, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return json({ error: "Your session has expired." }, 401, cors);

  try {
    const body = await req.json();
    await enforceResearchLimit(supabase, user.id);

    if (body.action === "search") {
      const query = typeof body.query === "string" ? body.query.trim() : "";
      if (!query || query.length > MAX_QUERY_CHARS) {
        return json(
          { error: `Search queries must be 1-${MAX_QUERY_CHARS} characters.` },
          400,
          cors,
        );
      }
      const domain =
        typeof body.domain === "string" && body.domain.trim()
          ? body.domain.trim().toLowerCase()
          : null;
      const depth = Number(body.depth) >= 4 ? "advanced" : "basic";
      const result = await tavily("search", {
        query,
        search_depth: depth,
        max_results: 6,
        include_answer: false,
        include_raw_content: false,
        ...(domain ? { include_domains: [domain] } : {}),
      });
      const results = (Array.isArray(result.results) ? result.results : [])
        .map((item: any, index: number) => {
          const url = safePublicUrl(item.url);
          if (!url) return null;
          return {
            id: `${index + 1}-${url.href}`,
            title: String(item.title || url.hostname).slice(0, 300),
            url: url.href,
            domain: url.hostname.replace(/^www\./, ""),
            snippet: String(item.content || "").slice(0, 1_500),
            score: typeof item.score === "number" ? item.score : undefined,
          };
        })
        .filter(Boolean);
      return json({ query, results }, 200, cors);
    }

    if (body.action === "extract") {
      const url = safePublicUrl(body.url);
      if (!url)
        return json({ error: "Enter a public HTTPS web address." }, 400, cors);
      const result = await tavily("extract", {
        urls: [url.href],
        extract_depth: "advanced",
      });
      const extracted = Array.isArray(result.results)
        ? result.results[0]
        : null;
      const markdown = String(
        extracted?.raw_content || extracted?.content || "",
      ).trim();
      if (!markdown)
        throw new Error("No readable text was found on that page.");
      return json(
        {
          title: String(extracted?.title || url.hostname).slice(0, 300),
          url: safePublicUrl(extracted?.url)?.href || url.href,
          domain: url.hostname.replace(/^www\./, ""),
          markdown: markdown.slice(0, MAX_EXTRACT_CHARS),
        },
        200,
        cors,
      );
    }

    return json({ error: "Unknown research action." }, 400, cors);
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : "Web research is temporarily unavailable.";
    const status = message.includes("allowance") ? 429 : 503;
    return json({ error: message }, status, cors);
  }
});
