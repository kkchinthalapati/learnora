import { describe, expect, it } from "vitest";
import { AiError } from "./ai";
import { isLimitOrRefusal } from "./aiLimit";

describe("isLimitOrRefusal", () => {
  it("is true for a daily-limit 429 and for a refusal", () => {
    expect(isLimitOrRefusal(new AiError("limit", { retryable: false, status: 429 }))).toBe(true);
    expect(isLimitOrRefusal(new AiError("no", { refused: true, status: 400 }))).toBe(true);
  });
  it("is false for outages and unrelated errors", () => {
    expect(isLimitOrRefusal(new AiError("down", { status: 503 }))).toBe(false);
    expect(isLimitOrRefusal(new Error("network"))).toBe(false);
    expect(isLimitOrRefusal(null)).toBe(false);
  });
});
