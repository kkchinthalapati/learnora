import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

/* Origins allowed to call this function from a browser.

   This was a single hard-coded 'https://learnora.app', which no longer serves
   the app — production is on the Vercel domain below. Allow-Origin is matched
   as an exact string, so every browser call was being rejected before the
   response was exposed, and the app saw a bare "Failed to fetch". CORS is not
   the security boundary here (the JWT gate below is), but a mismatch still
   takes the whole AI offline.

   Set ALLOWED_ORIGINS (comma-separated) to add a domain without a code change,
   e.g. when a custom domain is attached. */
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

/* Echoes the caller's origin when it is on the list. Vercel preview
   deployments get a fresh subdomain per build, so those are matched by
   pattern rather than needing to be enumerated. */
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const list = allowedOrigins();
  const isPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin) &&
    /learnora|study-planner/i.test(origin);
  const allow = list.includes(origin) || isPreview ? origin : list[0];

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
    defaultModel: "meta-llama/llama-3-8b-instruct:free",
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

function timeoutFor(mode: string | undefined): number {
  return mode === "quiz" || mode === "plan" ? TIMEOUT_MS.json : TIMEOUT_MS.chat;
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
  const wantsJson = opts.mode === "quiz" || opts.mode === "plan";

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
  // Quiz/plan callers parse the body as JSON and would render a refusal
  // sentence as a broken quiz, so give them a shape they can reject cleanly
  // and surface the message through the `error` field instead.
  if (mode === "quiz" || mode === "plan") {
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
            tutor: 'a patient, explanatory, supportive tutor'
        };

        const modeInstructions = mode === "plan"
            ? `\nYou are generating a weekly study schedule. Output ONLY raw JSON (no prose, no code fences) matching this shape: {"days":[{"date":"YYYY-MM-DD","blocks":[{"startHint":"morning|afternoon|evening","durationMins":45,"subject":"string","reason":"string","examId":null,"taskId":null}]}],"summary":"one-sentence summary of the week's priorities"}.`
            : mode === "quiz"
            // Wrapped in an object rather than a bare array so the request can
            // use response_format:json_object, which only permits an object at
            // the top level. The client accepts either shape.
            ? `\nYou are generating a high-quality multiple-choice quiz. Ensure every question covers a completely unique concept, logical sub-step, or angle with NO back-to-back repetitive questions. Match the requested difficulty level precisely (Hard = multi-step deduction, error spotting, edge cases, subtle fallacies; Easy = direct recall; Medium = conceptual understanding). Output ONLY raw JSON (no prose, no code fences) matching this shape: {"questions":[{"question":"string","choices":["a","b","c","d"],"correctIndex":0,"topic":"short topic label","feedback":"string"}]}. "correctIndex" is REQUIRED on every question and must be the 0-based index of the correct entry in that question's "choices" array.`
            : "";

        const systemInstruction = `You are Learnora AI. Act as ${personaMap[s.aiPersona] || personaMap.tutor}.
    Keep response ${s.aiConciseness === 'short' ? 'brief' : 'detailed'}. Use ${s.aiLanguage || 'English'}.

    VOICE — refer to yourself in the first person, always. Say "I can help you with that", never "Learnora can help you with that" or "Learnora AI thinks". Use the name "Learnora" only for the product itself (its tabs, features and screens), never as a stand-in for "I", and never describe yourself in the third person. Stay in this voice for the whole conversation, including the first message.

    CONTENT POLICY — Learnora is a study tool used by students aged 13 and up. Refuse, in any mode including quiz and flashcard generation, to produce content that:
    - explains how to make, acquire, modify or deploy weapons, explosives, or incendiary devices;
    - explains how to synthesise, cultivate, obtain or conceal illegal drugs, or presents recreational drug use as harmless or aspirational;
    - describes methods of suicide, self-harm, or harming another person, or how to poison someone;
    - is sexual content, or any sexual content involving minors;
    - promotes hatred or violence against a group, or helps someone evade law enforcement.
    Academic study of these subjects is fine at the level a syllabus would cover — the pharmacology of addiction, the chemistry of combustion, the history of a conflict, public-health harm reduction. What you must never provide is operational instruction, a recipe, or anything that reads as encouragement.
    When a request crosses that line, refuse briefly and warmly, say why in one sentence, and offer a legitimate study angle instead. Do not produce a partial answer, and do not hide the refusal inside a quiz question. If you are generating JSON and must refuse, return an empty array [] rather than unsafe questions.

    If asked for flashcards, output ONLY raw JSON: [{"front":"...", "back":"..."}].${modeInstructions}`;

        const currentMsg = history && history.length > 0 ? history[history.length - 1].content : "";

        // Screen before spending a token. `history` carries the workspace
        // context prelude, so only the newest turn is checked here.
        const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };
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
            const geminiModels = (Deno.env.get('GEMINI_MODELS') || "gemini-2.0-flash,gemini-1.5-flash")
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
                    if (mode === "quiz" || mode === "plan") {
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

        // Text-only providers can't take the attachment inline, so its decoded
        // contents are folded into the prompt instead.
        let fallbackMsg = currentMsg;
        if (file && file.data) {
            try {
                const decodedText = decodeBase64UTF8(file.data);
                fallbackMsg += `\n\n[Attached File Content: ${file.name || "file"}]\n${decodedText}`;
            } catch (_) { }
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

                if (mode === "quiz" || mode === "plan") {
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
