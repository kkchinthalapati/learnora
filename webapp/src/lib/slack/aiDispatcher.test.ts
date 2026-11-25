import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../test/mocks/server";
import {
  dispatchAIMentions,
  addThinkingIndicator,
  removeThinkingIndicator,
  clearAllThinking,
  getThinkingList,
} from "./aiDispatcher";
import {
  getSlackStoreState,
  resetStore,
  sendMessage,
} from "./slackStore";
import { resetAllCooldowns } from "./aiRotationEngine";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

describe("aiDispatcher module", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    clearAllThinking();
    resetAllCooldowns();
  });

  afterEach(() => {
    clearAllThinking();
    resetAllCooldowns();
  });

  describe("thinking store primitives", () => {
    it("adds, retrieves, and removes thinking indicators", () => {
      addThinkingIndicator({
        id: "k_ai-strategy-feed",
        persona: "k_ai",
        channelId: "strategy",
        startedAt: Date.now(),
      });

      expect(getThinkingList().length).toBe(1);
      expect(getThinkingList()[0].id).toBe("k_ai-strategy-feed");

      // Idempotent add
      addThinkingIndicator({
        id: "k_ai-strategy-feed",
        persona: "k_ai",
        channelId: "strategy",
        startedAt: Date.now(),
      });
      expect(getThinkingList().length).toBe(1);

      removeThinkingIndicator("k_ai-strategy-feed");
      expect(getThinkingList().length).toBe(0);
    });
  });

  describe("dispatchAIMentions", () => {
    it("ignores messages without AI mentions", async () => {
      const userMsg = sendMessage({
        channelId: "general",
        content: "Just a general message between founders",
        authorId: "karthik",
      });

      const results = await dispatchAIMentions({
        userMessage: userMsg,
      });

      expect(results).toEqual([]);
      expect(getThinkingList().length).toBe(0);
    });

    it("handles @K AI mention and posts response with authorId 'agent-k'", async () => {
      server.use(
        http.post(GEMINI_URL, () => {
          return HttpResponse.json({
            candidates: [
              {
                content: {
                  parts: [{ text: "Strategic assessment: focus on retention loops first." }],
                  role: "model",
                },
                finishReason: "STOP",
              },
            ],
          });
        }),
      );

      const userMsg = sendMessage({
        channelId: "strategy",
        content: "@K AI how should we position our pricing tiers?",
        authorId: "karthik",
      });

      const results = await dispatchAIMentions({
        userMessage: userMsg,
        channelId: "strategy",
        channelName: "strategy",
      });

      expect(results.length).toBe(1);
      expect(results[0].authorId).toBe("agent-k");
      expect(results[0].content).toContain("Strategic assessment: focus on retention loops");
      expect(results[0].providerUsed).toBe("gemini");

      // Thinking indicator must be cleared
      expect(getThinkingList().length).toBe(0);

      // Store must contain the response
      const store = getSlackStoreState();
      const aiMsg = store.messages.find((m) => m.id === results[0].id);
      expect(aiMsg).toBeDefined();
      expect(aiMsg?.authorId).toBe("agent-k");
    });

    it("handles @N AI mention and posts response with authorId 'agent-n'", async () => {
      server.use(
        http.post(GEMINI_URL, () => {
          return HttpResponse.json({
            candidates: [
              {
                content: {
                  parts: [{ text: "Operational verdict: [Support] with 200ms latency budget." }],
                  role: "model",
                },
                finishReason: "STOP",
              },
            ],
          });
        }),
      );

      const userMsg = sendMessage({
        channelId: "tech",
        content: "@N AI verify the database index performance",
        authorId: "nirav",
      });

      const results = await dispatchAIMentions({
        userMessage: userMsg,
        channelId: "tech",
        channelName: "tech",
      });

      expect(results.length).toBe(1);
      expect(results[0].authorId).toBe("agent-n");
      expect(results[0].content).toContain("Operational verdict: [Support]");
      expect(results[0].providerUsed).toBe("gemini");
    });

    it("handles dual mentions (@K AI and @N AI) concurrently", async () => {
      server.use(
        http.post(GEMINI_URL, () => {
          return HttpResponse.json({
            candidates: [
              {
                content: {
                  parts: [{ text: "Dual-mention co-founder perspective." }],
                  role: "model",
                },
                finishReason: "STOP",
              },
            ],
          });
        }),
      );

      const userMsg = sendMessage({
        channelId: "product",
        content: "@K AI @N AI should we build native mobile or PWA?",
        authorId: "karthik",
      });

      const results = await dispatchAIMentions({
        userMessage: userMsg,
        channelId: "product",
        channelName: "product",
      });

      expect(results.length).toBe(2);
      const authorIds = results.map((r) => r.authorId);
      expect(authorIds).toContain("agent-k");
      expect(authorIds).toContain("agent-n");
      expect(getThinkingList().length).toBe(0);
    });

    it("maintains thread isolation when threadRootId is specified", async () => {
      server.use(
        http.post(GEMINI_URL, () => {
          return HttpResponse.json({
            candidates: [
              {
                content: {
                  parts: [{ text: "Thread reply insight from @K AI." }],
                  role: "model",
                },
                finishReason: "STOP",
              },
            ],
          });
        }),
      );

      const rootMsg = sendMessage({
        channelId: "strategy",
        content: "Root discussion on CAC",
        authorId: "karthik",
      });

      const replyMsg = sendMessage({
        channelId: "strategy",
        threadRootId: rootMsg.id,
        content: "@K AI what is the payback horizon?",
        authorId: "nirav",
      });

      const results = await dispatchAIMentions({
        userMessage: replyMsg,
        channelId: "strategy",
        channelName: "strategy",
        threadRootId: rootMsg.id,
      });

      expect(results.length).toBe(1);
      expect(results[0].threadRootId).toBe(rootMsg.id);
      expect(results[0].authorId).toBe("agent-k");
    });

    it("posts in-stream friendly error if all providers fail", async () => {
      server.use(
        http.post(GEMINI_URL, () => HttpResponse.json({ error: { message: "Gemini down" } }, { status: 500 })),
        http.post(GROQ_URL, () => HttpResponse.json({ error: { message: "Groq down" } }, { status: 500 })),
        http.post(OPENROUTER_URL, () => HttpResponse.json({ error: { message: "OpenRouter down" } }, { status: 500 })),
      );

      const userMsg = sendMessage({
        channelId: "strategy",
        content: "@K AI test total outage",
        authorId: "karthik",
      });

      const results = await dispatchAIMentions({
        userMessage: userMsg,
        channelId: "strategy",
        channelName: "strategy",
      });

      expect(results.length).toBe(1);
      expect(results[0].content).toContain("⚠️ @K AI could not connect to AI providers right now");
      expect(getThinkingList().length).toBe(0); // Guaranteed cleanup
    });
  });
});
