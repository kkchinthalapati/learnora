import { describe, expect, it } from "vitest";
import { armFor, experimentTag, RETEST_DELAY, RETEST_DELAY_DAYS } from "./experiments";
import { RESOLVE_AFTER_DAYS, retestDueAt } from "./mistakeLoop";

describe("experiments", () => {
  it("assigns a unit to the same arm every time", () => {
    expect(armFor(RETEST_DELAY, "abc")).toBe(armFor(RETEST_DELAY, "abc"));
  });

  it("splits units roughly evenly across arms", () => {
    const counts: Record<string, number> = { "2d": 0, "4d": 0 };
    for (let i = 0; i < 2000; i++) counts[armFor(RETEST_DELAY, `m-${i}`)] += 1;
    expect(counts["2d"]).toBeGreaterThan(900);
    expect(counts["4d"]).toBeGreaterThan(900);
  });

  it("tags the observation with its arm", () => {
    expect(experimentTag(RETEST_DELAY, "4d")).toBe("[exp retest-delay-v1=4d]");
  });

  it("the longer arm delays the retest; nothing makes it earlier than the resolution rule", () => {
    const now = new Date("2026-10-09T10:00:00Z");
    const day = 86_400_000;
    const two = new Date(retestDueAt(now, 1, RETEST_DELAY_DAYS["2d"])).getTime() - now.getTime();
    const four = new Date(retestDueAt(now, 1, RETEST_DELAY_DAYS["4d"])).getTime() - now.getTime();
    expect(two).toBeGreaterThanOrEqual(RESOLVE_AFTER_DAYS * day);
    expect(four).toBeGreaterThanOrEqual(4 * day);
    const tooEarly = new Date(retestDueAt(now, 1, 0)).getTime() - now.getTime();
    expect(tooEarly).toBeGreaterThanOrEqual(RESOLVE_AFTER_DAYS * day);
  });
});
