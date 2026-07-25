import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://learnora.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
            ? `\nYou are generating a high-quality multiple-choice quiz. Ensure every question covers a completely unique concept, logical sub-step, or angle with NO back-to-back repetitive questions. Match the requested difficulty level precisely (Hard = multi-step deduction, error spotting, edge cases, subtle fallacies; Easy = direct recall; Medium = conceptual understanding). Output ONLY raw JSON (no prose, no code fences): [{"question":"string","choices":["a","b","c","d"],"correctIndex":0,"topic":"short topic label","feedback":"string"}].`
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

        // =========================================================================
        // CHANNEL 1: GEMINI (Sequential: 2.0 Flash -> 1.5 Flash)
        // =========================================================================
        const geminiKey = Deno.env.get('GEMINI_API_KEY');
        if (geminiKey) {
            const geminiModels = ["gemini-2.0-flash", "gemini-1.5-flash"];
            const genAI = new GoogleGenerativeAI(geminiKey);

            const chatHistory = (history || []).slice(0, -1).map((m: any) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));

            for (const modelName of geminiModels) {
                try {
                    const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });

                    const chat = model.startChat({ history: chatHistory });

                    const payload = file && file.data ? [
                        currentMsg,
                        { inlineData: { data: file.data, mimeType: file.mimeType } }
                    ] : currentMsg;

                    const result = await chat.sendMessage(payload);

                    // A safety block is a verdict, not an outage. Returning it
                    // here stops the fallback chain: previously this threw,
                    // was swallowed as a generic error, and the same prompt was
                    // replayed against Groq and OpenRouter until one answered.
                    if (isGeminiSafetyBlock(result.response)) {
                        console.warn(`[safety] ${modelName} blocked the request`, { mode, userId: user.id });
                        return safetyRefusalResponse(mode, jsonHeaders);
                    }

                    let text = result.response.text();
                    if (mode === "quiz" || mode === "plan") {
                        text = cleanJsonResponse(text);
                    }

                    return new Response(JSON.stringify({
                        text: text,
                        modelUsed: modelName
                    }), {
                        headers: { "Content-Type": "application/json", ...corsHeaders }
                    });
                } catch (err: any) {
                    // `.text()` throws on a blocked candidate — same verdict,
                    // so it must not fall through to another provider either.
                    if (isSafetyError(err)) {
                        console.warn(`[safety] ${modelName} refused the request`, { mode, userId: user.id });
                        return safetyRefusalResponse(mode, jsonHeaders);
                    }
                    debugErrors[`Gemini (${modelName})`] = err.message || String(err);
                    console.error(`Gemini (${modelName}) Error:`, err);
                }
            }
        } else {
            debugErrors["Gemini"] = "GEMINI_API_KEY secret is not set in Supabase.";
        }

        // Prepare fallback text for non-multimodal providers
        let fallbackMsg = currentMsg;
        if (file && file.data) {
            try {
                const decodedText = decodeBase64UTF8(file.data);
                fallbackMsg += `\n\n[Attached File Content: ${file.name || "file"}]\n${decodedText}`;
            } catch (_) { }
        }

        // =========================================================================
        // CHANNEL 2: GROQ (Llama 3.3 70B)
        // =========================================================================
        try {
            const groqKey = Deno.env.get('GROQ_API_KEY');
            if (!groqKey) throw new Error("GROQ_API_KEY secret is not set in Supabase.");

            const groqHistory = (history || []).slice(0, -1).map((m: any) => ({
                role: m.role === 'model' ? 'assistant' : 'user',
                content: m.content
            }));

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                signal: controller.signal,
                headers: {
                    "Authorization": `Bearer ${groqKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: systemInstruction },
                        ...groqHistory,
                        { role: "user", content: fallbackMsg }
                    ]
                })
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            if (!response.ok) {
                throw new Error(`Groq API returned status ${response.status}: ${JSON.stringify(data)}`);
            }

            let text = data.choices[0].message.content;
            if (mode === "quiz" || mode === "plan") {
                text = cleanJsonResponse(text);
            }

            // Groq and OpenRouter have no comparable safety layer of their own,
            // so what they return is screened as well as what goes in.
            if (screenForUnsafeContent(text)) {
                console.warn("[safety] Groq output refused by screen", { mode, userId: user.id });
                return safetyRefusalResponse(mode, jsonHeaders);
            }

            return new Response(JSON.stringify({
                text: text,
                modelUsed: "groq/llama-3.3"
            }), {
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });

        } catch (groqError: any) {
            debugErrors["Groq Channel"] = groqError.message || String(groqError);
            console.error("Groq Error:", groqError);
        }

        // =========================================================================
        // CHANNEL 3: OPENROUTER (Llama 3 Free)
        // =========================================================================
        try {
            const orApiKey = Deno.env.get('OPENROUTER_API_KEY');
            if (!orApiKey) throw new Error("OPENROUTER_API_KEY secret is not set in Supabase.");

            const orHistory = (history || []).slice(0, -1).map((m: any) => ({
                role: m.role === 'model' ? 'assistant' : 'user',
                content: m.content
            }));

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                signal: controller.signal,
                headers: {
                    "Authorization": `Bearer ${orApiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://learnora.app",
                    "X-Title": "Learnora"
                },
                body: JSON.stringify({
                    model: "meta-llama/llama-3-8b-instruct:free",
                    messages: [
                        { role: "system", content: systemInstruction },
                        ...orHistory,
                        { role: "user", content: fallbackMsg }
                    ]
                })
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            if (!response.ok) {
                throw new Error(`OpenRouter API returned status ${response.status}: ${JSON.stringify(data)}`);
            }

            let text = data.choices[0].message.content;
            if (mode === "quiz" || mode === "plan") {
                text = cleanJsonResponse(text);
            }

            if (screenForUnsafeContent(text)) {
                console.warn("[safety] OpenRouter output refused by screen", { mode, userId: user.id });
                return safetyRefusalResponse(mode, jsonHeaders);
            }

            return new Response(JSON.stringify({
                text: text,
                modelUsed: "openrouter/llama-3"
            }), {
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });

        } catch (orError: any) {
            debugErrors["OpenRouter Channel"] = orError.message || String(orError);
            console.error("OpenRouter Error:", orError);
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
