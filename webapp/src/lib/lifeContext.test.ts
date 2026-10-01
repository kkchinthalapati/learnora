import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LIFE_CONTEXT,
  LIFE_CONTEXT_KEY,
  commitmentMinutes,
  createCommitment,
  formatDuration,
  fromMinutes,
  isLifeContextConfigured,
  loadLifeContext,
  normalizeLifeContext,
  saveLifeContext,
  toMinutes,
} from "./lifeContext";

afterEach(() => {
  localStorage.clear();
});

describe("toMinutes / fromMinutes", () => {
  it("round-trips a valid time", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(fromMinutes(570)).toBe("09:30");
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("23:59")).toBe(1439);
  });

  it("rejects anything that is not a real 24-hour time", () => {
    /* Returning null rather than 0 is the whole point — a coerced 0 would
       schedule study at midnight and look like a scheduler bug, not a typo. */
    expect(toMinutes("24:00")).toBeNull();
    expect(toMinutes("9:30")).toBeNull();
    expect(toMinutes("09:60")).toBeNull();
    expect(toMinutes("")).toBeNull();
    expect(toMinutes("nine")).toBeNull();
  });

  it("clamps fromMinutes to the day", () => {
    expect(fromMinutes(-30)).toBe("00:00");
    expect(fromMinutes(99999)).toBe("23:59");
  });
});

describe("formatDuration", () => {
  it("speaks hours and minutes the way a student would", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(80)).toBe("1h 20m");
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("commitmentMinutes", () => {
  it("returns the span of a well-formed commitment", () => {
    const c = createCommitment({ start: "09:00", end: "10:30" });
    expect(commitmentMinutes(c)).toEqual({ startMin: 540, endMin: 630 });
  });

  it("rejects an end that does not come after its start", () => {
    /* Overnight spans are out of scope by design; the engine indexes strictly
       by local date and a wrapping block would belong to two of them. */
    expect(
      commitmentMinutes(createCommitment({ start: "22:00", end: "06:00" })),
    ).toBeNull();
    expect(
      commitmentMinutes(createCommitment({ start: "09:00", end: "09:00" })),
    ).toBeNull();
  });

  it("rejects malformed times", () => {
    expect(
      commitmentMinutes(createCommitment({ start: "oops", end: "10:00" })),
    ).toBeNull();
  });
});

describe("createCommitment", () => {
  it("gives every commitment a distinct id", () => {
    expect(createCommitment().id).not.toBe(createCommitment().id);
  });
});

describe("normalizeLifeContext", () => {
  it("falls back to defaults for junk", () => {
    expect(normalizeLifeContext(null)).toEqual(DEFAULT_LIFE_CONTEXT);
    expect(normalizeLifeContext("nope")).toEqual(DEFAULT_LIFE_CONTEXT);
    expect(normalizeLifeContext(42)).toEqual(DEFAULT_LIFE_CONTEXT);
  });

  it("survives a stored object missing every array", () => {
    const ctx = normalizeLifeContext({ wakeTime: "06:00" });
    expect(ctx.commitments).toEqual([]);
    expect(ctx.protectedDays).toEqual([]);
    expect(ctx.wakeTime).toBe("06:00");
  });

  it("drops commitments that could never be honoured", () => {
    const ctx = normalizeLifeContext({
      commitments: [
        {
          id: "a",
          label: "Lecture",
          kind: "class",
          days: [1],
          start: "09:00",
          end: "10:00",
        },
        {
          id: "b",
          label: "Broken",
          kind: "class",
          days: [2],
          start: "10:00",
          end: "09:00",
        },
        null,
      ],
    });
    expect(ctx.commitments.map((c) => c.id)).toEqual(["a"]);
  });

  it("filters weekday arrays down to real weekday indices", () => {
    const ctx = normalizeLifeContext({
      protectedDays: [0, 7, -1, 3, "mon"],
      commitments: [
        {
          id: "a",
          label: "x",
          kind: "class",
          days: [1, 9],
          start: "09:00",
          end: "10:00",
        },
      ],
    });
    expect(ctx.protectedDays).toEqual([0, 3]);
    expect(ctx.commitments[0].days).toEqual([1]);
  });

  it("repairs a sleep time that does not come after waking", () => {
    /* Left alone this produces a negative day, every window comes out empty,
       and the student reads that as "the feature is broken". */
    const ctx = normalizeLifeContext({ wakeTime: "08:00", sleepTime: "07:00" });
    expect(ctx.sleepTime).toBe(DEFAULT_LIFE_CONTEXT.sleepTime);
  });

  it("clamps numbers into their ranges and keeps max >= min", () => {
    const ctx = normalizeLifeContext({
      weekdayCapacityMins: 99999,
      bufferMins: -5,
      minBlockMins: 90,
      maxBlockMins: 20,
    });
    expect(ctx.weekdayCapacityMins).toBe(900);
    expect(ctx.bufferMins).toBe(0);
    expect(ctx.minBlockMins).toBe(90);
    expect(ctx.maxBlockMins).toBeGreaterThanOrEqual(ctx.minBlockMins);
  });

  it("rejects an unknown chronotype", () => {
    expect(normalizeLifeContext({ chronotype: "vampire" }).chronotype).toBe(
      "neutral",
    );
  });
});

describe("isLifeContextConfigured", () => {
  it("is false until the student tells us something real", () => {
    expect(isLifeContextConfigured(DEFAULT_LIFE_CONTEXT)).toBe(false);
  });

  it("is true with a commitment or an imported calendar", () => {
    expect(
      isLifeContextConfigured({
        ...DEFAULT_LIFE_CONTEXT,
        commitments: [createCommitment({ days: [1] })],
      }),
    ).toBe(true);
    expect(
      isLifeContextConfigured({
        ...DEFAULT_LIFE_CONTEXT,
        importedIcs: "BEGIN:VCALENDAR",
      }),
    ).toBe(true);
  });
});

describe("load / save", () => {
  it("round-trips through localStorage", () => {
    const ctx = {
      ...DEFAULT_LIFE_CONTEXT,
      wakeTime: "06:15",
      chronotype: "night" as const,
    };
    saveLifeContext(ctx);
    expect(loadLifeContext().wakeTime).toBe("06:15");
    expect(loadLifeContext().chronotype).toBe("night");
  });

  it("degrades to defaults when the stored value is corrupt", () => {
    localStorage.setItem(LIFE_CONTEXT_KEY, "{not json");
    expect(loadLifeContext()).toEqual(DEFAULT_LIFE_CONTEXT);
  });
});
