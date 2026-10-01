import { describe, expect, it, vi } from "vitest";

/* A spent daily allowance used to be answered with canned, topic-agnostic
   tutoring under a banner saying the AI was unavailable (Socratic), or with
   a template draft and no banner at all (Teach). A 429 must reach the
   student as itself; a genuine outage keeps its labelled fallback. */
vi.mock("./ai", async (orig) => ({ ...(await orig<typeof import("./ai")>()), callEdge: vi.fn() }));

import { AiError, callEdge } from "./ai";
import { startSparringSession } from "./aiSparring";
import { generateApprenticeDraft } from "./aiFeynman";

const limit = () =>
  new AiError("You've used today's allowance for this tool on the free plan.", {
    retryable: false,
    status: 429,
  });

async function settle<T>(p: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  try {
    return { value: await p };
  } catch (error) {
    return { error };
  }
}

describe("daily limit vs outage", () => {
  it("Socratic: a 429 is thrown, not replaced by the question bank", async () => {
    vi.mocked(callEdge).mockImplementationOnce(async () => {
      throw limit();
    });
    const { error } = await settle(startSparringSession("enzymes"));
    expect((error as AiError).status).toBe(429);
  });

  it("Socratic: an outage still gets the labelled built-in opening", async () => {
    vi.mocked(callEdge).mockImplementationOnce(async () => {
      throw new Error("network");
    });
    const { value } = await settle(startSparringSession("enzymes"));
    expect(value?.offline).toBe("unavailable");
  });

  it("Teach: a 429 is thrown; an unusable reply is flagged as a template", async () => {
    vi.mocked(callEdge).mockImplementationOnce(async () => {
      throw limit();
    });
    const limited = await settle(generateApprenticeDraft("Biology", "enzymes"));
    expect((limited.error as AiError).status).toBe(429);

    vi.mocked(callEdge).mockResolvedValueOnce({ text: "not json" });
    const draft = await generateApprenticeDraft("Biology", "enzymes");
    expect(draft.fromTemplate).toBe(true);
  });
});
