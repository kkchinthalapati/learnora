import { describe, expect, it } from "vitest";
import { DEFAULT_BLOCK_MINUTES, parseStoredPlan } from "./planMeta";

/* `weekly_plans.plan_json` is model output round-tripped through the database,
 * so by the time the grid sees it nothing about its shape is guaranteed. The
 * vanilla read it optimistically and rendered "undefinedm" when it was wrong. */

describe("parseStoredPlan", () => {
  it("keeps a well-formed plan intact", () => {
    const plan = {
      summary: "Busy week",
      days: [
        {
          date: "2026-08-03",
          blocks: [
            {
              subject: "Biology",
              durationMins: 45,
              startHint: "after dinner",
              reason: "exam on Friday",
            },
          ],
        },
      ],
    };

    expect(parseStoredPlan(plan)).toEqual(plan);
  });

  it("returns null for anything without a days array", () => {
    expect(parseStoredPlan(null)).toBeNull();
    expect(parseStoredPlan("a string")).toBeNull();
    expect(parseStoredPlan({ summary: "no days" })).toBeNull();
    expect(parseStoredPlan([])).toBeNull();
  });

  it("drops days with no date — there is nowhere to put them", () => {
    const parsed = parseStoredPlan({
      days: [{ blocks: [] }, { date: "2026-08-04", blocks: [] }],
    });
    expect(parsed?.days).toHaveLength(1);
    expect(parsed?.days[0].date).toBe("2026-08-04");
  });

  it("drops blocks with no subject rather than rendering a blank row", () => {
    const parsed = parseStoredPlan({
      days: [
        {
          date: "2026-08-03",
          blocks: [{ durationMins: 30 }, { subject: "Maths" }],
        },
      ],
    });
    expect(parsed?.days[0].blocks).toHaveLength(1);
    expect(parsed?.days[0].blocks?.[0].subject).toBe("Maths");
  });

  it("defaults a missing or nonsensical duration instead of showing undefined", () => {
    const parsed = parseStoredPlan({
      days: [
        {
          date: "2026-08-03",
          blocks: [
            { subject: "A" },
            { subject: "B", durationMins: -5 },
            { subject: "C", durationMins: "oops" },
          ],
        },
      ],
    });
    expect(parsed?.days[0].blocks?.map((b) => b.durationMins)).toEqual([
      DEFAULT_BLOCK_MINUTES,
      DEFAULT_BLOCK_MINUTES,
      DEFAULT_BLOCK_MINUTES,
    ]);
  });

  it("coerces a numeric-string duration the model sent as text", () => {
    const parsed = parseStoredPlan({
      days: [
        { date: "2026-08-03", blocks: [{ subject: "A", durationMins: "45" }] },
      ],
    });
    expect(parsed?.days[0].blocks?.[0].durationMins).toBe(45);
  });

  it("treats a missing blocks array as a free day", () => {
    const parsed = parseStoredPlan({ days: [{ date: "2026-08-03" }] });
    expect(parsed?.days[0].blocks).toEqual([]);
  });

  it("drops a non-string summary rather than rendering [object Object]", () => {
    const parsed = parseStoredPlan({ summary: { text: "hi" }, days: [] });
    expect(parsed?.summary).toBeUndefined();
  });
});
