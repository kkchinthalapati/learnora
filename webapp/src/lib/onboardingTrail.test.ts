import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_TRAIL,
  ONBOARDING_TRAIL_KEY,
  createTrailWriter,
  exitTrail,
  reachStep,
  readTrail,
  type OnboardingTrail,
} from "./onboardingTrail";

const t0 = new Date("2026-11-05T10:00:00.000Z");
const t1 = new Date("2026-11-05T10:01:00.000Z");

describe("reachStep", () => {
  it("keeps the first visit's time and always moves `last`", () => {
    const a = reachStep(EMPTY_TRAIL, "board", t0);
    const b = reachStep(reachStep(a, "start", t1), "board", t1);
    expect(b.steps).toEqual({ board: t0.toISOString(), start: t1.toISOString() });
    expect(b.last).toBe("board");
  });
});

describe("exitTrail", () => {
  it("keeps the first exit", () => {
    const once = exitTrail(EMPTY_TRAIL, "plan", t0);
    expect(exitTrail(once, "skip", t1)).toBe(once);
    expect(once).toMatchObject({ exit: "plan", exitAt: t0.toISOString() });
  });
});

describe("readTrail", () => {
  it("restores a saved trail so a reload adds to it", () => {
    const saved: OnboardingTrail = {
      ...reachStep(EMPTY_TRAIL, "lesson_wait", t0),
      board: "other",
    };
    expect(readTrail({ [ONBOARDING_TRAIL_KEY]: saved })).toEqual(saved);
  });

  it("drops anything malformed rather than trusting it", () => {
    expect(readTrail(null)).toEqual(EMPTY_TRAIL);
    expect(readTrail({ [ONBOARDING_TRAIL_KEY]: { v: 2 } })).toEqual(EMPTY_TRAIL);
    expect(
      readTrail({
        [ONBOARDING_TRAIL_KEY]: {
          v: 1,
          steps: { board: "x", nope: "y", check: 3 },
          last: "nope",
          board: 7,
          exit: "teleport",
        },
      }),
    ).toEqual({ ...EMPTY_TRAIL, steps: { board: "x" } });
  });
});

describe("createTrailWriter", () => {
  it("writes the whole trail, in order, and skips repeats", async () => {
    const writes: OnboardingTrail[] = [];
    let release: () => void = () => {};
    const save = vi.fn(async (data: Record<string, unknown>) => {
      /* The first write is slow; the second must still land after it. */
      if (writes.length === 0) await new Promise<void>((r) => (release = r));
      writes.push(data[ONBOARDING_TRAIL_KEY] as OnboardingTrail);
    });
    const w = createTrailWriter(EMPTY_TRAIL, save);
    void w.reach("board");
    void w.reach("board");
    void w.board("gcse");
    const done = w.exit("skip");
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    release();
    await done;
    expect(writes.map((x) => [x.last, x.board, x.exit])).toEqual([
      ["board", null, null],
      ["board", "gcse", null],
      ["board", "gcse", "skip"],
    ]);
  });

  it("swallows a failed write and carries on", async () => {
    const save = vi
      .fn<(data: Record<string, unknown>) => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const w = createTrailWriter(EMPTY_TRAIL, save);
    void w.reach("board");
    await w.reach("start");
    expect(save).toHaveBeenCalledTimes(2);
    expect(w.current.steps.start).toBeDefined();
  });
});
