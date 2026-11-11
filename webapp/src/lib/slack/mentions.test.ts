import { describe, it, expect } from "vitest";
import {
  detectAIMentions,
  extractMentionQuery,
  isAIMention,
} from "./mentions";

describe("slack mentions utility", () => {
  describe("detectAIMentions", () => {
    it("detects canonical @K AI mention", () => {
      expect(detectAIMentions("@K AI what is the product roadmap?")).toEqual(["k_ai"]);
    });

    it("detects canonical @N AI mention", () => {
      expect(detectAIMentions("@N AI check latency metrics")).toEqual(["n_ai"]);
    });

    it("detects lowercase, uppercase, and alias forms of K AI", () => {
      expect(detectAIMentions("@k ai plan")).toEqual(["k_ai"]);
      expect(detectAIMentions("@kai plan")).toEqual(["k_ai"]);
      expect(detectAIMentions("@KAI plan")).toEqual(["k_ai"]);
      expect(detectAIMentions("@k-ai plan")).toEqual(["k_ai"]);
      expect(detectAIMentions("@K-AI plan")).toEqual(["k_ai"]);
    });

    it("detects lowercase, uppercase, and alias forms of N AI", () => {
      expect(detectAIMentions("@n ai report")).toEqual(["n_ai"]);
      expect(detectAIMentions("@nai report")).toEqual(["n_ai"]);
      expect(detectAIMentions("@NAI report")).toEqual(["n_ai"]);
      expect(detectAIMentions("@n-ai report")).toEqual(["n_ai"]);
      expect(detectAIMentions("@N-AI report")).toEqual(["n_ai"]);
    });

    it("detects dual mentions in order of appearance", () => {
      expect(detectAIMentions("@K AI and @N AI, what is the strategy vs ops trade-off?")).toEqual([
        "k_ai",
        "n_ai",
      ]);
      expect(detectAIMentions("@N AI check operational risks before @K AI decides")).toEqual([
        "n_ai",
        "k_ai",
      ]);
    });

    it("detects mentions wrapped in punctuation or brackets", () => {
      expect(detectAIMentions("What do you think (@K AI)?")).toEqual(["k_ai"]);
      expect(detectAIMentions('Please check "[@N AI]" for details.')).toEqual(["n_ai"]);
      expect(detectAIMentions("Hey @K AI: do we have bandwidth?")).toEqual(["k_ai"]);
    });

    it("does not falsely match email addresses", () => {
      expect(detectAIMentions("Reach out to founder@kaitech.com")).toEqual([]);
      expect(detectAIMentions("Send to dev@nail.org for review")).toEqual([]);
    });

    it("returns empty array when no mention exists", () => {
      expect(detectAIMentions("")).toEqual([]);
      expect(detectAIMentions("Hello team, great job today!")).toEqual([]);
      expect(detectAIMentions("The AI engine is working well")).toEqual([]);
    });
  });

  describe("extractMentionQuery", () => {
    it("strips mention handle and polite preambles", () => {
      expect(extractMentionQuery("Hey @K AI, what is our CAC target?")).toBe("what is our CAC target?");
      expect(extractMentionQuery("Hello @N AI: review the deployment log.")).toBe("review the deployment log.");
      expect(extractMentionQuery("Hi @kai, can we ship today?")).toBe("can we ship today?");
      expect(extractMentionQuery("Quick question @n-ai, what is the DB latency?")).toBe("what is the DB latency?");
    });

    it("strips multiple mentions", () => {
      expect(
        extractMentionQuery("@K AI @N AI should we launch self-serve pricing?"),
      ).toBe("should we launch self-serve pricing?");
    });

    it("handles text with mention at the end", () => {
      expect(extractMentionQuery("What is our competitive moat @K AI?")).toBe(
        "What is our competitive moat?",
      );
    });

    it("preserves original text if stripped query is empty", () => {
      expect(extractMentionQuery("@K AI")).toBe("@K AI");
    });
  });

  describe("isAIMention", () => {
    it("identifies AI mention tokens correctly", () => {
      expect(isAIMention("@K AI")).toBe(true);
      expect(isAIMention("@k ai")).toBe(true);
      expect(isAIMention("@N AI")).toBe(true);
      expect(isAIMention("@nai")).toBe(true);
      expect(isAIMention("@k-ai")).toBe(true);
      expect(isAIMention("@Karthik")).toBe(false);
      expect(isAIMention("hello")).toBe(false);
      expect(isAIMention("")).toBe(false);
    });
  });
});
