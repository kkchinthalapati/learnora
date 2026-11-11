import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../test/mocks/server";
import {
  executeAIRotation,
  resetAllCooldowns,
  setCustomKeys,
  clearCustomKeys,
  getEffectiveKey,
  isProviderCoolingDown,
  AllProvidersFailedError,
} from "./aiRotationEngine";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function createGeminiSuccessHandler(text = "Strategy response from @K AI") {
  return http.post(GEMINI_URL, async () => {
    return HttpResponse.json({
      candidates: [
        {
          content: {
            parts: [{ text }],
            role: "model",
          },
          finishReason: "STOP",
        },
      ],
    });
  });
}

function createGeminiRateLimitHandler(retryDelay = "60s") {
  return http.post(GEMINI_URL, async () => {
    return HttpResponse.json(
      {
        error: {
          code: 429,
          message: `Resource has been exhausted. Please retry in ${retryDelay}.`,
          status: "RESOURCE_EXHAUSTED",
        },
      },
      { status: 429 },
    );
  });
}

function createGroqSuccessHandler(text = "Operations advice from @N AI") {
  return http.post(GROQ_URL, async () => {
    return HttpResponse.json({
      id: "chatcmpl-test-groq",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: text,
          },
          finish_reason: "stop",
        },
      ],
    });
  });
}

function createGroqErrorHandler(status = 503, message = "Service Unavailable") {
  return http.post(GROQ_URL, async () => {
    return HttpResponse.json(
      { error: { message, code: status } },
      { status },
    );
  });
}

function createOpenRouterSuccessHandler(text = "Fallback advice via OpenRouter") {
  return http.post(OPENROUTER_URL, async () => {
    return HttpResponse.json({
      id: "gen-test-or",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: text,
          },
          finish_reason: "stop",
        },
      ],
    });
  });
}

function createOpenRouterErrorHandler(status = 500, message = "Internal Server Error") {
  return http.post(OPENROUTER_URL, async () => {
    return HttpResponse.json(
      { error: { message, code: status } },
      { status },
    );
  });
}

describe("aiRotationEngine", () => {
  beforeEach(() => {
    resetAllCooldowns();
    clearCustomKeys();
  });

  afterEach(() => {
    resetAllCooldowns();
    clearCustomKeys();
  });

  describe("1. Primary Success", () => {
    it("returns Gemini result with fallbackHops=0 when primary succeeds", async () => {
      let groqCalled = false;
      let orCalled = false;

      server.use(
        createGeminiSuccessHandler("Direct Gemini 2.5 Flash completion"),
        http.post(GROQ_URL, () => {
          groqCalled = true;
          return HttpResponse.json({});
        }),
        http.post(OPENROUTER_URL, () => {
          orCalled = true;
          return HttpResponse.json({});
        }),
      );

      const res = await executeAIRotation({
        systemInstruction: "You are @K AI",
        userPrompt: "What is the CAC payback?",
      });

      expect(res.provider).toBe("gemini");
      expect(res.providerUsed).toBe("gemini");
      expect(res.model).toBe("gemini-2.5-flash");
      expect(res.fallbackHops).toBe(0);
      expect(res.text).toBe("Direct Gemini 2.5 Flash completion");
      expect(groqCalled).toBe(false);
      expect(orCalled).toBe(false);
      expect(res.attempts.length).toBe(1);
      expect(res.attempts[0].success).toBe(true);
    });
  });

  describe("2. Primary 429 Failover & Cooldown", () => {
    it("automatically fails over to Groq on 429 rate limit and registers Gemini cooldown", async () => {
      server.use(
        createGeminiRateLimitHandler("60s"),
        createGroqSuccessHandler("Groq response on fallback"),
      );

      const res = await executeAIRotation({
        systemInstruction: "You are @N AI",
        userPrompt: "Stress test our database load",
      });

      expect(res.provider).toBe("groq");
      expect(res.fallbackHops).toBe(1);
      expect(res.text).toBe("Groq response on fallback");
      expect(res.attempts.length).toBe(2);
      expect(res.attempts[0].provider).toBe("gemini");
      expect(res.attempts[0].success).toBe(false);
      expect(res.attempts[1].provider).toBe("groq");
      expect(res.attempts[1].success).toBe(true);

      // Gemini must be cooling down
      expect(isProviderCoolingDown("gemini")).toBe(true);
      expect(isProviderCoolingDown("groq")).toBe(false);
    });
  });

  describe("3. Cooldown Instant Bypass", () => {
    it("instantly skips Gemini without an HTTP request if it is in cooldown", async () => {
      let geminiHitCount = 0;

      server.use(
        http.post(GEMINI_URL, () => {
          geminiHitCount++;
          return HttpResponse.json(
            { error: { code: 429, message: "Rate limit" } },
            { status: 429 },
          );
        }),
        createGroqSuccessHandler("Groq fast reply"),
      );

      // First call: triggers 429 and cools down Gemini
      await executeAIRotation({
        systemInstruction: "You are @K AI",
        userPrompt: "First prompt",
      });
      expect(geminiHitCount).toBe(1);

      // Second call: Gemini must be bypassed with zero network request
      const res = await executeAIRotation({
        systemInstruction: "You are @K AI",
        userPrompt: "Second prompt",
      });

      expect(geminiHitCount).toBe(1); // Gemini was NOT called again
      expect(res.provider).toBe("groq");
      expect(res.attempts[0].skippedDueToCooldown).toBe(true);
      expect(res.attempts[0].latencyMs).toBe(0);
      expect(res.attempts[1].success).toBe(true);
    });
  });

  describe("4. Multi-Hop Failover to OpenRouter", () => {
    it("fails over through Gemini -> Groq -> OpenRouter when first two fail", async () => {
      server.use(
        createGeminiRateLimitHandler("30s"),
        createGroqErrorHandler(503, "Groq cluster overloaded"),
        createOpenRouterSuccessHandler("OpenRouter ultimate fallback"),
      );

      const res = await executeAIRotation({
        systemInstruction: "You are @K AI",
        userPrompt: "Strategy check under total outage",
      });

      expect(res.provider).toBe("openrouter");
      expect(res.fallbackHops).toBe(2);
      expect(res.text).toBe("OpenRouter ultimate fallback");
      expect(res.attempts.length).toBe(3);
      expect(res.attempts[0].success).toBe(false); // Gemini 429
      expect(res.attempts[1].success).toBe(false); // Groq 503
      expect(res.attempts[2].success).toBe(true);  // OpenRouter 200
    });
  });

  describe("5. Timeout Failover", () => {
    it("fails over to Groq when Gemini times out", async () => {
      server.use(
        http.post(GEMINI_URL, async () => {
          await delay(200); // Simulate delayed connection
          return HttpResponse.json({});
        }),
        createGroqSuccessHandler("Groq response after Gemini timeout"),
      );

      const res = await executeAIRotation(
        {
          systemInstruction: "You are @N AI",
          userPrompt: "Immediate operational check",
        },
        50, // 50ms test timeout deadline
      );

      expect(res.provider).toBe("groq");
      expect(res.fallbackHops).toBe(1);
      expect(res.attempts[0].error).toContain("timed out");
      expect(isProviderCoolingDown("gemini")).toBe(true);
    });
  });

  describe("6. All Providers Down", () => {
    it("throws AllProvidersFailedError when Gemini, Groq, and OpenRouter all fail", async () => {
      server.use(
        createGeminiRateLimitHandler("60s"),
        createGroqErrorHandler(500, "Groq internal error"),
        createOpenRouterErrorHandler(500, "OpenRouter failure"),
      );

      await expect(
        executeAIRotation({
          systemInstruction: "You are @K AI",
          userPrompt: "Test all down",
        }),
      ).rejects.toThrow(AllProvidersFailedError);
    });
  });

  describe("7. Custom Key Resolution", () => {
    it("uses custom keys from localStorage when configured", async () => {
      let interceptedGroqAuthHeader: string | null = null;

      server.use(
        createGeminiRateLimitHandler(),
        http.post(GROQ_URL, ({ request }) => {
          interceptedGroqAuthHeader = request.headers.get("Authorization");
          return HttpResponse.json({
            choices: [{ message: { content: "Custom key verified", role: "assistant" } }],
          });
        }),
      );

      setCustomKeys({ groq: "gsk_nirav_custom_key_12345" });
      expect(getEffectiveKey("groq")).toBe("gsk_nirav_custom_key_12345");

      const res = await executeAIRotation({
        systemInstruction: "You are @N AI",
        userPrompt: "Verify custom key",
      });

      expect(res.provider).toBe("groq");
      expect(interceptedGroqAuthHeader).toBe("Bearer gsk_nirav_custom_key_12345");
    });
  });

  describe("8. User Abort Signal", () => {
    it("stops immediately without cooling down providers if signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        executeAIRotation({
          systemInstruction: "You are @K AI",
          userPrompt: "Should be aborted",
          signal: controller.signal,
        }),
      ).rejects.toThrow("cancelled by user");

      expect(isProviderCoolingDown("gemini")).toBe(false);
      expect(isProviderCoolingDown("groq")).toBe(false);
    });
  });
});
