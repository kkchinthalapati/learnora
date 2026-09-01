import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

/* Origins allowed to call this function from a browser.

   This was a single hard-coded 'https://learnora.app', which no longer serves
   the app — production is on the Vercel domain below. Allow-Origin is matched
   as an exact string, so every browser call was being rejected before the
   response was exposed, and the app saw a bare "Failed to fetch". CORS is not
   the security boundary here (the JWT gate below is), but a mismatch still
   takes the whole AI offline.

   Set ALLOWED_ORIGINS (comma-separated) to add a domain without a code change,
   e.g. when a custom domain is attached.

   Local dev ports are matched by pattern (below), not enumerated here: the
   vanilla's static server picked 3000, but Vite (webapp/) prints whatever
   port is free — 5173 by default, something else if that's taken or a
   session asks for a specific one (`vite --port 8112`), and either
   `localhost` or `127.0.0.1` depending on how the host resolves. Hardcoding
   one port fixes this once and breaks again the next time someone runs a
   different one. */
const DEFAULT_ALLOWED_ORIGINS = [
  "https://learnora-app.vercel.app",
  "https://study-planner-delta-six.vercel.app",
  "https://learnora.app",
  "https://www.learnora.app",
  "http://localhost:3000",
];

function allowedOrigins(): string[] {
  const configured = Deno.env.get("ALLOWED_ORIGINS");
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;
  return configured.split(",").map((o) => o.trim()).filter(Boolean);
}

/* Echoes the caller's origin when it is on the list, or matches one of two
   patterns: a Vercel preview deployment (fresh subdomain per build), or any
   localhost/127.0.0.1 dev server on any port — see the note above on why a
   fixed port list keeps breaking. Neither pattern is reachable by a real
   attacker's origin, so widening past an exact match doesn't weaken the
   boundary that matters, which is the JWT check below. */
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const list = allowedOrigins();
  const isPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin) &&
    /learnora|study-planner/i.test(origin);
  const isLocalDev = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  const allow =
    list.includes(origin) || isPreview || isLocalDev ? origin : list[0];

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    // The response body varies by request origin, so it must not be cached
    // under one origin and replayed to another.
    "Vary": "Origin",
  };
}

function decodeBase64UTF8(b64: string): string {
  try {
    const binString = atob(b64);
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
    return new TextDecoder().decode(bytes);
  } catch (e) {
    return atob(b64);
  }
}

function cleanJsonResponse(text: string): string {
  if (!text) return text;
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return cleaned.trim();
}

/* =========================================================================
   CONTENT SAFETY

   Learnora is a study tool used by students from age 13. Two gaps let it
   generate a quiz on bomb-making and one on recreational drug identification:
   the system prompt said nothing about acceptable subject matter, and a
   Gemini safety refusal was caught as a generic error and silently retried
   against Groq/OpenRouter, which are far less filtered. So a blocked request
   didn't fail — it got downgraded to a provider that would answer it.

   The screen below is deliberately narrow. It targets operational
   "how to make/obtain" framing rather than subject areas, because banning
   topics outright would break legitimate coursework: pharmacology, the
   chemistry of energetic materials, military history, and toxicology are all
   things a student may properly be studying. The system-prompt policy and the
   provider filters cover the grey zone; this catches the blatant cases before
   a single token is spent.
   ========================================================================= */

const SAFETY_REFUSAL =
  "I can't help with that topic. Learnora is a study assistant — I can't create quizzes or study material about making weapons or explosives, obtaining or producing illegal drugs, or harming yourself or others. Ask me about a subject you're studying and I'll gladly help.";

const UNSAFE_PATTERNS: RegExp[] = [
  // Weapons and explosives — construction/acquisition framing only.
  /\b(?:make|making|build|building|construct|constructing|create|creating|assemble|assembling|manufacture|manufacturing|diy|homemade|improvised)\b[^.?!]{0,40}\b(?:bomb|explosive|ied|grenade|landmine|napalm|thermite|pipe\s*bomb|molotov|detonator|silencer|suppressor|ghost\s*gun|untraceable\s*(?:gun|firearm))/i,
  /\b(?:bomb|explosive|grenade|napalm|thermite|detonator)[\s-]*(?:making|building|construction|recipe|blueprint)\b/i,
  /\b(?:3d[\s-]?print|print)\w*\b[^.?!]{0,30}\b(?:gun|firearm|receiver|lower)\b/i,
  /\bconvert\w*\b[^.?!]{0,30}\bfull[\s-]?auto\b/i,

  // Illegal drug synthesis or acquisition.
  /\b(?:synthes\w+|cook|cooking|manufactur\w+|produc\w+|extract\w+|grow\w+|make|making)\b[^.?!]{0,40}\b(?:meth|methamphetamine|crystal\s*meth|cocaine|crack|heroin|fentanyl|mdma|ecstasy|lsd|ghb|psilocybin|magic\s*mushrooms)\b/i,
  /\b(?:how|where)\b[^.?!]{0,30}\b(?:buy|score|obtain|get)\b[^.?!]{0,30}\b(?:meth|cocaine|heroin|fentanyl|mdma|ecstasy|lsd|illegal\s*drugs|drugs\s*online)\b/i,
  /\bdark\s*(?:web|net)\b[^.?!]{0,30}\b(?:drug|gun|weapon)/i,

  // Self-harm and suicide methods.
  /\b(?:how\s*to|best\s*way|method[s]?\s*(?:to|for|of))\b[^.?!]{0,30}\b(?:kill\s*(?:myself|yourself)|commit\s*suicide|suicide|self[\s-]?harm|end\s*my\s*life|overdose)\b/i,
  /\b(?:lethal|fatal)\s*dose\b[^.?!]{0,30}\b(?:of|for)\b/i,

  // Poisons/toxins framed as untraceable harm to a person.
  /\b(?:poison|toxin|nerve\s*agent|ricin|sarin|anthrax)\b[^.?!]{0,40}\b(?:someone|a\s*person|undetect\w+|untraceab\w+|without\s*(?:being\s*)?(?:caught|detected))/i,

  // Sexual content involving minors — no legitimate study framing.
  /\b(?:child|minor|underage|teen|preteen|loli)\w*\b[^.?!]{0,25}\b(?:porn|sexual|erotic|nude|nudes|nsfw)\b/i,
  /\b(?:porn|sexual|erotic|nude|nsfw)\w*\b[^.?!]{0,25}\b(?:child|minor|underage|preteen)\b/i,
];

function screenForUnsafeContent(text: string): boolean {
  if (!text) return false;
  // Collapse separators used to slip past word matching ("b-o-m-b making").
  const normalized = text.replace(/[_*~`]+/g, "").replace(/\s{2,}/g, " ");
  return UNSAFE_PATTERNS.some((re) => re.test(normalized));
}

/* True when a Gemini response was withheld by its safety filters rather than
   failing for an operational reason. Those must NOT fall through to the other
   providers — that is precisely how the unsafe quizzes got generated. */
function isGeminiSafetyBlock(response: any): boolean {
  const blockReason = response?.promptFeedback?.blockReason;
  if (blockReason && blockReason !== "OTHER") return true;
  const finish = response?.candidates?.[0]?.finishReason;
  return finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST";
}

function isSafetyError(err: any): boolean {
  const msg = (err?.message || String(err || "")).toLowerCase();
  return msg.includes("safety") || msg.includes("blocked") || msg.includes("prohibited_content");
}

/* =========================================================================
   PROVIDER CHAIN

   Every provider below speaks the OpenAI /chat/completions dialect, so they
   share one caller. Gemini is handled separately: it is the only one that
   takes an image/PDF attachment inline, so it stays first whenever a file is
   involved.

   Model IDs are read from the environment with the constants here as
   fallbacks. Free-tier model names change often, and re-deploying an edge
   function to rename a model is a bad trade — set e.g. CEREBRAS_MODEL to
   override without touching this file.

   Adding a provider is one entry here plus its key in Supabase secrets. A
   provider with no key configured is skipped silently, so the chain works
   with however many are set up.
   ========================================================================= */

type OpenAIProvider = {
  id: string;
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
  url: string;
  extraHeaders?: Record<string, string>;
  /* Whether the provider honours response_format:json_object. Used only for
     quiz/plan generation, where a stray sentence around the JSON is the single
     most common cause of a failed generation. */
  jsonMode: boolean;
};

const OPENAI_PROVIDERS: OpenAIProvider[] = [
  {
    id: "cerebras",
    keyEnv: "CEREBRAS_API_KEY",
    modelEnv: "CEREBRAS_MODEL",
    defaultModel: "gpt-oss-120b",
    url: "https://api.cerebras.ai/v1/chat/completions",
    jsonMode: true,
  },
  {
    id: "groq",
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModel: "llama-3.3-70b-versatile",
    url: "https://api.groq.com/openai/v1/chat/completions",
    jsonMode: true,
  },
  {
    id: "mistral",
    keyEnv: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
    defaultModel: "mistral-small-latest",
    url: "https://api.mistral.ai/v1/chat/completions",
    jsonMode: true,
  },
  {
    id: "github-models",
    keyEnv: "GITHUB_MODELS_TOKEN",
    modelEnv: "GITHUB_MODELS_MODEL",
    defaultModel: "openai/gpt-4.1-mini",
    url: "https://models.github.ai/inference/chat/completions",
    extraHeaders: { "X-GitHub-Api-Version": "2026-03-10" },
    jsonMode: true,
  },
  {
    id: "openrouter",
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    // Kept as the last resort: the free aggregator models are the weakest in
    // the chain, so they only run when everything else is exhausted.
    // `meta-llama/llama-3-8b-instruct:free` was retired from OpenRouter's
    // catalog (404 "No endpoints found") — replaced with a model confirmed
    // live against https://openrouter.ai/api/v1/models on 2026-08-01.
    defaultModel: "openai/gpt-oss-20b:free",
    url: "https://openrouter.ai/api/v1/chat/completions",
    extraHeaders: { "HTTP-Referer": "https://learnora.app", "X-Title": "Learnora" },
    jsonMode: false,
  },
];

/* Structured JSON takes noticeably longer than a chat turn — a ten-question
   quiz with per-question feedback is a lot of tokens — and the old flat 15s
   abort was cutting those off mid-generation, which surfaced as the
   intermittent "couldn't generate a quiz" failures. */
const TIMEOUT_MS = { chat: 20_000, json: 35_000 };

/* Ceiling for the whole request, so a slow chain returns an honest error
   instead of running until the platform kills it and the client sees a
   connection drop. */
const TOTAL_BUDGET_MS = 55_000;

/* =========================================================================
   HOUSE STYLE

   Every AI surface in the app funnels through this function, so this is the
   only place a single answer-formatting policy can live. Before it existed,
   style was set per-caller: `ReviewView.tsx` grew its own COACH_STYLE, and
   every other surface — chat, the notes sidebar, Notebook Studio, the
   debugger, Feynman, pre-mortem — inherited nothing but "brief" or
   "detailed". That is why replies read as clinical third-person essays and
   arrived wearing `###` headings and `---` rules the renderers had no rule
   for.

   Two hard constraints shape the wording:

   1. **Only the markdown the app can actually render may be requested.**
      `lib/markdownToReact.tsx` handles bold, italic, inline code, fences,
      blockquotes, `-` bullets, `1.`/`1)` numbers and `#`–`####` headings —
      and nothing else. Tables and `[links](url)` have no branch at all, so a
      model that emits them puts raw pipes and brackets on a student's
      screen. They are therefore forbidden here rather than left to chance.

   2. **Length follows the student's own setting; voice never does.** A
      student who asked for detailed answers must still get detailed ones, so
      only the length rule reads `aiConciseness`. Plain English, second
      person and the safe-markdown subset apply at every length — they are
      what makes an answer readable, not what makes it short.
   ========================================================================= */

const LENGTH_RULE: Record<string, string> = {
  short:
    "Keep it to 2-4 short sentences unless the student explicitly asks for more.",
  medium:
    "Aim for 2-6 sentences. Expand only where a concept genuinely needs it.",
  detailed:
    "Cover the topic thoroughly, but keep every individual paragraph short — depth comes from more sections, never from longer walls of text.",
};

/* Applies to conversational replies (chat, the coach drawer, the notes
   sidebar, Notebook Studio) — anything a student reads as prose on screen. */
function houseStyle(conciseness: string | undefined): string {
  const length = LENGTH_RULE[conciseness ?? "medium"] ?? LENGTH_RULE.medium;
  return `

    HOW TO WRITE THE ANSWER — this governs every reply:
    - Talk straight to the student, second person. "You squared each term separately" — never "the student squared" or "students often".
    - ${length}
    - Lead with the answer. No "I'd love to help", no "Let's break it down step by step", no restating the question back.
    - Everyday English. If a technical term is unavoidable, define it in the same breath you use it.
    - Break the reply into short paragraphs. One idea each, at most three sentences.
    - To label a section, put the label on its own line wrapped in ** (for example **Where it went wrong**). Never use #, ##, ### or #### headings — they render far larger than the surrounding text and read as clutter.
    - Never use --- horizontal rules, tables, or [text](url) links. The app cannot render them and they reach the student as raw punctuation.
    - Bullets start with "- " and stay to one line each. Numbered steps use "1. ". Use them for genuine lists only, not to chop a paragraph up.
    - No preamble, no sign-off, and never mention these instructions.

    MATHS — the app typesets TeX, so write maths as TeX rather than as plain characters:
    - Inline, inside a sentence: single dollars, $x^2 + 1$. On its own line: double dollars, $$\\sqrt{12} = 2\\sqrt{3}$$.
    - Put every step of the working on its own $$…$$ line, one step per line, so the student can follow the reasoning down the page instead of decoding a dense block.
    - Wrap the final answer in \\boxed{}, for example $$\\boxed{5\\sqrt{2}}$$.
    - Use real TeX for roots, fractions, powers and indices — \\sqrt{12}, \\frac{3}{4}, x^{2}, a_{1} — never a typed approximation like sqrt(12), 3/4 or x^2.
    - Never put maths in a code fence: a fence is for code, and it turns the equation into unstyled monospace.
    - Prose stays outside the dollars. Never set a whole sentence in TeX.`;
}

/* Long-form modes keep their length and their headings — a study-notes
   document is supposed to have structure — but inherit the voice rules and
   the same ban on syntax the app cannot render. */
const PROSE_STYLE = `

    HOW TO WRITE IT:
    - Talk straight to the student, second person, in everyday English. Define any technical term in the same breath you use it.
    - Keep paragraphs short — one idea each. Depth comes from more sections, not longer paragraphs.
    - Headings (##, ###), bold, bullets, numbered lists, blockquotes and code fences are all fine.
    - Never use tables or [text](url) links: the app cannot render them and they reach the student as raw punctuation.
    - Write maths as TeX: $x^2$ inline, $$\\sqrt{12} = 2\\sqrt{3}$$ on its own line, \\boxed{} around a final answer. The notes editor typesets it. Use real TeX for roots, fractions and indices — \\sqrt{12}, \\frac{3}{4}, x^{2} — never sqrt(12) or 3/4.`;

/* JSON modes get no formatting rules at all — a prose-style instruction next
   to a "return only raw JSON" instruction is how a model ends up emitting
   markdown inside a string field, or prose around the object. This covers
   only what the strings say, never how the payload is shaped. */
const JSON_FIELD_STYLE = `
Write every human-readable string in plain, everyday English aimed at a student aged 13 or over: second person, no jargon left unexplained, and no markdown syntax inside JSON string values.`;

/* Modes whose body is parsed as JSON by the client. Keep this as the single
   source of truth: `flashcards` used to be sent with no mode at all, so deck
   generation silently ran on the 20s chat budget with no fence-stripping —
   long decks were cut off mid-array and surfaced as "couldn't generate
   flashcards". Anything added here must also emit a JSON-only instruction in
   `modeInstructions` below, and be unwrappable by the matching client parser. */
const JSON_MODES = new Set(["quiz", "plan", "flashcards"]);

/* `notes` is long-form Markdown, not JSON — it must not get response_format,
   but a full study-notes document is easily as slow as a quiz, so it shares
   the longer budget. */
const SLOW_MODES = new Set([...JSON_MODES, "notes"]);

function isJsonMode(mode: string | undefined): boolean {
  return mode !== undefined && JSON_MODES.has(mode);
}

function timeoutFor(mode: string | undefined): number {
  return mode !== undefined && SLOW_MODES.has(mode) ? TIMEOUT_MS.json : TIMEOUT_MS.chat;
}

/* A response is only usable if it actually carries text. An empty string from
   a provider that returned HTTP 200 used to be passed straight back to the
   client as a successful-but-blank reply; treating it as a failure lets the
   next provider have a go. */
function extractContent(data: any): string | null {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") return null;
  return content;
}

async function callOpenAICompatible(
  provider: OpenAIProvider,
  opts: {
    systemInstruction: string;
    history: any[];
    userContent: string;
    mode?: string;
    signal?: AbortSignal;
  },
): Promise<string> {
  const key = Deno.env.get(provider.keyEnv);
  if (!key) throw new Error(`${provider.keyEnv} is not set in Supabase secrets.`);

  const model = Deno.env.get(provider.modelEnv) || provider.defaultModel;
  const wantsJson = isJsonMode(opts.mode);

  const messages = [
    { role: "system", content: opts.systemInstruction },
    ...(opts.history || []).slice(0, -1).map((m: any) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: opts.userContent },
  ];

  const body: Record<string, unknown> = { model, messages };
  if (wantsJson && provider.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutFor(opts.mode));
  const onParentAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onParentAbort);

  try {
    const response = await fetch(provider.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(provider.extraHeaders || {}),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        `${provider.id} returned ${response.status}: ${JSON.stringify(data?.error ?? data ?? {})}`,
      );
    }
    // Some gateways report failures in the body with a 200 status.
    if (data?.error) throw new Error(`${provider.id} error: ${JSON.stringify(data.error)}`);

    const content = extractContent(data);
    if (content === null) throw new Error(`${provider.id} returned an empty completion.`);
    return content;
  } finally {
    clearTimeout(timeoutId);
    opts.signal?.removeEventListener("abort", onParentAbort);
  }
}

function safetyRefusalResponse(mode: string | undefined, headers: Record<string, string>): Response {
  // JSON-mode callers parse the body as JSON and would render a refusal
  // sentence as a broken quiz, so give them a shape they can reject cleanly
  // and surface the message through the `error` field instead.
  if (isJsonMode(mode)) {
    return new Response(
      JSON.stringify({ error: SAFETY_REFUSAL, refused: true }),
      { status: 422, headers },
    );
  }
  return new Response(
    JSON.stringify({ text: SAFETY_REFUSAL, refused: true, modelUsed: "safety-filter" }),
    { headers },
  );
}

/* =========================================================================
   RATE LIMITING

   Every mode here spends a token budget against Learnora's own provider
   keys, most of which are free-tier and quota-limited account-wide, not
   per-user — a single runaway client (a retry loop with no backoff, or a
   deliberately abusive one) could exhaust that shared quota for every other
   student in minutes, and nothing before this caught it.

   RATE_LIMIT_MAX requests per RATE_LIMIT_WINDOW_MS, per signed-in user.
   Deliberately generous for a human: one request every 20s sustained is
   plenty for chat plus the occasional quiz/notes generation, but a scripted
   loop hits it in seconds. Both are overridable via secrets without a
   redeploy, same pattern as the provider model overrides above.
   ========================================================================= */

const RATE_LIMIT_MAX = Number(Deno.env.get("AI_RATE_LIMIT_MAX")) || 30;
const RATE_LIMIT_WINDOW_MS = (Number(Deno.env.get("AI_RATE_LIMIT_WINDOW_MINUTES")) || 10) * 60_000;

const RATE_LIMIT_MESSAGE =
  "You're sending requests faster than I can keep up with. Wait a few minutes and try again.";

function rateLimitResponse(mode: string | undefined, headers: Record<string, string>): Response {
  if (isJsonMode(mode)) {
    return new Response(
      JSON.stringify({ error: RATE_LIMIT_MESSAGE, refused: true }),
      { status: 429, headers },
    );
  }
  return new Response(
    JSON.stringify({ text: RATE_LIMIT_MESSAGE, refused: true, modelUsed: "rate-limit" }),
    { status: 429, headers },
  );
}

/* Counts this user's own accepted requests in the trailing window and logs
 * the current one — via the same client the auth gate already built with
 * the caller's JWT, so RLS (owner-only select/insert on ai_request_log)
 * does the actual enforcement; this is just the query shape around it.
 * Fails open on a database error: a rate limiter that takes AI outages down
 * with it trades one small risk (a burst slips through while the table is
 * unreachable) for a much worse one (AI goes fully offline because a
 * side-table had a bad moment). */
async function checkAndLogRateLimit(
  supabase: any,
  userId: string,
  mode: string | undefined,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count, error: countError } = await supabase
      .from("ai_request_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);

    if (countError) {
      console.error("[rate-limit] count query failed, failing open", countError);
      return true;
    }

    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      console.warn("[rate-limit] blocked", { userId, mode, count });
      return false;
    }

    const { error: insertError } = await supabase
      .from("ai_request_log")
      .insert({ user_id: userId, mode: mode ?? null });
    if (insertError) {
      console.error("[rate-limit] log insert failed (request still allowed)", insertError);
    }

    return true;
  } catch (err) {
    console.error("[rate-limit] unexpected failure, failing open", err);
    return true;
  }
}

Deno.serve(async (req) => {
    // Resolved per request now that the allowed origin is echoed back.
    const corsHeaders = corsHeadersFor(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // ── AUTH GATE ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return new Response(
            JSON.stringify({ error: 'Missing or invalid authorization token.' }),
            { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return new Response(
            JSON.stringify({ error: 'Unauthorized. Please log in.' }),
            { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
    }
    // ── END AUTH GATE ──────────────────────────────────────

    const debugErrors: Record<string, string> = {};

    try {
        const { history, file, settings, mode } = await req.json();
        const s = settings || {};

        const personaMap = {
            coach: 'a strict, tough-love, demanding academic coach',
            buddy: 'a casual, friendly, bro-like, relaxed study partner',
            tutor: 'a patient, explanatory, supportive tutor',
            // The client's fourth persona option (webapp/src/lib/settings.ts's
            // AI_PERSONA_OPTIONS / AI_PERSONA_QUIZ_HOST). Without an entry
            // here `personaMap[s.aiPersona] || personaMap.tutor` silently
            // falls back to tutor for every student who picks it — degrades
            // gracefully, but the point of adding the option was for it to
            // actually change the voice.
            professor: 'a formal, precise, academic professor who explains things in textbook style'
        };

        const modeInstructions = mode === "plan"
            ? `\nYou are generating a weekly study schedule. Output ONLY raw JSON (no prose, no code fences) matching this shape: {"days":[{"date":"YYYY-MM-DD","blocks":[{"startHint":"morning|afternoon|evening","durationMins":45,"subject":"string","reason":"string","examId":null,"taskId":null}]}],"summary":"one-sentence summary of the week's priorities"}.`
            : mode === "quiz"
            // Wrapped in an object rather than a bare array so the request can
            // use response_format:json_object, which only permits an object at
            // the top level. The client accepts either shape.
            ? `\nYou are generating a high-quality multiple-choice quiz. Ensure every question covers a completely unique concept, logical sub-step, or angle with NO back-to-back repetitive questions. Match the requested difficulty level precisely (Hard = multi-step deduction, error spotting, edge cases, subtle fallacies; Easy = direct recall; Medium = conceptual understanding). Output ONLY raw JSON (no prose, no code fences) matching this shape: {"questions":[{"question":"string","choices":["a","b","c","d"],"correctIndex":0,"topic":"short topic label","feedback":"string"}]}. "correctIndex" is REQUIRED on every question and must be the 0-based index of the correct entry in that question's "choices" array. "feedback" is shown to EVERY student regardless of what they answered, so it must be a neutral explanation of the question: never congratulate ("Nice work!", "Correct!", "Exactly right!") and never state or imply which choice the student picked.`
            : mode === "flashcards"
            // Object-wrapped for the same response_format:json_object reason as
            // quiz above. The client unwraps {"cards":[...]} or a bare array.
            ? `\nYou are generating flashcards. Every card must test a distinct concept — no two cards may restate the same fact. Keep "front" a single question or prompt and "back" a complete but concise answer. Output ONLY raw JSON (no prose, no code fences) matching this shape: {"cards":[{"front":"string","back":"string"}]}.`
            : mode === "notes"
            // Deliberately NOT a JSON mode: this returns long-form Markdown.
            ? `\nYou are generating study notes as long-form Markdown. Output the notes only — no JSON, no preamble, no closing commentary.`
            : mode === "rewrite"
            ? `\nYou are rewriting the provided study notes to match a specific complexity or tone. Output the rewritten notes as long-form Markdown only — no JSON, no preamble, no closing commentary.`
            : "";

        /* One of three, never a mix: prose formatting rules next to a
           "raw JSON only" instruction is how a model ends up wrapping the
           payload in markdown. `notes`/`rewrite` keep their headings and
           length; everything conversational gets the full house style. */
        const styleInstructions = isJsonMode(mode)
            ? JSON_FIELD_STYLE
            : mode === "notes" || mode === "rewrite"
            ? PROSE_STYLE
            : houseStyle(s.aiConciseness);

        const systemInstruction = `You are Learnora AI. Act as ${personaMap[s.aiPersona] || personaMap.tutor}.
    Use ${s.aiLanguage || 'English'}.

    VOICE — refer to yourself in the first person, always. Say "I can help you with that", never "Learnora can help you with that" or "Learnora AI thinks". Use the name "Learnora" only for the product itself (its tabs, features and screens), never as a stand-in for "I", and never describe yourself in the third person. Stay in this voice for the whole conversation, including the first message.

    CONTENT POLICY — Learnora is a study tool used by students aged 13 and up. Refuse, in any mode including quiz and flashcard generation, to produce content that:
    - explains how to make, acquire, modify or deploy weapons, explosives, or incendiary devices;
    - explains how to synthesise, cultivate, obtain or conceal illegal drugs, or presents recreational drug use as harmless or aspirational;
    - describes methods of suicide, self-harm, or harming another person, or how to poison someone;
    - is sexual content, or any sexual content involving minors;
    - promotes hatred or violence against a group, or helps someone evade law enforcement.
    Academic study of these subjects is fine at the level a syllabus would cover — the pharmacology of addiction, the chemistry of combustion, the history of a conflict, public-health harm reduction. What you must never provide is operational instruction, a recipe, or anything that reads as encouragement.
    When a request crosses that line, refuse briefly and warmly, say why in one sentence, and offer a legitimate study angle instead. Do not produce a partial answer, and do not hide the refusal inside a quiz question. If you are generating JSON and must refuse, return an empty array [] rather than unsafe questions.

    If asked for flashcards, output ONLY raw JSON: [{"front":"...", "back":"..."}].${modeInstructions}${styleInstructions}`;

        const currentMsg = history && history.length > 0 ? history[history.length - 1].content : "";

        const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };

        // Rate limit before spending a token, same as the safety screen
        // below — this is the cheap check that protects the expensive
        // resource. Checked (and logged) ahead of the safety screen so a
        // flood of unsafe-topic probes counts against the sender's budget
        // too, rather than getting a free pass because they were refused.
        const withinRateLimit = await checkAndLogRateLimit(supabase, user.id, mode);
        if (!withinRateLimit) {
            return rateLimitResponse(mode, jsonHeaders);
        }

        // Screen before spending a token. `history` carries the workspace
        // context prelude, so only the newest turn is checked here.
        if (screenForUnsafeContent(currentMsg)) {
            console.warn("[safety] Request refused by pre-flight topic screen", { mode, userId: user.id });
            return safetyRefusalResponse(mode, jsonHeaders);
        }

        // Bounds the whole chain. Without it a run of slow providers keeps the
        // function alive until the platform kills it, which reaches the client
        // as a dropped connection rather than a usable error.
        const deadline = AbortSignal.timeout(TOTAL_BUDGET_MS);
        const budgetExhausted = () => deadline.aborted;

        // =========================================================================
        // CHANNEL 1: GEMINI — first because it is the only provider in the chain
        // that reads an image/PDF attachment inline.
        // =========================================================================
        const geminiKey = Deno.env.get('GEMINI_API_KEY');
        if (geminiKey) {
            // gemini-1.5-flash is retired (404 "not found for API version
            // v1beta") — dropped from the default rather than guessed at a
            // replacement; GEMINI_MODELS overrides this list without a
            // redeploy if a second model is wanted.
            const geminiModels = (Deno.env.get('GEMINI_MODELS') || "gemini-2.0-flash")
                .split(",").map((m) => m.trim()).filter(Boolean);
            const genAI = new GoogleGenerativeAI(geminiKey);

            const chatHistory = (history || []).slice(0, -1).map((m: any) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));

            for (const modelName of geminiModels) {
                if (budgetExhausted()) break;
                try {
                    const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });

                    const chat = model.startChat({ history: chatHistory });

                    const payload = file && file.data ? [
                        currentMsg,
                        { inlineData: { data: file.data, mimeType: file.mimeType } }
                    ] : currentMsg;

                    // The SDK takes no abort signal, so the timeout is imposed
                    // from outside. Previously this call had no timeout at all
                    // while every other provider had one — a hung Gemini
                    // request stalled the entire function.
                    const result: any = await Promise.race([
                        chat.sendMessage(payload),
                        new Promise((_, reject) =>
                            setTimeout(
                                () => reject(new Error(`Gemini (${modelName}) timed out`)),
                                timeoutFor(mode),
                            )
                        ),
                    ]);

                    // A safety block is a verdict, not an outage. Returning it
                    // here stops the fallback chain: previously this threw,
                    // was swallowed as a generic error, and the same prompt was
                    // replayed against the other providers until one answered.
                    if (isGeminiSafetyBlock(result.response)) {
                        console.warn(`[safety] ${modelName} blocked the request`, { mode, userId: user.id });
                        return safetyRefusalResponse(mode, jsonHeaders);
                    }

                    let text = result.response.text();
                    if (isJsonMode(mode)) {
                        text = cleanJsonResponse(text);
                    }
                    if (!text || !text.trim()) throw new Error(`Gemini (${modelName}) returned empty text`);

                    return new Response(JSON.stringify({
                        text: text,
                        modelUsed: modelName
                    }), {
                        headers: jsonHeaders
                    });
                } catch (err: any) {
                    // `.text()` throws on a blocked candidate — same verdict,
                    // so it must not fall through to another provider either.
                    if (isSafetyError(err)) {
                        console.warn(`[safety] ${modelName} refused the request`, { mode, userId: user.id });
                        return safetyRefusalResponse(mode, jsonHeaders);
                    }
                    debugErrors[`gemini (${modelName})`] = err.message || String(err);
                    console.error(`Gemini (${modelName}) Error:`, err);
                }
            }
        } else {
            debugErrors["gemini"] = "GEMINI_API_KEY secret is not set in Supabase.";
        }

        // Text-only providers can't take the attachment inline. Only actual
        // text is worth folding into the prompt this way — `file` only
        // reaches this function at all for non-text uploads (a text/plain
        // file is decoded and merged into `history` client-side before the
        // call, see studyPackage.ts/ChatProvider.tsx), so a PDF or image
        // here is genuinely binary. `decodeBase64UTF8`'s TextDecoder doesn't
        // throw on invalid UTF-8 — it silently emits a replacement character
        // per bad byte — so running a binary file through it doesn't fail,
        // it produces a multi-megabyte string of garbage that every
        // provider below then rejects as an oversized prompt. That is what
        // "Prompt contains 6117667 tokens" and Groq's 413 actually were:
        // not a real 6-million-token document, a mis-decoded PDF.
        let fallbackMsg = currentMsg;
        if (file && file.data && /^text\//.test(file.mimeType || "")) {
            try {
                const decodedText = decodeBase64UTF8(file.data);
                fallbackMsg += `\n\n[Attached File Content: ${file.name || "file"}]\n${decodedText}`;
            } catch (_) { }
        } else if (file && file.data) {
            // Say so rather than silently dropping it — otherwise the model
            // answers as though no file were attached at all, with nothing
            // telling the student why.
            fallbackMsg += `\n\n[The student attached a file named "${file.name || "file"}" (${file.mimeType || "unknown type"}), but this response is coming from a text-only fallback model that cannot read its contents. Say so if it's relevant to the request.]`;
        }

        // =========================================================================
        // CHANNELS 2..N: every configured OpenAI-compatible provider, in order.
        // Each is tried until one returns usable text; unconfigured ones are
        // skipped without being treated as failures.
        // =========================================================================
        for (const provider of OPENAI_PROVIDERS) {
            if (!Deno.env.get(provider.keyEnv)) {
                debugErrors[provider.id] = `${provider.keyEnv} is not set in Supabase.`;
                continue;
            }
            if (budgetExhausted()) {
                debugErrors[provider.id] = "Skipped — request budget exhausted.";
                continue;
            }

            try {
                let text = await callOpenAICompatible(provider, {
                    systemInstruction,
                    history,
                    userContent: fallbackMsg,
                    mode,
                    signal: deadline,
                });

                if (isJsonMode(mode)) {
                    text = cleanJsonResponse(text);
                }

                // None of these providers has a safety layer comparable to
                // Gemini's, so their output is screened before it is returned.
                if (screenForUnsafeContent(text)) {
                    console.warn(`[safety] ${provider.id} output refused by screen`, { mode, userId: user.id });
                    return safetyRefusalResponse(mode, jsonHeaders);
                }

                return new Response(JSON.stringify({
                    text,
                    modelUsed: `${provider.id}/${Deno.env.get(provider.modelEnv) || provider.defaultModel}`
                }), {
                    headers: jsonHeaders
                });
            } catch (err: any) {
                debugErrors[provider.id] = err.message || String(err);
                console.error(`${provider.id} Error:`, err);
            }
        }

        throw new Error("All AI channels offline.");

    } catch (err: any) {
        console.error("AI pipeline failure", {
            debugErrors,
            error: err.message || String(err),
        });

        return new Response(JSON.stringify({
            error: "AI is temporarily unavailable. Please try again in a moment."
        }), {
            status: 503,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
});
