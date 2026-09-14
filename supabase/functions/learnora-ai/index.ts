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
    // ~1M tokens/day, and the fastest inference in the chain.
    id: "cerebras",
    keyEnv: "CEREBRAS_API_KEY",
    modelEnv: "CEREBRAS_MODEL",
    defaultModel: "gpt-oss-120b",
    url: "https://api.cerebras.ai/v1/chat/completions",
    jsonMode: true,
    cost: "free",
  },
  {
    // Free tier, rate-limited per minute rather than per token.
    id: "groq",
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModel: "llama-3.3-70b-versatile",
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
    // `meta-llama/llama-3-8b-instruct:free` was retired from OpenRouter's
    // catalog (404 "No endpoints found") — replaced with a model confirmed
    // live against https://openrouter.ai/api/v1/models on 2026-08-01.
    defaultModel: "openai/gpt-oss-20b:free",
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
  return [...BUILTIN_PROVIDERS, ...parseExtraProviders()];
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
    sparring: 2, notebookStudio: 5,
  },
  plus: {
    chat: 60, notes: 10, flashcards: 10, quiz: 10, plan: 3,
    debugger: 8, preMortem: 6, feynman: 8, examDeconstructor: 6,
    sparring: 8, notebookStudio: 20,
  },
  pro: {
    chat: 200, notes: 30, flashcards: 30, quiz: 30, plan: 7,
    debugger: 25, preMortem: 20, feynman: 25, examDeconstructor: 20,
    sparring: 25, notebookStudio: 60,
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
type RateLimitVerdict = { allowed: true } | { allowed: false; message: string };

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

async function checkAndLogRateLimit(
  supabase: any,
  userId: string,
  mode: string | undefined,
  tool: string | undefined,
): Promise<RateLimitVerdict> {
  const billedTool = tool || DEFAULT_TOOL;
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
    const { count: today, error: dailyError } = await supabase
      .from("ai_request_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("tool", billedTool)
      .gte("created_at", midnight.toISOString());

    if (!dailyError && (today ?? 0) >= dailyMax) {
      console.warn("[rate-limit] daily blocked", { userId, mode, tool: billedTool, today, plan });
      return {
        allowed: false,
        message: plan === "free" ? DAILY_LIMIT_MESSAGE_FREE : DAILY_LIMIT_MESSAGE_PAID,
      };
    }

    const { error: insertError } = await supabase
      .from("ai_request_log")
      .insert({ user_id: userId, mode: mode ?? null, tool: billedTool });
    if (insertError) {
      console.error("[rate-limit] log insert failed (request still allowed)", insertError);
    }

    return { allowed: true };
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
    // ── END AUTH GATE ──────────────────────────────────────

    const debugErrors: Record<string, string> = {};

    try {
        const { history, file, settings, mode, tool } = await req.json();
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
        const depthMap: Record<number, string> = {
            1: 'Give a quick intuitive explanation with one simple example.',
            2: 'Explain the conceptual foundations before applying them.',
            3: 'Use standard course-level depth with enough working to follow.',
            4: 'Include advanced analysis, assumptions, and important edge cases.',
            5: 'Use deep academic treatment with formal reasoning or derivations where relevant.',
        };
        const studyStyleMap: Record<string, string> = {
            visual: 'Prefer spatial descriptions, mental models, and concrete analogies.',
            rigorous: 'Prefer explicit steps, definitions, and mathematically precise reasoning.',
            exam_trap: 'Highlight common mistakes, marking points, and misleading exam wording.',
            concise: 'Prioritise dense key points and omit non-essential framing.',
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
    DEPTH: ${depthMap[Number(s.aiDepth)] || depthMap[3]}
    STUDY STYLE: ${studyStyleMap[s.aiStyle] || studyStyleMap.concise}

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
        const rateLimit = await checkAndLogRateLimit(supabase, user.id, mode, tool);
        if (!rateLimit.allowed) {
            return rateLimitResponse(mode, jsonHeaders, rateLimit.message);
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
