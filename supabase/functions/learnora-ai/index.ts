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

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

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
    If asked for flashcards, output ONLY raw JSON: [{"front":"...", "back":"..."}].${modeInstructions}`;

        const currentMsg = history && history.length > 0 ? history[history.length - 1].content : "";

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
