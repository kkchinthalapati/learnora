import { describe, it, expect } from "vitest";
import {
  getAIPersona,
  resolvePersonaFromStoreId,
  formatAuthorDisplay,
  buildAIContext,
  K_AI_PERSONA,
  N_AI_PERSONA,
} from "./aiPersonas";
import type { SlackMessage, SlackUser } from "./slackStore";

const MOCK_USERS: SlackUser[] = [
  {
    id: "karthik",
    name: "Karthik",
    role: "founder",
    isOnline: true,
  },
  {
    id: "nirav",
    name: "Nirav",
    role: "founder",
    isOnline: true,
  },
  {
    id: "agent-k",
    name: "K AI",
    role: "ai_advisor",
    advisorType: "strategy",
    isOnline: true,
  },
  {
    id: "agent-n",
    name: "N AI",
    role: "ai_advisor",
    advisorType: "operations",
    isOnline: true,
  },
];

const MOCK_MESSAGES: SlackMessage[] = [
  {
    id: "m-1",
    channelId: "strategy",
    authorId: "karthik",
    content: "Should we offer a 14-day trial or free tier?",
    createdAt: "2026-11-09T10:00:00.000Z",
    reactions: [],
  },
  {
    id: "m-2",
    channelId: "strategy",
    authorId: "nirav",
    content: "Free tier could increase LLM costs rapidly.",
    createdAt: "2026-11-09T10:01:00.000Z",
    reactions: [],
  },
  {
    id: "m-3",
    channelId: "strategy",
    authorId: "agent-k",
    content: "A free tier with tight token caps builds the top-of-funnel moat.",
    createdAt: "2026-11-09T10:02:00.000Z",
    reactions: [],
  },
];

describe("aiPersonas module", () => {
  describe("persona configurations", () => {
    it("returns correct persona definitions", () => {
      const k = getAIPersona("k_ai");
      expect(k.id).toBe("k_ai");
      expect(k.storeUserId).toBe("agent-k");
      expect(k.badgeColor).toBe("#7c3aed");
      expect(k.systemPrompt).toContain("Karthik's AI Co-Founder & Strategy Advisor");
      expect(k.systemPrompt).toContain("Long-Term Vision & Product Moat");

      const n = getAIPersona("n_ai");
      expect(n.id).toBe("n_ai");
      expect(n.storeUserId).toBe("agent-n");
      expect(n.badgeColor).toBe("#0d9488");
      expect(n.systemPrompt).toContain("Nirav's AI Co-Founder & Operations/Risk Advisor");
      expect(n.systemPrompt).toContain("Operational Feasibility & Execution Velocity");
    });

    it("resolves store IDs and aliases to personas", () => {
      expect(resolvePersonaFromStoreId("agent-k")).toBe("k_ai");
      expect(resolvePersonaFromStoreId("k_ai")).toBe("k_ai");
      expect(resolvePersonaFromStoreId("k-ai")).toBe("k_ai");
      expect(resolvePersonaFromStoreId("agent-n")).toBe("n_ai");
      expect(resolvePersonaFromStoreId("n_ai")).toBe("n_ai");
      expect(resolvePersonaFromStoreId("n-ai")).toBe("n_ai");
      expect(resolvePersonaFromStoreId("unknown")).toBeNull();
    });

    it("formats author display names and roles correctly", () => {
      expect(formatAuthorDisplay("karthik", MOCK_USERS)).toEqual({
        name: "Karthik",
        role: "Co-Founder & Head of Strategy",
      });
      expect(formatAuthorDisplay("nirav", MOCK_USERS)).toEqual({
        name: "Nirav",
        role: "Co-Founder & Head of Operations",
      });
      expect(formatAuthorDisplay("agent-k", MOCK_USERS)).toEqual({
        name: "@K AI",
        role: "Karthik's AI Strategy Advisor",
      });
      expect(formatAuthorDisplay("agent-n", MOCK_USERS)).toEqual({
        name: "@N AI",
        role: "Nirav's AI Operations/Risk Advisor",
      });
    });
  });

  describe("buildAIContext in channel feed", () => {
    it("assembles chronological turns, systemInstruction, openAiMessages, and geminiPayload", () => {
      const result = buildAIContext({
        personaId: "k_ai",
        channelId: "strategy",
        channelName: "strategy",
        channelDescription: "Business models & moats",
        userPrompt: "@K AI how do we defend against Anki and Quizlet?",
        senderId: "karthik",
        messages: MOCK_MESSAGES,
        users: MOCK_USERS,
      });

      expect(result.persona).toBe(K_AI_PERSONA);
      expect(result.isThread).toBe(false);
      expect(result.threadRootMessage).toBeNull();
      expect(result.extractedQuery).toBe("how do we defend against Anki and Quizlet?");

      // System instruction includes channel and workspace info
      expect(result.systemInstruction).toContain("WORKSPACE CONTEXT:");
      expect(result.systemInstruction).toContain("#strategy (Business models & moats)");

      // Conversation turns
      expect(result.conversationHistory.length).toBe(3);
      expect(result.conversationHistory[0].authorName).toBe("Karthik");
      expect(result.conversationHistory[2].isTargetAI).toBe(true);

      // OpenAI messages structure
      expect(result.openAiMessages[0].role).toBe("system");
      expect(result.openAiMessages[1].role).toBe("user");
      expect(result.openAiMessages[2].role).toBe("user");
      expect(result.openAiMessages[3].role).toBe("assistant"); // agent-k turn
      expect(result.openAiMessages[4].role).toBe("user"); // current prompt

      // Gemini payload structure
      expect(result.geminiPayload.systemInstruction.parts[0].text).toBe(result.systemInstruction);
      // Consecutive user turns (m-1, m-2) should be merged
      expect(result.geminiPayload.contents[0].role).toBe("user");
      expect(result.geminiPayload.contents[0].parts[0].text).toContain("Should we offer a 14-day trial");
      expect(result.geminiPayload.contents[0].parts[0].text).toContain("Free tier could increase LLM costs");
      // agent-k turn is model
      expect(result.geminiPayload.contents[1].role).toBe("model");
      // final prompt is user
      expect(result.geminiPayload.contents[2].role).toBe("user");
    });
  });

  describe("buildAIContext in thread feed", () => {
    it("pins thread root message and only includes thread replies", () => {
      const threadMessages: SlackMessage[] = [
        ...MOCK_MESSAGES,
        {
          id: "m-4",
          channelId: "strategy",
          authorId: "nirav",
          threadRootId: "m-1",
          content: "Let us discuss the unit economics of the free tier here.",
          createdAt: "2026-11-09T10:05:00.000Z",
          reactions: [],
        },
      ];

      const result = buildAIContext({
        personaId: "n_ai",
        channelId: "strategy",
        channelName: "strategy",
        threadRootId: "m-1",
        userPrompt: "@N AI what are our serverless compute limits?",
        senderId: "nirav",
        messages: threadMessages,
        users: MOCK_USERS,
      });

      expect(result.persona).toBe(N_AI_PERSONA);
      expect(result.isThread).toBe(true);
      expect(result.threadRootMessage?.id).toBe("m-1");
      expect(result.systemInstruction).toContain("--- THREAD ROOT MESSAGE ---");
      expect(result.systemInstruction).toContain("Should we offer a 14-day trial or free tier?");
      // Conversation history only has thread replies (m-4), not m-2 or m-3
      expect(result.conversationHistory.length).toBe(1);
      expect(result.conversationHistory[0].content).toContain("Let us discuss the unit economics");
    });
  });

  describe("co-founder co-mention directives", () => {
    it("injects strategy directive for @K AI when both co-founders are tagged", () => {
      const result = buildAIContext({
        personaId: "k_ai",
        channelId: "strategy",
        channelName: "strategy",
        userPrompt: "@K AI @N AI should we ship the freemium tier?",
        senderId: "karthik",
        messages: [],
        users: MOCK_USERS,
      });

      expect(result.systemInstruction).toContain("CO-FOUNDER CO-MENTION DIRECTIVE:");
      expect(result.systemInstruction).toContain(
        "Focus your response on the strategic vision, market positioning, moat, and growth opportunities. Leave the operational risk",
      );
    });

    it("injects operations directive for @N AI when both co-founders are tagged", () => {
      const result = buildAIContext({
        personaId: "n_ai",
        channelId: "strategy",
        channelName: "strategy",
        userPrompt: "@K AI @N AI should we ship the freemium tier?",
        senderId: "karthik",
        messages: [],
        users: MOCK_USERS,
      });

      expect(result.systemInstruction).toContain("CO-FOUNDER CO-MENTION DIRECTIVE:");
      expect(result.systemInstruction).toContain(
        "Focus your response on operational feasibility, system reliability, risk mitigation, and cost/runway discipline. Leave high-level market vision",
      );
    });
  });
});
