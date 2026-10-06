import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHintLadder, resetHintRequests } from "./aiHints";
import { callEdge } from "./ai";
import { advanceRung, getRung } from "../lib/hintState";

vi.mock("./ai", async (orig) => ({ ...(await orig<typeof import("./ai")>()), callEdge: vi.fn() }));

const Q = { question: "What is the gradient of y = 3x + 2?", choices: ["2", "3", "5"], correctIndex: 1 };
const GOOD = JSON.stringify({ nudge: "Look at y = mx + c.", step: "Which number multiplies x?", worked: "m = 3, so the gradient is 3." });

beforeEach(() => {
  localStorage.clear();
  resetHintRequests();
  vi.mocked(callEdge).mockReset();
});

describe("getHintLadder", () => {
  it("bills one call however many times it's asked at once, and caches it", async () => {
    vi.mocked(callEdge).mockResolvedValue({ text: GOOD } as never);
    const [a, b] = await Promise.all([getHintLadder(Q, "Year 10"), getHintLadder(Q, "Year 10")]);
    expect(a.ladder?.worked).toContain("3");
    expect(b).toEqual(a);
    await getHintLadder(Q, "Year 10");
    expect(callEdge).toHaveBeenCalledTimes(1);
    expect(callEdge).toHaveBeenCalledWith(expect.objectContaining({ tool: "chat", mode: "quiz" }));
  });

  it("works offline after the first fetch", async () => {
    vi.mocked(callEdge).mockResolvedValueOnce({ text: GOOD } as never);
    await getHintLadder(Q, "Year 10");
    vi.mocked(callEdge).mockRejectedValue(new TypeError("Failed to fetch"));
    expect((await getHintLadder(Q, "Year 10")).ladder).toBeTruthy();
  });

  it("retries an unusable reply once, then degrades instead of inventing hints", async () => {
    vi.mocked(callEdge).mockResolvedValue({ text: "I can't help with that." } as never);
    const r = await getHintLadder(Q);
    expect(r.degraded?.message).toBeTruthy();
    expect(callEdge).toHaveBeenCalledTimes(2);
  });
});

describe("hint state per attempt", () => {
  it("survives a reload and never moves backwards on a retried click", () => {
    expect(getRung("att-1", "qk")).toBe(0);
    advanceRung("att-1", "qk", 1);
    advanceRung("att-1", "qk", 1);
    expect(getRung("att-1", "qk")).toBe(1);
    advanceRung("att-1", "qk", 2);
    advanceRung("att-1", "qk", 1);
    expect(getRung("att-1", "qk")).toBe(2);
    expect(getRung("att-2", "qk")).toBe(0);
  });
});
