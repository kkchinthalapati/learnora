import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
            }
        });
    }

    // Track the errors of each channel
    const debugErrors: Record<string, string> = {};

    try {
        const { history, file, settings, mode } = await req.json();
        const s = settings || {};

        const availableGeminiModels = ["gemini-1.5-flash", "gemini-2.0-flash"];
        const randomGeminiModel = availableGeminiModels[Math.floor(Math.random() * availableGeminiModels.length)];

        const personaMap = {
            coach: 'a strict, tough-love, demanding academic coach',
            buddy: 'a casual, friendly, bro-like, relaxed study partner',
            tutor: 'a patient, explanatory, supportive tutor'
        };

        const modeInstructions = mode === "plan"
            ? `\nYou are generating a weekly study schedule. Output ONLY raw JSON (no prose, no code fences) matching this shape: {"days":[{"date":"YYYY-MM-DD","blocks":[{"startHint":"morning|afternoon|evening","durationMins":45,"subject":"string","reason":"string","examId":null,"taskId":null}]}],"summary":"one-sentence summary of the week's priorities"}.`
            : mode === "quiz"
            ? `\nYou are generating a multiple-choice quiz from the provided material. Output ONLY raw JSON (no prose, no code fences): [{"question":"string","choices":["a","b","c","d"],"correctIndex":0,"topic":"short topic label","feedback":"string"}]. Produce questions covering distinct concepts.`
            : "";

        const systemInstruction = `You are Learnora AI. Act as ${personaMap[s.aiPersona] || personaMap.tutor}.
    Keep response ${s.aiConciseness === 'short' ? 'brief' : 'detailed'}. Use ${s.aiLanguage || 'English'}.
    If asked for flashcards, output ONLY raw JSON: [{"front":"...", "back":"..."}].${modeInstructions}`;

        const currentMsg = history[history.length - 1].content;

        // =========================================================================
        // CHANNEL 1: GEMINI
        // =========================================================================
        try {
            const geminiKey = Deno.env.get('GEMINI_API_KEY');
            if (!geminiKey) throw new Error("GEMINI_API_KEY secret is not set in Supabase.");

            const genAI = new GoogleGenerativeAI(geminiKey);
            const model = genAI.getGenerativeModel({ model: randomGeminiModel, systemInstruction });

            const chatHistory = history.slice(0, -1).map((m: any) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }));

            const chat = model.startChat({ history: chatHistory });

            const payload = file && file.data ? [
                currentMsg,
                { inlineData: { data: file.data, mimeType: file.mimeType } }
            ] : currentMsg;

            const result = await chat.sendMessage(payload);
            return new Response(JSON.stringify({
                text: result.response.text(),
                modelUsed: randomGeminiModel
            }), {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": '*' }
            });

        } catch (geminiError) {
            debugErrors["Gemini Channel"] = geminiError.message;
            console.error("Gemini Error:", geminiError);

            let fallbackMsg = currentMsg;
            if (file && file.mimeType && file.mimeType.startsWith("text/")) {
                try {
                    const decodedText = atob(file.data);
                    fallbackMsg += `\n\n[Attached File Content: ${file.name}]\n${decodedText}`;
                } catch (_) { }
            }

            // =========================================================================
            // CHANNEL 2: GROQ
            // =========================================================================
            try {
                const groqKey = Deno.env.get('GROQ_API_KEY');
                if (!groqKey) throw new Error("GROQ_API_KEY secret is not set in Supabase.");

                const groqHistory = history.slice(0, -1).map((m: any) => ({
                    role: m.role === 'model' ? 'assistant' : 'user',
                    content: m.content
                }));

                const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
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

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(`Groq API returned status ${response.status}: ${JSON.stringify(data)}`);
                }

                return new Response(JSON.stringify({
                    text: data.choices[0].message.content,
                    modelUsed: "groq/llama-3.3"
                }), {
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": '*' }
                });

            } catch (groqError) {
                debugErrors["Groq Channel"] = groqError.message;
                console.error("Groq Error:", groqError);

                // =========================================================================
                // CHANNEL 3: OPENROUTER
                // =========================================================================
                try {
                    const orApiKey = Deno.env.get('OPENROUTER_API_KEY');
                    if (!orApiKey) throw new Error("OPENROUTER_API_KEY secret is not set in Supabase.");

                    const orHistory = history.slice(0, -1).map((m: any) => ({
                        role: m.role === 'model' ? 'assistant' : 'user',
                        content: m.content
                    }));

                    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                        method: "POST",
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

                    const data = await response.json();
                    if (!response.ok) {
                        throw new Error(`OpenRouter API returned status ${response.status}: ${JSON.stringify(data)}`);
                    }

                    return new Response(JSON.stringify({
                        text: data.choices[0].message.content,
                        modelUsed: "openrouter/llama-3"
                    }), {
                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": '*' }
                    });

                } catch (orError) {
                    debugErrors["OpenRouter Channel"] = orError.message;
                    console.error("OpenRouter Error:", orError);
                    throw new Error("All channels offline.");
                }
            }
        }

    } catch (err) {
        // Return all step-by-step failures to the UI
        const debugMessage = `🚨 AI Pipeline Failure:\n` +
            `- Gemini: ${debugErrors["Gemini Channel"] || "Skipped"}\n` +
            `- Groq: ${debugErrors["Groq Channel"] || "Skipped"}\n` +
            `- OpenRouter: ${debugErrors["OpenRouter Channel"] || "Skipped"}\n\n` +
            `System error: ${err.message}`;

        return new Response(JSON.stringify({
            text: debugMessage
        }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": '*' }
        });
    }
});
