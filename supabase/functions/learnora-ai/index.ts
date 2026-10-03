import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import {
  isSelfHarmContent,
  SAFETY_REFUSAL,
  screenConversation,
  screenForUnsafeContent,
  screenImagePrompt,
  SELF_HARM_REFUSAL,
} from "../_shared/contentSafety.js";
import { improveQuiz } from "../_shared/quizQuality.js";
import { buildSystemInstruction, isJsonMode, JSON_MODES } from "../_shared/systemPrompt.js";
import { billingDecision } from "../_shared/sessionBilling.js";
import {
  createDeadKeyRegistry,
  isDeadKeyError,
  permittedProviderIds,
} from "../_shared/providerPolicy.js";

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

/* Content safety — the topic screen and refusal messages live in
   ../_shared/contentSafety.js so web-research screens with the same rules.
   The Gemini-specific verdict helpers below stay here with the call site. */

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

type ProviderDialect = "openai" | "anthropic";

/* What the key costs the operator. This is documentation that the ordering
   below has to agree with, not a runtime switch: `free` is a standing free
   tier, `credits` is a free allowance that runs out and then bills, `paid`
   bills from the first token. The chain is ordered free → credits → paid so
   that a deployment with every key set still spends nothing until the free
   tiers are exhausted. */
type ProviderCost = "free" | "credits" | "paid";

type AIProvider = {
  id: string;
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
  /* May contain `{account}`, filled from `accountEnv`. A provider whose URL
     needs an account id it hasn't been given is skipped rather than called
     with the placeholder still in the path — see `resolveProviderUrl`. */
  url: string;
  accountEnv?: string;
  /* Request/response shape. Everything here speaks OpenAI's
     /chat/completions except Anthropic, which has its own. */
  dialect?: ProviderDialect;
  extraHeaders?: Record<string, string>;
  /* Whether the provider honours response_format:json_object. Used only for
     quiz/plan generation, where a stray sentence around the JSON is the single
     most common cause of a failed generation. */
  jsonMode: boolean;
  cost: ProviderCost;
};

/* Ordered free-first. The previous order put three providers ahead of every
   free one — and two of them could not have worked:

   - Cloudflare was pointed at `/accounts/me/ai/run/`. Workers AI has no `me`
     alias, that path is not the OpenAI-compatible one, and its model name was
     missing the `@cf/` prefix every Workers AI model carries. Fixed below to
     the documented `/accounts/{account}/ai/v1/chat/completions`.
   - Anthropic was listed as an OpenAI-dialect provider, but `/v1/messages`
     authenticates with `x-api-key`, requires `anthropic-version` and
     `max_tokens`, and returns `content[0].text` rather than
     `choices[0].message.content`. Sending it an OpenAI request got a 401
     every time. It now goes through the Anthropic dialect, and sits with the
     other paid keys at the end.

   Both were dead weight at the front of the chain: every request walked two
   guaranteed failures before reaching a provider that could answer.

   Adding a provider is one entry here plus its key in Supabase secrets, or —
   with no code change at all — one entry in AI_EXTRA_PROVIDERS (below). A
   provider with no key configured is skipped silently, so the chain works
   with however many are set up. */
const BUILTIN_PROVIDERS: AIProvider[] = [
  /* ---- Free tiers, strongest first --------------------------------- */
  {
    // Free tier, rate-limited per minute rather than per token.
    id: "groq",
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    // `llama-3.3-70b-versatile` started returning "does not exist or you do
    // not have access to it" on 2026-09-20. That 404 cannot tell a retired
    // model from a key without access, so the replacement below is the one
    // this project's own key is known to reach rather than a guess from a
    // catalogue. GROQ_MODEL overrides it without a redeploy.
    //
    // Groq names it with its publisher prefix: plain `gpt-oss-120b` (the
    // Cerebras spelling) 404s here as "does not exist", which is what the
    // live logs showed on 2026-09-24. The prefixed ID is the one Groq's
    // models page lists.
    defaultModel: "openai/gpt-oss-120b",
    url: "https://api.groq.com/openai/v1/chat/completions",
    jsonMode: true,
    cost: "free",
  },
  {
    // Free daily allowance on Workers AI. Needs the account id as well as the
    // token — Cloudflare scopes the endpoint per account.
    id: "cloudflare",
    keyEnv: "CLOUDFLARE_API_TOKEN",
    modelEnv: "CLOUDFLARE_MODEL",
    defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    url: "https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1/chat/completions",
    accountEnv: "CLOUDFLARE_ACCOUNT_ID",
    jsonMode: true,
    cost: "free",
  },
  {
    // Free with any GitHub account; needs a PAT with `models: read`.
    id: "github-models",
    keyEnv: "GITHUB_MODELS_TOKEN",
    modelEnv: "GITHUB_MODELS_MODEL",
    defaultModel: "openai/gpt-4.1-mini",
    url: "https://models.github.ai/inference/chat/completions",
    extraHeaders: { "X-GitHub-Api-Version": "2026-03-10" },
    jsonMode: true,
    cost: "free",
  },
  {
    // Free "Experiment" tier. See AI_PROVIDERS.md on its training opt-in
    // before setting this one.
    id: "mistral",
    keyEnv: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
    defaultModel: "mistral-small-latest",
    url: "https://api.mistral.ai/v1/chat/completions",
    jsonMode: true,
    cost: "free",
  },
  {
    // Free `:free` models. Weakest in the chain, so it is the last free stop.
    id: "openrouter",
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    // Two retirements so far: `meta-llama/llama-3-8b-instruct:free` (404 "No
    // endpoints found"), then on 2026-09-20 the `:free` variant of the model
    // below — "This model is unavailable for free. The paid version is
    // available now - use this slug instead: openai/gpt-oss-20b". The slug
    // here is the one that 404 named.
    //
    // Note what dropping `:free` means: this stop now bills. It sits last
    // among the free tier and is only reached when every genuinely free
    // channel above it has failed, which is the trade for the chain having
    // an answer at all.
    defaultModel: "openai/gpt-oss-20b",
    url: "https://openrouter.ai/api/v1/chat/completions",
    extraHeaders: { "HTTP-Referer": "https://learnora.app", "X-Title": "Learnora" },
    jsonMode: false,
    cost: "free",
  },

  /* ---- Free credits that eventually run out ------------------------- */
  {
    // build.nvidia.com hands new accounts a pool of free credits; it bills
    // once they are spent, which is why it sits below the standing free tiers.
    id: "nvidia",
    keyEnv: "NVIDIA_API_KEY",
    modelEnv: "NVIDIA_MODEL",
    defaultModel: "meta/llama-3.3-70b-instruct",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    jsonMode: true,
    cost: "credits",
  },

  /* ---- Paid, and last on purpose ------------------------------------ */
  {
    id: "openai",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    url: "https://api.openai.com/v1/chat/completions",
    jsonMode: true,
    cost: "paid",
  },
  {
    id: "anthropic",
    keyEnv: "CLAUDE_API_KEY",
    modelEnv: "CLAUDE_MODEL",
    defaultModel: "claude-3-5-haiku-20241022",
    url: "https://api.anthropic.com/v1/messages",
    dialect: "anthropic",
    // /v1/messages has no response_format; JSON is asked for in the prompt.
    jsonMode: false,
    cost: "paid",
  },
];

/* Free-tier catalogues churn faster than this function can be redeployed —
   two model IDs in this file were already dead before anyone noticed, and the
   whole `modelEnv` indirection exists for the same reason. AI_EXTRA_PROVIDERS
   extends that one step further: a provider that did not exist when this was
   written can be added as a secret rather than a release.

   Shape: a JSON array, each entry `{ id, keyEnv, defaultModel, url }` plus
   optional `modelEnv`, `jsonMode`, `headers`, `accountEnv`, `dialect`, `cost`.

     AI_EXTRA_PROVIDERS='[{"id":"together","keyEnv":"TOGETHER_API_KEY",
       "defaultModel":"...","url":"https://api.together.xyz/v1/chat/completions"}]'

   Entries are appended, so they are tried after everything above — a new key
   can never displace a known-good one. They go through the same caller as the
   built-ins, which is what keeps the output safety screen applied to them;
   a provider bolted on anywhere else would bypass it. */
function parseExtraProviders(): AIProvider[] {
  const raw = Deno.env.get("AI_EXTRA_PROVIDERS");
  if (!raw || !raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("[providers] AI_EXTRA_PROVIDERS is not valid JSON; ignoring it.", err);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error("[providers] AI_EXTRA_PROVIDERS must be a JSON array; ignoring it.");
    return [];
  }

  const out: AIProvider[] = [];
  for (const entry of parsed as any[]) {
    if (!entry || typeof entry !== "object") continue;
    const { id, keyEnv, defaultModel, url } = entry;
    if (!id || !keyEnv || !defaultModel || !url) {
      console.error("[providers] Skipping AI_EXTRA_PROVIDERS entry missing id/keyEnv/defaultModel/url:", id ?? entry);
      continue;
    }
    // Only https, so a misconfigured secret cannot send student material
    // over plaintext or at a loopback address inside the function's network.
    if (!/^https:\/\//i.test(String(url))) {
      console.error(`[providers] Skipping AI_EXTRA_PROVIDERS entry "${id}": url must be https.`);
      continue;
    }
    out.push({
      id: String(id),
      keyEnv: String(keyEnv),
      modelEnv: String(entry.modelEnv || `${String(id).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_MODEL`),
      defaultModel: String(defaultModel),
      url: String(url),
      accountEnv: entry.accountEnv ? String(entry.accountEnv) : undefined,
      dialect: entry.dialect === "anthropic" ? "anthropic" : "openai",
      extraHeaders: entry.headers && typeof entry.headers === "object" ? entry.headers : undefined,
      jsonMode: entry.jsonMode !== false,
      cost: entry.cost === "paid" || entry.cost === "credits" ? entry.cost : "free",
    });
  }
  return out;
}

/* Built-ins first, operator additions after. Recomputed per request so a
   secret change takes effect without a redeploy. */
function providerChain(): AIProvider[] {
  /* Only providers students were told about (see _shared/providerPolicy.js),
     narrowed further by AI_PROVIDER_ALLOWLIST, and minus any whose key was
     refused recently. An AI_EXTRA_PROVIDERS entry is dropped here unless it
     has first been added to the disclosed list. */
  const permitted = permittedProviderIds(Deno.env.get("AI_PROVIDER_ALLOWLIST"));
  return [...BUILTIN_PROVIDERS, ...parseExtraProviders()].filter(
    (p) => permitted.has(p.id) && !deadKeys.isDead(p.id),
  );
}

/* The configured URL with `{account}` substituted, or null when the provider
   needs an account id that isn't set. Returning null means "skip" — calling
   the URL with the placeholder intact is a guaranteed 404 that costs a
   timeout and buries the real reason in the debug output. */
function resolveProviderUrl(provider: AIProvider): string | null {
  if (!provider.url.includes("{account}")) return provider.url;
  const account = provider.accountEnv ? Deno.env.get(provider.accountEnv) : "";
  if (!account) return null;
  return provider.url.replace("{account}", encodeURIComponent(account));
}

/* Structured JSON takes noticeably longer than a chat turn — a ten-question
   quiz with per-question feedback is a lot of tokens — and the old flat 15s
   abort was cutting those off mid-generation, which surfaced as the
   intermittent "couldn't generate a quiz" failures. */
const TIMEOUT_MS = { chat: 20_000, json: 35_000 };

/* Ceiling for the whole request, so a slow chain returns an honest error
   instead of running until the platform kills it and the client sees a
   connection drop. */
const TOTAL_BUDGET_MS = 55_000;

/* House style, persona, depth and mode instructions: _shared/systemPrompt.js. */

/* `notes` is long-form Markdown, not JSON — it must not get response_format,
   but a full study-notes document is easily as slow as a quiz, so it shares
   the longer budget. */
const SLOW_MODES = new Set([...JSON_MODES, "notes"]);

function timeoutFor(mode: string | undefined): number {
  return mode !== undefined && SLOW_MODES.has(mode) ? TIMEOUT_MS.json : TIMEOUT_MS.chat;
}

/* A response is only usable if it actually carries text. An empty string from
   a provider that returned HTTP 200 used to be passed straight back to the
   client as a successful-but-blank reply; treating it as a failure lets the
   next provider have a go. */
/* Response readers, one per dialect. OpenAI-shaped providers put the text at
   choices[0].message.content; Anthropic returns a content block array, which
   is why routing it through the OpenAI reader returned "empty completion"
   even on the requests that got far enough to be answered at all. */
function extractContent(data: any, dialect: ProviderDialect): string | null {
  if (dialect === "anthropic") {
    const blocks = data?.content;
    if (!Array.isArray(blocks)) return null;
    const text = blocks
      .filter((b: any) => b?.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("");
    return text.trim() === "" ? null : text;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") return null;
  return content;
}

/* Largest completion any mode here asks for. Anthropic's /v1/messages
   requires max_tokens — omitting it is a 400 — and a ten-question quiz with
   per-question feedback needs real headroom. */
const ANTHROPIC_MAX_TOKENS = Number(Deno.env.get("ANTHROPIC_MAX_TOKENS")) || 4096;

/* Builds the request for a provider's dialect. Split out from the caller so
   the two shapes are visible side by side rather than interleaved with the
   fetch/timeout plumbing. */
function buildProviderRequest(
  provider: AIProvider,
  model: string,
  key: string,
  opts: { systemInstruction: string; history: any[]; userContent: string; wantsJson: boolean },
): { headers: Record<string, string>; body: Record<string, unknown> } {
  const priorTurns = (opts.history || []).slice(0, -1).map((m: any) => ({
    role: m.role === "model" ? "assistant" : "user",
    content: m.content,
  }));

  if (provider.dialect === "anthropic") {
    return {
      headers: {
        "x-api-key": key,
        "anthropic-version": Deno.env.get("ANTHROPIC_VERSION") || "2023-06-01",
        "Content-Type": "application/json",
        ...(provider.extraHeaders || {}),
      },
      body: {
        model,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        // The system prompt is a top-level field here, not a message.
        system: opts.systemInstruction,
        messages: [...priorTurns, { role: "user", content: opts.userContent }],
      },
    };
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: opts.systemInstruction },
      ...priorTurns,
      { role: "user", content: opts.userContent },
    ],
  };
  if (opts.wantsJson && provider.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  return {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(provider.extraHeaders || {}),
    },
    body,
  };
}

async function callProvider(
  provider: AIProvider,
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

  const url = resolveProviderUrl(provider);
  if (!url) {
    throw new Error(
      `${provider.accountEnv} is not set in Supabase secrets, and ${provider.id} needs it to build its endpoint URL.`,
    );
  }

  const model = Deno.env.get(provider.modelEnv) || provider.defaultModel;
  const dialect: ProviderDialect = provider.dialect || "openai";
  const { headers, body } = buildProviderRequest(provider, model, key, {
    systemInstruction: opts.systemInstruction,
    history: opts.history,
    userContent: opts.userContent,
    wantsJson: isJsonMode(opts.mode),
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutFor(opts.mode));
  const onParentAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onParentAbort);

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers,
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

    const content = extractContent(data, dialect);
    if (content === null) throw new Error(`${provider.id} returned an empty completion.`);
    return content;
  } finally {
    clearTimeout(timeoutId);
    opts.signal?.removeEventListener("abort", onParentAbort);
  }
}

/* `trigger` is the text that tripped the screen (the student's message or
   the model's answer). Self-harm gets crisis resources instead of the
   general "ask me about your studies" refusal. */
function safetyRefusalResponse(
  mode: string | undefined,
  headers: Record<string, string>,
  trigger = "",
): Response {
  const message = isSelfHarmContent(trigger) ? SELF_HARM_REFUSAL : SAFETY_REFUSAL;
  // JSON-mode callers parse the body as JSON and would render a refusal
  // sentence as a broken quiz, so give them a shape they can reject cleanly
  // and surface the message through the `error` field instead.
  if (isJsonMode(mode)) {
    return new Response(
      JSON.stringify({ error: message, refused: true }),
      { status: 422, headers },
    );
  }
  return new Response(
    JSON.stringify({ text: message, refused: true, modelUsed: "safety-filter" }),
    { headers },
  );
}

/* A photo (a whiteboard, worksheet, textbook page) can only be read by
   Gemini. The text-only chain used to be handed it anyway, with a note that a
   file existed it could not see, and was still asked to write study notes
   from it — which produced confident notes about nothing. An image request
   Gemini did not answer now ends here, with a message that says why. */
const VISION_UNAVAILABLE_MESSAGE =
  "Reading photos needs Learnora's image model, and it isn't available right now. Try again in a few minutes, or paste or type the text instead.";

function isImageAttachment(file: any): boolean {
  return Boolean(file && file.data && /^image\//i.test(String(file.mimeType || "")));
}

/* 4xx rather than 503 so the client shows this sentence as written — a 5xx
   body is flattened into the generic "temporarily unavailable" line. */
function visionUnavailableResponse(headers: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: VISION_UNAVAILABLE_MESSAGE, visionUnavailable: true }),
    { status: 422, headers },
  );
}

/* =========================================================================
   IMAGE GENERATION — mode "image"

   Its own short provider list, deliberately NOT part of the text chain
   above: an image request must never fall through to a text model, and the
   text chain must never spend an image budget. Reached only by the chat's
   "Generate image" chip — an explicit student action. Nothing a model writes
   can trigger it.

   Order: Gemini's image model on the existing GEMINI_API_KEY, Cloudflare
   Workers AI on the existing token, then OpenAI as the paid floor. Model IDs
   come from the environment; the defaults were current on 2026-09-29
   (`gemini-2.5-flash-image` is the GA name — its `-preview` alias is
   deprecated; `flux-1-schnell` has been on Workers AI since 2024;
   `gpt-image-1-mini` at quality "low" is the cheapest OpenAI image).

   There is no output text to screen afterwards, so the student's
   description is screened more strictly than a chat turn
   (`screenImagePrompt`), and a provider's own safety verdict ends the chain
   rather than handing the same prompt to a less filtered model.
   ========================================================================= */

type ImageProvider = {
  id: "gemini" | "cloudflare" | "openai";
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
  accountEnv?: string;
};

const IMAGE_PROVIDERS: ImageProvider[] = [
  {
    id: "gemini",
    keyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_IMAGE_MODEL",
    defaultModel: "gemini-2.5-flash-image",
  },
  {
    id: "cloudflare",
    keyEnv: "CLOUDFLARE_API_TOKEN",
    modelEnv: "CLOUDFLARE_IMAGE_MODEL",
    defaultModel: "@cf/black-forest-labs/flux-1-schnell",
    accountEnv: "CLOUDFLARE_ACCOUNT_ID",
  },
  {
    // Bills from the first image — last on purpose.
    id: "openai",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_IMAGE_MODEL",
    defaultModel: "gpt-image-1-mini",
  },
];

const CHAT_MEDIA_BUCKET = "chat-media";
const IMAGE_TIMEOUT_MS = 40_000;
const MAX_IMAGE_PROMPT_CHARS = 500;
/* Mirrors the bucket's file_size_limit (20260929010000_add_chat_media_bucket.sql). */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/* Wrapped around every description, so a student asking for "the heart"
   gets a textbook figure rather than whatever an image model's default
   style is — and so nothing text-heavy comes back, since image models still
   misspell words they are asked to draw. */
const IMAGE_STYLE_PREFIX =
  "An educational illustration for a secondary-school student: a clean, clearly labelled diagram on a plain white background, in flat colours with simple shapes and a few short labels naming the parts. No paragraphs or blocks of text, no text-heavy layouts, no photorealistic people, and nothing violent, frightening or suggestive. Subject:";

function buildImagePrompt(description: string): string {
  return `${IMAGE_STYLE_PREFIX} ${description.slice(0, MAX_IMAGE_PROMPT_CHARS).trim()}`;
}

/* A provider said no on safety grounds — a verdict, not an outage. */
class ImageSafetyBlock extends Error {}

type GeneratedImage = { bytes: Uint8Array<ArrayBuffer>; mimeType: string };

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* The bytes decide the type, not the provider's label for them: what gets
   stored is only ever a real PNG, JPEG or WebP. */
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

async function requestImage(
  provider: ImageProvider,
  prompt: string,
  signal: AbortSignal,
): Promise<{ image: GeneratedImage; model: string }> {
  const key = Deno.env.get(provider.keyEnv)!;
  const model = Deno.env.get(provider.modelEnv) || provider.defaultModel;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  const onParentAbort = () => controller.abort();
  signal.addEventListener("abort", onParentAbort);

  try {
    let b64: string | null = null;
    let bytes: Uint8Array<ArrayBuffer> | null = null;

    if (provider.id === "gemini") {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`gemini returned ${response.status}: ${JSON.stringify(data?.error ?? {})}`);
      const finish = data?.candidates?.[0]?.finishReason;
      if (isGeminiSafetyBlock(data) || finish === "IMAGE_SAFETY" || finish === "IMAGE_PROHIBITED_CONTENT") {
        throw new ImageSafetyBlock(`gemini ${finish || "blocked"}`);
      }
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const inline = parts.map((p: any) => p?.inlineData ?? p?.inline_data).find((d: any) => d?.data);
      b64 = inline?.data ?? null;
    } else if (provider.id === "cloudflare") {
      const account = Deno.env.get(provider.accountEnv!)!;
      // The model id carries its own slashes (@cf/vendor/name) and is part
      // of the path, so only the account is encoded.
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, steps: 4 }),
        },
      );
      if ((response.headers.get("content-type") || "").startsWith("image/")) {
        if (!response.ok) throw new Error(`cloudflare returned ${response.status}`);
        bytes = new Uint8Array(await response.arrayBuffer());
      } else {
        const data = await response.json().catch(() => null);
        const errors = JSON.stringify(data?.errors ?? data?.error ?? "");
        if (/nsfw|safety|unsafe/i.test(errors)) throw new ImageSafetyBlock("cloudflare nsfw");
        if (!response.ok || data?.success === false) {
          throw new Error(`cloudflare returned ${response.status}: ${errors}`);
        }
        b64 = typeof data?.result?.image === "string" ? data.result.image : null;
      }
    } else {
      const body: Record<string, unknown> = { model, prompt, n: 1, size: "1024x1024" };
      // gpt-image-* always answers in base64 and takes a quality tier;
      // dall-e-* has to be asked for base64 and has different tiers.
      if (model.startsWith("dall-e")) body.response_format = "b64_json";
      else body.quality = "low";
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (data?.error?.code === "moderation_blocked" || /safety system/i.test(String(data?.error?.message))) {
          throw new ImageSafetyBlock("openai moderation_blocked");
        }
        throw new Error(`openai returned ${response.status}: ${JSON.stringify(data?.error ?? {})}`);
      }
      b64 = data?.data?.[0]?.b64_json ?? null;
    }

    if (!bytes && b64) bytes = base64ToBytes(b64);
    if (!bytes || bytes.length === 0) throw new Error(`${provider.id} returned no image.`);
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`${provider.id} returned an image over 5 MB.`);
    const mimeType = sniffImageType(bytes);
    if (!mimeType) throw new Error(`${provider.id} returned something that is not a PNG, JPEG or WebP.`);
    return { image: { bytes, mimeType }, model };
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener("abort", onParentAbort);
  }
}

/* Walks IMAGE_PROVIDERS in order. A missing key is skipped silently, as in
   the text chain; a safety verdict is rethrown and ends the walk. */
async function generateImage(
  prompt: string,
  signal: AbortSignal,
  debugErrors: Record<string, string>,
): Promise<{ image: GeneratedImage; modelUsed: string }> {
  /* Same disclosure policy as the text chain (_shared/providerPolicy.js):
     only providers students were told about, narrowed by
     AI_PROVIDER_ALLOWLIST, minus any whose key was recently refused. */
  const permitted = permittedProviderIds(Deno.env.get("AI_PROVIDER_ALLOWLIST"));
  for (const provider of IMAGE_PROVIDERS) {
    const label = `image:${provider.id}`;
    if (!permitted.has(provider.id) || deadKeys.isDead(provider.id)) {
      debugErrors[label] = "Not permitted by AI_PROVIDER_ALLOWLIST, or its key was recently refused.";
      continue;
    }
    if (!Deno.env.get(provider.keyEnv)) {
      debugErrors[label] = `${provider.keyEnv} is not set in Supabase.`;
      continue;
    }
    if (provider.accountEnv && !Deno.env.get(provider.accountEnv)) {
      debugErrors[label] = `${provider.accountEnv} is not set in Supabase.`;
      continue;
    }
    if (signal.aborted) {
      debugErrors[label] = "Skipped — request budget exhausted.";
      continue;
    }
    try {
      const { image, model } = await requestImage(provider, prompt, signal);
      return { image, modelUsed: `${provider.id}/${model}` };
    } catch (err: any) {
      if (err instanceof ImageSafetyBlock) throw err;
      debugErrors[label] = err?.message || String(err);
      if (isDeadKeyError(debugErrors[label])) deadKeys.markDead(provider.id);
      console.error(`${label} Error:`, err);
    }
  }
  throw new Error("No image provider answered.");
}

const EXTENSION_FOR: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/* =========================================================================
   RATE LIMITING

   Every mode here spends a token budget against Learnora's own provider
   keys, most of which are free-tier and quota-limited account-wide, not
   per-user — a single runaway client (a retry loop with no backoff, or a
   deliberately abusive one) could exhaust that shared quota for every other
   student in minutes, and nothing before this caught it.

   Two checks, on two different axes:

   1. **Burst**, per user across every tool — protects Learnora's shared
      provider keys from a runaway client. One request every 20s sustained is
      plenty for a human; a scripted retry loop hits the ceiling in seconds.
   2. **Daily, per tool** — the actual product boundary. Each tool (chat,
      notes, flashcards, quiz, plan, and the five differentiator tools) has
      its own allowance per plan, so a flashcard-heavy afternoon cannot
      silently spend the day's chat budget or vice versa. Kept in step with
      QUOTAS in webapp/src/lib/entitlements.ts — the client shows the
      numbers, this enforces them; a value in the browser is not a payment.

   Both are overridable via secrets without a redeploy, same pattern as the
   provider model overrides above (burst only — the per-tool table below has
   too many cells to sanely expose as forty separate env vars; edit
   AI_TOOL_QUOTAS directly and redeploy if it ever needs to change without a
   client release).
   ========================================================================= */

const RATE_LIMIT_MAX = Number(Deno.env.get("AI_RATE_LIMIT_MAX")) || 30;
/* Paid accounts get a higher burst ceiling than free — this exists only to
   protect Learnora's shared provider quota from a runaway client, and is
   separate from the per-tool daily allowance below on purpose: raising one to
   sell a plan should never quietly weaken the other. */
const RATE_LIMIT_MAX_PLUS = Number(Deno.env.get("AI_RATE_LIMIT_MAX_PLUS")) || 60;
const RATE_LIMIT_MAX_PRO = Number(Deno.env.get("AI_RATE_LIMIT_MAX_PRO")) || 90;
const RATE_LIMIT_WINDOW_MS = (Number(Deno.env.get("AI_RATE_LIMIT_WINDOW_MINUTES")) || 10) * 60_000;

type Plan = "free" | "plus" | "pro";

/** The tool identifier the client sends (see `AiToolId` in
 *  webapp/src/lib/entitlements.ts). A call with no `tool` — an older client
 *  build, or a caller not yet migrated — is billed to "chat", the general
 *  utility bucket, rather than rejected outright. */
const DEFAULT_TOOL = "chat";

/* One row per plan, one column per tool. Kept in step with QUOTAS in
   webapp/src/lib/entitlements.ts by hand — there is no shared import between
   a Deno edge function and the Vite webapp, so a change to one that is not
   mirrored in the other silently drifts. Both sides describe the same rule:
   only the number here is what actually stops a request. */
const AI_TOOL_QUOTAS: Record<Plan, Record<string, number>> = {
  free: {
    chat: 15, notes: 3, flashcards: 3, quiz: 3, plan: 1,
    debugger: 2, preMortem: 2, feynman: 2, examDeconstructor: 2,
    sparring: 2, notebookStudio: 5, image: 2,
  },
  plus: {
    chat: 60, notes: 10, flashcards: 10, quiz: 10, plan: 3,
    debugger: 8, preMortem: 6, feynman: 8, examDeconstructor: 6,
    sparring: 8, notebookStudio: 20, image: 10,
  },
  pro: {
    chat: 200, notes: 30, flashcards: 30, quiz: 30, plan: 7,
    debugger: 25, preMortem: 20, feynman: 25, examDeconstructor: 20,
    sparring: 25, notebookStudio: 60, image: 30,
  },
};

const DAILY_LIMIT_MESSAGE_FREE =
  "You've used today's allowance for this tool on the free plan. It resets at midnight — or Learnora Plus/Pro raises the limit.";
const DAILY_LIMIT_MESSAGE_PAID =
  "You've hit today's allowance for this tool. It resets at midnight.";
const RATE_LIMIT_MESSAGE =
  "You're sending requests faster than I can keep up with. Wait a few minutes and try again.";

function rateLimitResponse(
  mode: string | undefined,
  headers: Record<string, string>,
  message: string = RATE_LIMIT_MESSAGE,
): Response {
  if (isJsonMode(mode)) {
    return new Response(
      JSON.stringify({ error: message, refused: true }),
      { status: 429, headers },
    );
  }
  return new Response(
    JSON.stringify({ text: message, refused: true, modelUsed: "rate-limit" }),
    { status: 429, headers },
  );
}

/* Counts this user's own accepted requests and logs the current one — via
 * the same client the auth gate already built with the caller's JWT, so RLS
 * (owner-only select/insert on ai_request_log) does the actual enforcement;
 * this is just the query shape around it. Fails open on a database error: a
 * rate limiter that takes AI outages down with it trades one small risk (a
 * burst slips through while the table is unreachable) for a much worse one
 * (AI goes fully offline because a side-table had a bad moment). */
type RateLimitVerdict =
  | { allowed: true; logId?: string }
  | { allowed: false; message: string };

/** Providers whose key or billing was refused (401/402/403), skipped for a
 *  while in this instance rather than costing every request a round trip. */
const deadKeys = createDeadKeyRegistry();

/** Gemini sits outside the chain (it reads attachments), so it is checked
 *  against the same policy separately. */
function geminiPermitted(): boolean {
  return (
    permittedProviderIds(Deno.env.get("AI_PROVIDER_ALLOWLIST")).has("gemini") &&
    !deadKeys.isDead("gemini")
  );
}

/* Which provider and model answered, how long it took and which providers
   failed first, written onto the request's own log row. ai_request_log held
   only the tool and time, so a provider outage, a dead key or a slow model
   was invisible except by reading raw function logs. Best-effort and not
   awaited by the response: a failed write must never cost the student their
   answer. Service role, because students have no UPDATE on the table. */
function recordOutcome(
  logId: string | undefined,
  outcome: { provider: string; model: string; startedAt: number; failed: string[] },
): void {
  if (!logId) return;
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return;
  const work = (async () => {
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const admin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await admin
        .from("ai_request_log")
        .update({
          provider: outcome.provider,
          model: outcome.model,
          latency_ms: Date.now() - outcome.startedAt,
          failed_providers: outcome.failed,
        })
        .eq("id", logId);
    } catch (err) {
      console.warn("[ai-log] outcome not recorded", err);
    }
  })();
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(work);
}

/* A request that reached no provider at all (every channel failed) has not
   used the student's allowance, so its log row is taken back. A student on
   the free plan has three quiz generations a day; an outage should not spend
   them. Done with the service role because students have no DELETE on
   ai_request_log — deliberately, or deleting rows would reset their quota. */
async function refundRequest(logId: string | undefined): Promise<void> {
  if (!logId) return;
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return;
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from("ai_request_log").delete().eq("id", logId);
  } catch (err) {
    console.error("[rate-limit] refund failed", err);
  }
}

/* A JSON-mode reply that does not parse is useless to the client, which
   would show "couldn't generate" after the allowance was already spent.
   Treated as that provider failing, so the chain moves on. */
function isParsableJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/* A JSON-mode reply that is a prose refusal is a verdict, not a malformed
   answer: moving on to the next, less-filtered provider is how unsafe quizzes
   were generated before. */
function looksLikeRefusal(text: string): boolean {
  return /\b(?:can(?:no|')t|unable to|won't|will not|not able to)\s+(?:help|assist|provide|create|generate|make|write)\b/i
    .test(text.slice(0, 400));
}

/* The JSON inside a reply that wrapped it in prose ("Here is your quiz: {…}"),
   the same salvage the client parsers already attempt. Returns the text
   unchanged when it already parses, and null when nothing inside it does. */
function salvageJson(text: string): string | null {
  if (isParsableJson(text)) return text;
  for (const [open, close] of [["{", "}"], ["[", "]"]]) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start !== -1 && end > start) {
      const slice = text.slice(start, end + 1);
      if (isParsableJson(slice)) return slice;
    }
  }
  return null;
}

/* App-authored context arrives separately from the student's message; this
   bounds it so a hand-built request can't send a novel. */

/** This caller's plan right now.
 *
 * Read through the caller's own JWT'd client, so RLS guarantees they can only
 * see their own row and there is no user id to get wrong. Fails to "free" on
 * any error or an unrecognised plan string, which is the safe direction: the
 * worst case is a paying user briefly held to the free ceiling, rather than
 * the ceiling not existing. */
async function getUserPlan(supabase: any, userId: string): Promise<Plan> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("plan, plan_status")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return "free";
    const entitled = ["active", "trialing", "past_due"].includes(data.plan_status);
    if (!entitled) return "free";
    return data.plan === "plus" || data.plan === "pro" ? data.plan : "free";
  } catch {
    return "free";
  }
}

/* A Study session makes several AI calls — Explain plans and then writes a
   check, Socratic asks four questions and scores each answer, Teach grades
   every explanation. The daily allowance was counted per call, so the free
   plan's 2 a day meant one Explain session, and Socratic ran out after the
   first answer. Calls that carry the same session key now count once
   against the allowance, up to SESSION_CALL_CAP calls; the allowance is
   therefore "sessions a day" for these tools. */
const SESSION_CALL_CAP = Number(Deno.env.get("AI_SESSION_CALL_CAP")) || 16;
const SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{6,80}$/;
const SESSION_CAP_MESSAGE =
  "This study session has had all the AI help it can today. Start a new session to keep going — your work here is saved.";

async function checkAndLogRateLimit(
  supabase: any,
  userId: string,
  mode: string | undefined,
  tool: string | undefined,
  rawSessionKey?: unknown,
): Promise<RateLimitVerdict> {
  const sessionKey =
    typeof rawSessionKey === "string" && SESSION_KEY_PATTERN.test(rawSessionKey)
      ? rawSessionKey
      : null;
  /* `tool` comes from the request body. The daily count is per tool name, so
     an unrecognised name must not become a fresh allowance of its own — any
     client could otherwise send "x1", "x2", … and never reach a daily limit.
     Unknown or missing names are billed as chat. */
  const billedTool =
    tool && Object.hasOwn(AI_TOOL_QUOTAS.free, tool) ? tool : DEFAULT_TOOL;
  try {
    const plan = await getUserPlan(supabase, userId);
    const burstMax = plan === "pro"
      ? RATE_LIMIT_MAX_PRO
      : plan === "plus"
      ? RATE_LIMIT_MAX_PLUS
      : RATE_LIMIT_MAX;
    const dailyMax = AI_TOOL_QUOTAS[plan][billedTool] ?? AI_TOOL_QUOTAS[plan][DEFAULT_TOOL];

    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count, error: countError } = await supabase
      .from("ai_request_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);

    if (countError) {
      console.error("[rate-limit] count query failed, failing open", countError);
      return { allowed: true };
    }

    if ((count ?? 0) >= burstMax) {
      console.warn("[rate-limit] burst blocked", { userId, mode, tool: billedTool, count, plan });
      return { allowed: false, message: RATE_LIMIT_MESSAGE };
    }

    /* The daily allowance, counted from midnight UTC, per tool. UTC rather
       than the student's own timezone because this is a machine boundary,
       not a calendar promise — the alternative is reading profiles.timezone
       and explaining to a traveller why their allowance reset twice. */
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const { data: todayRows, error: dailyError } = await supabase
      .from("ai_request_log")
      .select("session_key")
      .eq("user_id", userId)
      .eq("tool", billedTool)
      .gte("created_at", midnight.toISOString())
      .limit(1000);
    const rows: { session_key: string | null }[] = dailyError ? [] : (todayRows ?? []);
    const verdict = billingDecision(rows, sessionKey, dailyMax, SESSION_CALL_CAP);

    if (!dailyError && !verdict.allowed && verdict.reason === "session") {
      console.warn("[rate-limit] session cap", { userId, tool: billedTool, plan });
      return { allowed: false, message: SESSION_CAP_MESSAGE };
    }

    if (!dailyError && !verdict.allowed) {
      console.warn("[rate-limit] daily blocked", { userId, mode, tool: billedTool, plan });
      return {
        allowed: false,
        message: plan === "free" ? DAILY_LIMIT_MESSAGE_FREE : DAILY_LIMIT_MESSAGE_PAID,
      };
    }

    const { data: logRow, error: insertError } = await supabase
      .from("ai_request_log")
      .insert({ user_id: userId, mode: mode ?? null, tool: billedTool, session_key: sessionKey })
      .select("id")
      .single();
    if (insertError) {
      console.error("[rate-limit] log insert failed (request still allowed)", insertError);
    }

    return { allowed: true, logId: logRow?.id };
  } catch (err) {
    console.error("[rate-limit] unexpected failure, failing open", err);
    return { allowed: true };
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
    // Consent to send study data to the AI providers. Only an explicit
    // "false" refuses: accounts created before the flag existed carry no key
    // and keep the access they have always had. Mirrors webapp/src/lib/
    // aiConsent.ts, which asks the student before a request gets this far;
    // this is the half a hand-built request cannot skip.
    if (user.user_metadata?.consent_given === false) {
        return new Response(
            JSON.stringify({
                error: "Learnora's AI needs your OK before it can use your study data. You can turn it on any time in Settings ▸ Privacy.",
                consent_required: true,
            }),
            { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
    }
    // ── END AUTH GATE ──────────────────────────────────────

    const debugErrors: Record<string, string> = {};
    const startedAt = Date.now();
    let logId: string | undefined;

    try {
        const { history, file, settings, mode, tool, context, sessionKey } = await req.json();
        const s = settings || {};

        /* Instructions and workspace data written by the app, kept out of the
           student's turn so a student's "ignore the rules above" has no more
           standing than any other message. Placed before the content policy,
           which therefore always has the last word. */
        const systemInstruction = buildSystemInstruction({ settings: s, mode, context });

        const currentMsg = history && history.length > 0 ? history[history.length - 1].content : "";

        const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };

        // Rate limit before spending a token, same as the safety screen
        // below — this is the cheap check that protects the expensive
        // resource. Checked (and logged) ahead of the safety screen so a
        // flood of unsafe-topic probes counts against the sender's budget
        // too, rather than getting a free pass because they were refused.
        /* An image is billed as an image whatever `tool` claims — otherwise a
           hand-built request could spend the far larger chat allowance on
           image generation. Nor is an empty description worth an allowance. */
        if (mode === "image" && !String(currentMsg || "").trim()) {
            return new Response(
                JSON.stringify({ error: "Describe the picture you want first." }),
                { status: 400, headers: jsonHeaders },
            );
        }
        const rateLimit = await checkAndLogRateLimit(
            supabase, user.id, mode, mode === "image" ? "image" : tool, sessionKey,
        );
        if (!rateLimit.allowed) {
            return rateLimitResponse(mode, jsonHeaders, rateLimit.message);
        }
        logId = rateLimit.logId;

        // Screen before spending a token. `history` carries the workspace
        // context prelude, so the newest turn is screened on its own and
        // earlier turns only to catch a follow-up on an unsafe topic.
        if (screenConversation(history)) {
            console.warn("[safety] Request refused by pre-flight topic screen", { mode, userId: user.id });
            return safetyRefusalResponse(mode, jsonHeaders, currentMsg);
        }

        if (mode === "image") {
            const description = String(currentMsg).slice(0, MAX_IMAGE_PROMPT_CHARS).trim();
            if (screenImagePrompt(description)) {
                console.warn("[safety] image description refused by screen", { userId: user.id });
                return safetyRefusalResponse(mode, jsonHeaders, description);
            }
            let generated: { image: GeneratedImage; modelUsed: string };
            try {
                generated = await generateImage(
                    buildImagePrompt(description),
                    AbortSignal.timeout(TOTAL_BUDGET_MS),
                    debugErrors,
                );
            } catch (err) {
                if (err instanceof ImageSafetyBlock) {
                    console.warn("[safety] image provider refused", { userId: user.id, reason: err.message });
                    return safetyRefusalResponse(mode, jsonHeaders, description);
                }
                throw err; // refunded and reported by the outer catch
            }

            /* Stored with the student's own JWT, so the bucket's insert policy
               — not this code — decides the path is theirs. Only the key
               goes back to the client; it reads it through a signed URL. */
            const { mimeType, bytes } = generated.image;
            const imagePath = `${user.id}/${crypto.randomUUID()}.${EXTENSION_FOR[mimeType]}`;
            const { error: uploadError } = await supabase.storage
                .from(CHAT_MEDIA_BUCKET)
                .upload(imagePath, new Blob([bytes], { type: mimeType }), {
                    contentType: mimeType,
                    upsert: false,
                });
            if (uploadError) throw new Error(`chat-media upload failed: ${uploadError.message}`);

            const alt = `Diagram: ${description}`;
            const [imageProvider, ...imageModel] = generated.modelUsed.split("/");
            recordOutcome(logId, {
                provider: imageProvider,
                model: imageModel.join("/"),
                startedAt,
                failed: Object.keys(debugErrors).filter((id) => !/not set|Skipped|Not permitted/.test(debugErrors[id])),
            });
            return new Response(JSON.stringify({
                text: alt,
                alt,
                imagePath,
                mimeType,
                modelUsed: generated.modelUsed,
            }), { headers: jsonHeaders });
        }

        // Bounds the whole chain. Without it a run of slow providers keeps the
        // function alive until the platform kills it, which reaches the client
        // as a dropped connection rather than a usable error.
        const deadline = AbortSignal.timeout(TOTAL_BUDGET_MS);
        const budgetExhausted = () => deadline.aborted;

        /* A second opinion on a generated quiz (see _shared/quizQuality.js):
           Gemini first, then one fallback provider. Best-effort — skipped when
           the request is too close to its budget, and any failure returns null
           so the quiz goes out unverified rather than not at all. */
        const verifyQuiz = async (system: string, prompt: string): Promise<string | null> => {
            if (TOTAL_BUDGET_MS - (Date.now() - startedAt) < 12_000) return null;
            const checkKey = geminiPermitted() ? Deno.env.get('GEMINI_API_KEY') : undefined;
            if (checkKey) {
                try {
                    const modelName = (Deno.env.get('GEMINI_MODELS') || "gemini-3.6-flash")
                        .split(",")[0].trim();
                    const checker = new GoogleGenerativeAI(checkKey)
                        .getGenerativeModel({ model: modelName, systemInstruction: system });
                    const result: any = await Promise.race([
                        checker.generateContent(prompt),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error("quiz check timed out")), 20_000)
                        ),
                    ]);
                    const checked = salvageJson(cleanJsonResponse(result.response.text()));
                    if (checked) return checked;
                } catch (err) {
                    console.warn("[quiz-check] Gemini check failed", err);
                }
            }
            for (const provider of providerChain()) {
                if (!Deno.env.get(provider.keyEnv) || !resolveProviderUrl(provider)) continue;
                if (budgetExhausted()) return null;
                try {
                    const checked = salvageJson(cleanJsonResponse(await callProvider(provider, {
                        systemInstruction: system,
                        history: [{ role: "user", content: prompt }],
                        userContent: prompt,
                        mode: "quiz",
                        signal: deadline,
                    })));
                    if (checked) return checked;
                } catch (err) {
                    console.warn(`[quiz-check] ${provider.id} check failed`, err);
                }
                // One fallback attempt is enough for a best-effort check.
                return null;
            }
            return null;
        };

        /* Only the quiz generator itself: other tools send mode "quiz" purely
           for its JSON handling and have their own shapes. */
        const finishText = async (text: string): Promise<string> =>
            mode === "quiz" && tool === "quiz" ? await improveQuiz(text, verifyQuiz) : text;

        // =========================================================================
        // CHANNEL 1: GEMINI — first because it is the only provider in the chain
        // that reads an image/PDF attachment inline.
        // =========================================================================
        const geminiKey = geminiPermitted() ? Deno.env.get('GEMINI_API_KEY') : undefined;
        if (geminiKey) {
            // Retired models are dropped rather than guessed at: 1.5-flash
            // went first ("not found for API version v1beta"), and on
            // 2026-09-20 gemini-2.0-flash followed, with the API's own 404
            // naming gemini-3.6-flash as the replacement — which is where
            // this value comes from rather than from a release note.
            //
            // That outage was total, not partial. Every other channel was
            // down at the same moment (spent credits, retired models, a
            // provider brownout), so the chain had nothing left to fall back
            // to and every student request failed for two weeks.
            // GEMINI_MODELS overrides this without a redeploy.
            const geminiModels = (Deno.env.get('GEMINI_MODELS') || "gemini-3.6-flash")
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
                        return safetyRefusalResponse(mode, jsonHeaders, currentMsg);
                    }

                    let text = result.response.text();
                    if (isJsonMode(mode)) {
                        text = cleanJsonResponse(text);
                    }
                    if (!text || !text.trim()) throw new Error(`Gemini (${modelName}) returned empty text`);
                    if (isJsonMode(mode)) {
                        const salvaged = salvageJson(text);
                        if (salvaged === null) {
                            if (looksLikeRefusal(text)) {
                                return safetyRefusalResponse(mode, jsonHeaders, currentMsg);
                            }
                            throw new Error(`Gemini (${modelName}) returned JSON that does not parse`);
                        }
                        text = salvaged;
                    }

                    // Gemini's own filters let the formula of methamphetamine
                    // through, so its output gets the same screen as the
                    // fallbacks. A hit is a verdict: return the refusal rather
                    // than trying the next model or provider.
                    if (screenForUnsafeContent(text)) {
                        console.warn(`[safety] ${modelName} output refused by screen`, { mode, userId: user.id });
                        return safetyRefusalResponse(mode, jsonHeaders, `${currentMsg}\n${text}`);
                    }

                    text = await finishText(text);

                    recordOutcome(logId, {
                        provider: "gemini",
                        model: modelName,
                        startedAt,
                        failed: Object.keys(debugErrors),
                    });
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
                        return safetyRefusalResponse(mode, jsonHeaders, currentMsg);
                    }
                    debugErrors[`gemini (${modelName})`] = err.message || String(err);
                    // The SDK words a refused key as "[403 Forbidden] …".
                    if (/\[(401|402|403)\b/.test(String(err?.message ?? ""))) deadKeys.markDead("gemini");
                    console.error(`Gemini (${modelName}) Error:`, err);
                }
            }
        } else {
            debugErrors["gemini"] = "GEMINI_API_KEY secret is not set in Supabase.";
        }

        // Nothing below this line can see an image — see isImageAttachment.
        // The allowance is handed back: no provider read the photo.
        if (isImageAttachment(file)) {
            console.warn("[vision] no image-capable provider answered", { mode, debugErrors });
            await refundRequest(logId);
            return visionUnavailableResponse(jsonHeaders);
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
        for (const provider of providerChain()) {
            if (!Deno.env.get(provider.keyEnv)) {
                debugErrors[provider.id] = `${provider.keyEnv} is not set in Supabase.`;
                continue;
            }
            if (!resolveProviderUrl(provider)) {
                debugErrors[provider.id] =
                    `${provider.accountEnv} is not set in Supabase, and ${provider.id} needs it to build its endpoint URL.`;
                continue;
            }
            if (budgetExhausted()) {
                debugErrors[provider.id] = "Skipped — request budget exhausted.";
                continue;
            }

            try {
                let text = await callProvider(provider, {
                    systemInstruction,
                    history,
                    userContent: fallbackMsg,
                    mode,
                    signal: deadline,
                });

                if (isJsonMode(mode)) {
                    const salvaged = salvageJson(cleanJsonResponse(text));
                    if (salvaged === null) {
                        if (looksLikeRefusal(text)) {
                            return safetyRefusalResponse(mode, jsonHeaders, currentMsg);
                        }
                        throw new Error(`${provider.id} returned JSON that does not parse`);
                    }
                    text = salvaged;
                }

                // None of these providers has a safety layer comparable to
                // Gemini's, so their output is screened before it is returned.
                if (screenForUnsafeContent(text)) {
                    console.warn(`[safety] ${provider.id} output refused by screen`, { mode, userId: user.id });
                    return safetyRefusalResponse(mode, jsonHeaders, `${currentMsg}\n${text}`);
                }

                text = await finishText(text);

                recordOutcome(logId, {
                    provider: provider.id,
                    model: Deno.env.get(provider.modelEnv) || provider.defaultModel,
                    startedAt,
                    failed: Object.keys(debugErrors).filter((id) => !/not set|Skipped/.test(debugErrors[id])),
                });
                return new Response(JSON.stringify({
                    text,
                    modelUsed: `${provider.id}/${Deno.env.get(provider.modelEnv) || provider.defaultModel}`
                }), {
                    headers: jsonHeaders
                });
            } catch (err: any) {
                debugErrors[provider.id] = err.message || String(err);
                if (isDeadKeyError(debugErrors[provider.id])) deadKeys.markDead(provider.id);
                console.error(`${provider.id} Error:`, err);
            }
        }

        throw new Error("All AI channels offline.");

    } catch (err: any) {
        console.error("AI pipeline failure", {
            debugErrors,
            error: err.message || String(err),
        });
        // No provider answered, so the allowance this request took is returned.
        await refundRequest(logId);

        return new Response(JSON.stringify({
            error: "AI is temporarily unavailable. Please try again in a moment."
        }), {
            status: 503,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
});
