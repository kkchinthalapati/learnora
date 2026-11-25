import { Storage } from "../storage";
import {
  type OpenAiMessage,
  type GeminiPayload,
  type GeminiContent,
  buildAIContext,
  getAIPersona,
  type AIPersonaId,
} from "./aiPersonas";
import type { SlackMessage } from "./slackStore";

// ==========================================
// 1. Data Types & Interfaces
// ==========================================

export type ProviderId = "gemini" | "groq" | "openrouter";

export interface ConversationTurn {
  speaker?: string; // e.g. "Karthik", "Nirav", "@K AI", "@N AI"
  role: "user" | "assistant" | "model";
  content: string;
}

export interface ProviderAttemptRecord {
  provider: ProviderId;
  model: string;
  success: boolean;
  latencyMs: number;
  error?: string;
  skippedDueToCooldown?: boolean;
}

export interface AICompletionRequest {
  // Low-level prompt fields
  systemInstruction?: string;
  turns?: ConversationTurn[];
  userPrompt?: string;
  signal?: AbortSignal;
  openAiMessages?: OpenAiMessage[];
  geminiPayload?: GeminiPayload;

  // High-level context options (optional convenience)
  persona?: AIPersonaId;
  channelId?: string;
  channelName?: string;
  channelDescription?: string;
  threadRootId?: string;
  recentMessages?: SlackMessage[];
  senderId?: string;
}

export interface AICompletionResult {
  text: string;
  content: string; // Alias for text for SCOPE.md compatibility
  provider: ProviderId;
  providerUsed: ProviderId; // Alias for provider for SCOPE.md compatibility
  model: string;
  modelUsed: string; // Alias for model for SCOPE.md compatibility
  fallbackHops: number;
  latencyMs: number;
  attempts: ProviderAttemptRecord[];
}

export interface CustomKeysConfig {
  gemini?: string;
  groq?: string;
  openrouter?: string;
}

export interface CooldownRecord {
  coolingUntil: number; // Unix timestamp in ms
  reason: string;
  status?: number;
}

// ==========================================
// 2. Constants & Credentials
// ==========================================

/* No keys live in the source: this repo is public, and anything here ships
   in the browser bundle. A founder enters keys in the workspace settings
   (stored on their own device), or a local build sets VITE_GEMINI_API_KEY,
   VITE_GROQ_API_KEY and VITE_OPENROUTER_API_KEY. With none, the provider is
   skipped. */
export const DEFAULT_PROVIDER_KEYS: Record<ProviderId, string> = {
  gemini: "",
  groq: "",
  openrouter: "",
};

export const PROVIDER_MODELS: Record<ProviderId, string> = {
  gemini: "gemini-2.5-flash",
  groq: "openai/gpt-oss-120b",
  openrouter: "google/gemini-2.5-flash",
};

export const PROVIDER_ROTATION_ORDER: readonly ProviderId[] = [
  "gemini",
  "groq",
  "openrouter",
];

export const CUSTOM_KEYS_STORAGE_KEY = "learnora:founder:custom_keys";
export const PROVIDER_TIMEOUT_MS = 20_000;

export const COOLDOWN_RATE_LIMIT_MS = 60_000;    // 60s for 429
export const COOLDOWN_SERVER_ERROR_MS = 30_000;  // 30s for 5xx
export const COOLDOWN_DEAD_KEY_MS = 15 * 60_000; // 15m for 401/402/403
export const COOLDOWN_TRANSIENT_MS = 15_000;     // 15s for timeout/network

// ==========================================
// 3. Error Classes
// ==========================================

export class AllProvidersFailedError extends Error {
  readonly name = "AllProvidersFailedError";
  readonly attempts: ProviderAttemptRecord[];

  constructor(attempts: ProviderAttemptRecord[], message?: string) {
    const summary = attempts
      .map(
        (a) =>
          `[${a.provider}] ${a.skippedDueToCooldown ? "Skipped (cooling down)" : a.error || "Failed"}`,
      )
      .join("; ");
    super(
      message ||
        `All AI providers failed: ${summary}. Please verify network connection and API quotas.`,
    );
    this.attempts = attempts;
  }
}

// ==========================================
// 4. Cooldown Registry
// ==========================================

const cooldownRegistry = new Map<ProviderId, CooldownRecord>();

export function isProviderCoolingDown(provider: ProviderId): boolean {
  const cd = cooldownRegistry.get(provider);
  if (!cd) return false;
  if (Date.now() >= cd.coolingUntil) {
    cooldownRegistry.delete(provider);
    return false;
  }
  return true;
}

export function getProviderCooldown(provider: ProviderId): CooldownRecord | null {
  if (!isProviderCoolingDown(provider)) return null;
  return cooldownRegistry.get(provider) ?? null;
}

export function setProviderCooldown(
  provider: ProviderId,
  durationMs: number,
  reason: string,
  status?: number,
): void {
  cooldownRegistry.set(provider, {
    coolingUntil: Date.now() + durationMs,
    reason,
    status,
  });
}

export function resetAllCooldowns(): void {
  cooldownRegistry.clear();
}

export function parseRetryHintMs(message?: string): number | null {
  if (!message) return null;
  const match = /(?:try again|retry) in (\d+(?:\.\d+)?)\s*(ms|s)\b/i.exec(message);
  if (match) {
    const val = Number(match[1]);
    return Math.ceil(match[2].toLowerCase() === "ms" ? val : val * 1000);
  }
  return null;
}

export function calculateCooldownMs(status?: number, message?: string): number {
  if (status === 429) {
    const hint = parseRetryHintMs(message);
    return hint ?? COOLDOWN_RATE_LIMIT_MS;
  }
  if (status && [401, 402, 403].includes(status)) {
    return COOLDOWN_DEAD_KEY_MS;
  }
  if (status && status >= 500) {
    return COOLDOWN_SERVER_ERROR_MS;
  }
  return COOLDOWN_TRANSIENT_MS;
}

// ==========================================
// 5. Key Resolution & Management
// ==========================================

export function getEffectiveKey(provider: ProviderId): string {
  try {
    const custom = Storage.get<CustomKeysConfig | null>(CUSTOM_KEYS_STORAGE_KEY, null);
    if (custom && custom[provider]?.trim()) {
      return custom[provider]!.trim();
    }
  } catch {
    /* fallback to env or defaults */
  }

  if (typeof import.meta !== "undefined" && import.meta.env) {
    if (provider === "gemini" && import.meta.env.VITE_GEMINI_API_KEY) {
      return import.meta.env.VITE_GEMINI_API_KEY;
    }
    if (provider === "groq" && import.meta.env.VITE_GROQ_API_KEY) {
      return import.meta.env.VITE_GROQ_API_KEY;
    }
    if (provider === "openrouter" && import.meta.env.VITE_OPENROUTER_API_KEY) {
      return import.meta.env.VITE_OPENROUTER_API_KEY;
    }
  }

  return DEFAULT_PROVIDER_KEYS[provider];
}

export function setCustomKeys(keys: Partial<CustomKeysConfig>): void {
  const current = Storage.get<CustomKeysConfig | null>(CUSTOM_KEYS_STORAGE_KEY, null) ?? {};
  Storage.set(CUSTOM_KEYS_STORAGE_KEY, { ...current, ...keys });
}

export function getCustomKeys(): CustomKeysConfig {
  return Storage.get<CustomKeysConfig | null>(CUSTOM_KEYS_STORAGE_KEY, null) ?? {};
}

export function clearCustomKeys(): void {
  Storage.remove(CUSTOM_KEYS_STORAGE_KEY);
}

// ==========================================
// 6. Provider REST Callers
// ==========================================

export async function callGemini(
  request: AICompletionRequest,
  signal: AbortSignal,
): Promise<string> {
  const key = getEffectiveKey("gemini");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;

  let payload: GeminiPayload;

  if (request.geminiPayload) {
    payload = request.geminiPayload;
  } else {
    const contents: GeminiContent[] = [];

    if (request.turns && request.turns.length > 0) {
      for (const turn of request.turns) {
        const geminiRole = turn.role === "assistant" || turn.role === "model" ? "model" : "user";
        const prefix = turn.speaker ? `[${turn.speaker}]: ` : "";
        const text = `${prefix}${turn.content}`;

        const last = contents[contents.length - 1];
        if (last && last.role === geminiRole) {
          last.parts[0].text += `\n\n${text}`;
        } else {
          contents.push({
            role: geminiRole,
            parts: [{ text }],
          });
        }
      }
    }

    // Current user prompt
    const promptText = request.userPrompt ?? "";
    const last = contents[contents.length - 1];
    if (last && last.role === "user") {
      last.parts[0].text += `\n\n${promptText}`;
    } else {
      contents.push({
        role: "user",
        parts: [{ text: promptText }],
      });
    }

    payload = {
      systemInstruction: {
        parts: [{ text: request.systemInstruction ?? "" }],
      },
      contents,
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        topP: 0.95,
      },
    }),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message || `HTTP ${res.status} ${res.statusText}`;
    const err = new Error(`Gemini error: ${msg}`);
    (err as any).status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini returned an empty candidate completion.");
  }
  return text.trim();
}

export async function callGroq(
  request: AICompletionRequest,
  signal: AbortSignal,
): Promise<string> {
  const key = getEffectiveKey("groq");
  const url = "https://api.groq.com/openai/v1/chat/completions";

  let messages: OpenAiMessage[];

  if (request.openAiMessages && request.openAiMessages.length > 0) {
    messages = request.openAiMessages;
  } else {
    messages = [
      { role: "system", content: request.systemInstruction ?? "" },
    ];

    if (request.turns && request.turns.length > 0) {
      for (const turn of request.turns) {
        const role = turn.role === "assistant" || turn.role === "model" ? "assistant" : "user";
        const prefix = turn.speaker ? `[${turn.speaker}]: ` : "";
        messages.push({
          role,
          content: `${prefix}${turn.content}`,
        });
      }
    }

    if (request.userPrompt) {
      messages.push({ role: "user", content: request.userPrompt });
    }
  }

  const payload = {
    model: PROVIDER_MODELS.groq,
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message || `HTTP ${res.status} ${res.statusText}`;
    const err = new Error(`Groq error: ${msg}`);
    (err as any).status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Groq returned an empty message completion.");
  }
  return content.trim();
}

export async function callOpenRouter(
  request: AICompletionRequest,
  signal: AbortSignal,
): Promise<string> {
  const key = getEffectiveKey("openrouter");
  const url = "https://openrouter.ai/api/v1/chat/completions";

  let messages: OpenAiMessage[];

  if (request.openAiMessages && request.openAiMessages.length > 0) {
    messages = request.openAiMessages;
  } else {
    messages = [
      { role: "system", content: request.systemInstruction ?? "" },
    ];

    if (request.turns && request.turns.length > 0) {
      for (const turn of request.turns) {
        const role = turn.role === "assistant" || turn.role === "model" ? "assistant" : "user";
        const prefix = turn.speaker ? `[${turn.speaker}]: ` : "";
        messages.push({
          role,
          content: `${prefix}${turn.content}`,
        });
      }
    }

    if (request.userPrompt) {
      messages.push({ role: "user", content: request.userPrompt });
    }
  }

  const payload = {
    model: PROVIDER_MODELS.openrouter,
    models: ["google/gemini-2.5-flash", "openai/gpt-oss-120b"],
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://learnora.app",
      "X-Title": "Learnora Founder Workspace",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message || `HTTP ${res.status} ${res.statusText}`;
    const err = new Error(`OpenRouter error: ${msg}`);
    (err as any).status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter returned an empty message completion.");
  }
  return content.trim();
}

// ==========================================
// 7. Rotation Engine Orchestration
// ==========================================

export async function executeAIRotation(
  request: AICompletionRequest,
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
): Promise<AICompletionResult> {
  if (request.signal?.aborted) {
    throw new Error("Execution cancelled by user.");
  }

  // If high-level options were provided without pre-built payloads, resolve them via buildAIContext
  let resolvedRequest = { ...request };
  if (!resolvedRequest.geminiPayload && resolvedRequest.persona && resolvedRequest.userPrompt) {
    const context = buildAIContext({
      personaId: resolvedRequest.persona,
      channelId: resolvedRequest.channelId ?? "general",
      channelName: resolvedRequest.channelName ?? "general",
      channelDescription: resolvedRequest.channelDescription,
      threadRootId: resolvedRequest.threadRootId,
      userPrompt: resolvedRequest.userPrompt,
      senderId: resolvedRequest.senderId ?? "founder",
      messages: resolvedRequest.recentMessages,
    });
    resolvedRequest = {
      ...resolvedRequest,
      systemInstruction: context.systemInstruction,
      openAiMessages: context.openAiMessages,
      geminiPayload: context.geminiPayload,
    };
  } else if (!resolvedRequest.systemInstruction && resolvedRequest.persona) {
    const persona = getAIPersona(resolvedRequest.persona);
    resolvedRequest.systemInstruction = persona.systemPrompt;
  }

  const overallStartTime = Date.now();
  const attempts: ProviderAttemptRecord[] = [];

  for (const provider of PROVIDER_ROTATION_ORDER) {
    const model = PROVIDER_MODELS[provider];

    // Check cooldown registry: instant bypass if cooling down
    if (isProviderCoolingDown(provider)) {
      const cd = getProviderCooldown(provider);
      attempts.push({
        provider,
        model,
        success: false,
        latencyMs: 0,
        skippedDueToCooldown: true,
        error: `Provider cooling down until ${new Date(cd?.coolingUntil ?? 0).toISOString()} (${cd?.reason})`,
      });
      continue;
    }

    // Set up deadline cancellation compatible with JSDOM
    const attemptController = new AbortController();
    let isTimedOut = false;
    const deadline = setTimeout(() => {
      isTimedOut = true;
      attemptController.abort();
    }, timeoutMs);

    const onExternalAbort = () => attemptController.abort();
    resolvedRequest.signal?.addEventListener("abort", onExternalAbort, { once: true });

    const callStart = Date.now();

    try {
      let text = "";
      if (provider === "gemini") {
        text = await callGemini(resolvedRequest, attemptController.signal);
      } else if (provider === "groq") {
        text = await callGroq(resolvedRequest, attemptController.signal);
      } else if (provider === "openrouter") {
        text = await callOpenRouter(resolvedRequest, attemptController.signal);
      }

      clearTimeout(deadline);
      resolvedRequest.signal?.removeEventListener("abort", onExternalAbort);

      const latencyMs = Date.now() - callStart;
      attempts.push({
        provider,
        model,
        success: true,
        latencyMs,
      });

      // Calculate hops: number of prior attempted providers not skipped by cooldown
      const fallbackHops = attempts.filter((a) => !a.skippedDueToCooldown).length - 1;

      return {
        text,
        content: text,
        provider,
        providerUsed: provider,
        model,
        modelUsed: model,
        fallbackHops,
        latencyMs: Date.now() - overallStartTime,
        attempts,
      };
    } catch (err: any) {
      clearTimeout(deadline);
      resolvedRequest.signal?.removeEventListener("abort", onExternalAbort);

      // If user aborted explicitly, halt rotation without cooling providers down
      if (resolvedRequest.signal?.aborted) {
        throw new Error("Execution cancelled by user.");
      }

      const latencyMs = Date.now() - callStart;
      let status: number | undefined = err?.status;
      let errorMessage = err?.message || String(err);

      if (isTimedOut) {
        status = 408;
        errorMessage = `Request timed out after ${timeoutMs}ms`;
      }

      const cooldownDuration = calculateCooldownMs(status, errorMessage);
      setProviderCooldown(provider, cooldownDuration, errorMessage, status);

      attempts.push({
        provider,
        model,
        success: false,
        latencyMs,
        error: errorMessage,
      });
    }
  }

  throw new AllProvidersFailedError(attempts);
}
