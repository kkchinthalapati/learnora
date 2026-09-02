import { describe, expect, it } from "vitest";
import {
  autoSchedule,
  blocksOn,
  scheduledMinutes,
  urgencyScore,
  type ScheduleOptions,
  type StudyDemand,
} from "./autoSchedule";
import type { FreeWindow } from "./availability";

const TODAY = "2026-09-01";

const OPTIONS: ScheduleOptions = {
  maxBlockMins: 50,
  minBlockMins: 25,
  breakMins: 10,
  today: TODAY,
};

function win(
  date: string,
  startMin: number,
  endMin: number,
  energy = 0.7,
): FreeWindow {
  return { date, startMin, endMin, energy };
}

function demand(patch: Partial<StudyDemand> & { id: string }): StudyDemand {
  return { label: patch.id, kind: "task", estMins: 30, load: 2, ...patch };
}

describe("urgencyScore", () => {
  it("puts an overdue item above everything", () => {
    const late = demand({ id: "late", dueDate: "2026-08-30" });
    const today = demand({ id: "today", dueDate: TODAY });
    expect(urgencyScore(late, TODAY)).toBeGreaterThan(
      urgencyScore(today, TODAY),
    );
  });

  it("decays with distance to the deadline", () => {
    const soon = demand({ id: "a", dueDate: "2026-09-02" });
    const later = demand({ id: "b", dueDate: "2026-09-20" });
    expect(urgencyScore(soon, TODAY)).toBeGreaterThan(
      urgencyScore(later, TODAY),
    );
  });

  it("keeps undated work below anything with a near deadline", () => {
    const undated = demand({ id: "u", dueDate: null });
    const dated = demand({ id: "d", dueDate: "2026-09-03" });
    expect(urgencyScore(dated, TODAY)).toBeGreaterThan(
      urgencyScore(undated, TODAY),
    );
  });

  it("holds reviews above ordinary undated tasks", () => {
    /* Memory decays on its own schedule; a skipped review costs more later
       than it saves today. */
    const review = demand({ id: "r", kind: "review", dueDate: null });
    const task = demand({ id: "t", kind: "task", dueDate: null });
    expect(urgencyScore(review, TODAY)).toBeGreaterThan(
      urgencyScore(task, TODAY),
    );
  });

  it("respects an explicit boost", () => {
    const plain = demand({ id: "a" });
    const boosted = demand({ id: "b", boost: 25 });
    expect(urgencyScore(boosted, TODAY)).toBeGreaterThan(
      urgencyScore(plain, TODAY),
    );
  });
});

describe("autoSchedule — placement", () => {
  it("places a demand into the only window there is", () => {
    const { blocks, unplaced } = autoSchedule(
      [demand({ id: "t1", estMins: 30 })],
      [win(TODAY, 540, 660)],
      OPTIONS,
    );
    expect(unplaced).toEqual([]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      date: TODAY,
      startMin: 540,
      endMin: 570,
      demandId: "t1",
    });
  });

  it("returns nothing at all when there are no windows", () => {
    const { blocks, unplaced } = autoSchedule(
      [demand({ id: "t1" })],
      [],
      OPTIONS,
    );
    expect(blocks).toEqual([]);
    expect(unplaced).toHaveLength(1);
  });

  it("ignores a zero-length demand", () => {
    const { blocks, unplaced } = autoSchedule(
      [demand({ id: "t1", estMins: 0 })],
      [win(TODAY, 540, 660)],
      OPTIONS,
    );
    expect(blocks).toEqual([]);
    expect(unplaced).toEqual([]);
  });

  it("leaves a break between consecutive blocks", () => {
    const { blocks } = autoSchedule(
      [demand({ id: "a", estMins: 30 }), demand({ id: "b", estMins: 30 })],
      [win(TODAY, 540, 720)],
      OPTIONS,
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[1].startMin - blocks[0].endMin).toBe(OPTIONS.breakMins);
  });

  it("returns blocks in clock order regardless of the order it chose them", () => {
    const { blocks } = autoSchedule(
      [
        demand({ id: "later", dueDate: "2026-09-20", estMins: 30 }),
        demand({ id: "urgent", dueDate: TODAY, estMins: 30 }),
      ],
      [win(TODAY, 540, 720)],
      OPTIONS,
    );
    expect(blocks.map((b) => b.startMin)).toEqual(
      [...blocks.map((b) => b.startMin)].sort((a, b) => a - b),
    );
    expect(blocks[0].demandId).toBe("urgent");
  });

  it("splits a long demand and labels the parts", () => {
    const { blocks } = autoSchedule(
      [demand({ id: "big", estMins: 100 })],
      [win(TODAY, 540, 780)],
      OPTIONS,
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0].endMin - blocks[0].startMin).toBe(50);
    expect(blocks.map((b) => b.part)).toEqual([
      { index: 1, total: 2 },
      { index: 2, total: 2 },
    ]);
  });

  it("does not mark a single-sitting demand as a part", () => {
    const { blocks } = autoSchedule(
      [demand({ id: "small", estMins: 30 })],
      [win(TODAY, 540, 660)],
      OPTIONS,
    );
    expect(blocks[0].part).toBeUndefined();
  });

  it("folds an unusable tail into the last block rather than reporting it", () => {
    /* Ten leftover minutes is not a second sitting, and calling it unplaced
       would be alarming and useless. */
    const { blocks, unplaced } = autoSchedule(
      [demand({ id: "odd", estMins: 60 })],
      [win(TODAY, 540, 660)],
      OPTIONS,
    );
    expect(unplaced).toEqual([]);
    expect(scheduledMinutes(blocks)).toBe(60);
    expect(blocks).toHaveLength(1);
  });

  it("carries a block's subject, folder and link through to the schedule", () => {
    const { blocks } = autoSchedule(
      [
        demand({
          id: "t",
          subject: "Chemistry",
          folderId: "f1",
          href: "/tasks",
        }),
      ],
      [win(TODAY, 540, 660)],
      OPTIONS,
    );
    expect(blocks[0]).toMatchObject({
      subject: "Chemistry",
      folderId: "f1",
      href: "/tasks",
    });
  });

  it("gives the same answer for the same inputs", () => {
    /* The timeline recomputes on every render; a day that reshuffled itself
       under the student would destroy the only thing it is selling. */
    const demands = [
      demand({ id: "a", estMins: 40, load: 3, dueDate: "2026-09-03" }),
      demand({ id: "b", estMins: 30, load: 1 }),
      demand({ id: "c", estMins: 55, load: 2, dueDate: "2026-09-02" }),
    ];
    const windows = [
      win(TODAY, 480, 660, 0.9),
      win("2026-09-02", 600, 900, 0.5),
    ];
    const first = autoSchedule(demands, windows, OPTIONS);
    const second = autoSchedule(demands, windows, OPTIONS);
    expect(second).toEqual(first);
  });
});

describe("autoSchedule — deadlines", () => {
  it("never places work after its due date", () => {
    const { blocks } = autoSchedule(
      [demand({ id: "due-today", estMins: 30, dueDate: TODAY })],
      [win("2026-09-02", 540, 720, 0.95), win(TODAY, 540, 720, 0.2)],
      OPTIONS,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].date).toBe(TODAY);
  });

  it("reports the shortfall rather than moving the deadline", () => {
    const { blocks, unplaced } = autoSchedule(
      [demand({ id: "big", estMins: 240, dueDate: TODAY })],
      [win(TODAY, 540, 600), win("2026-09-02", 540, 900)],
      OPTIONS,
    );
    expect(blocks.every((b) => b.date === TODAY)).toBe(true);
    expect(unplaced).toHaveLength(1);
    expect(unplaced[0]).toMatchObject({ reason: "no-room-before-due" });
    expect(unplaced[0].remainingMins).toBeGreaterThan(0);
  });

  it("distinguishes a full week from a missed deadline", () => {
    const { unplaced } = autoSchedule(
      [demand({ id: "someday", estMins: 200, dueDate: null })],
      [win(TODAY, 540, 600)],
      OPTIONS,
    );
    expect(unplaced[0].reason).toBe("week-is-full");
  });

  it("serves the more urgent demand first when they compete for one window", () => {
    const { blocks } = autoSchedule(
      [
        demand({ id: "next-week", estMins: 50, dueDate: "2026-09-08" }),
        demand({ id: "tomorrow", estMins: 50, dueDate: "2026-09-02" }),
      ],
      [win(TODAY, 540, 600)],
      OPTIONS,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].demandId).toBe("tomorrow");
  });
});

describe("autoSchedule — energy", () => {
  const morning = win(TODAY, 480, 560, 0.95);
  const evening = win(TODAY, 1140, 1220, 0.25);

  it("spends the good window on the hard work", () => {
    const { blocks } = autoSchedule(
      [demand({ id: "hard", estMins: 45, load: 3 })],
      [morning, evening],
      OPTIONS,
    );
    expect(blocks[0].startMin).toBe(morning.startMin);
    expect(blocks[0].energy).toBe(0.95);
  });

  it("sends mechanical work to the tired window so the peak stays free", () => {
    const { blocks } = autoSchedule(
      [demand({ id: "cards", estMins: 30, load: 1 })],
      [morning, evening],
      OPTIONS,
    );
    expect(blocks[0].startMin).toBe(evening.startMin);
  });

  it("keeps the peak for the hard work when both compete", () => {
    const { blocks } = autoSchedule(
      [
        demand({ id: "cards", kind: "review", estMins: 30, load: 1 }),
        demand({ id: "hard", estMins: 45, load: 3, dueDate: "2026-09-04" }),
      ],
      [morning, evening],
      OPTIONS,
    );
    const byId = Object.fromEntries(blocks.map((b) => [b.demandId, b]));
    expect(byId.hard.startMin).toBe(morning.startMin);
    expect(byId.cards.startMin).toBe(evening.startMin);
  });

  it("prefers a good-enough window today over a better one next week", () => {
    const { blocks } = autoSchedule(
      [demand({ id: "hard", estMins: 40, load: 3, dueDate: "2026-09-05" })],
      [win(TODAY, 540, 620, 0.75), win("2026-09-04", 540, 620, 0.85)],
      OPTIONS,
    );
    expect(blocks[0].date).toBe(TODAY);
  });
});

describe("blocksOn / scheduledMinutes", () => {
  const { blocks } = autoSchedule(
    [
      demand({ id: "a", estMins: 30, dueDate: TODAY }),
      demand({ id: "b", estMins: 30, dueDate: "2026-09-02" }),
    ],
    /* Today has room for exactly one sitting, so the second demand is forced
       onto tomorrow — otherwise "sooner beats better" puts both today, which
       is right for the scheduler and useless for testing the filter. */
    [win(TODAY, 540, 575), win("2026-09-02", 540, 660)],
    OPTIONS,
  );

  it("filters to one date", () => {
    expect(blocksOn(blocks, TODAY).map((b) => b.demandId)).toEqual(["a"]);
  });

  it("totals minutes for a date and for the whole schedule", () => {
    expect(scheduledMinutes(blocks, TODAY)).toBe(30);
    expect(scheduledMinutes(blocks)).toBe(60);
  });
});

describe("autoSchedule — demands smaller than a block", () => {
  it("still places a demand shorter than the minimum block", () => {
    /* Ten minutes of due cards is worth doing. An earlier version only ever
       looked for windows with a full block of room, so a demand this size was
       dropped without being placed *or* reported — it simply disappeared. */
    const { blocks, unplaced } = autoSchedule(
      [demand({ id: "quick", estMins: 10, kind: "review", load: 1 })],
      [win(TODAY, 540, 660)],
      OPTIONS,
    );
    expect(unplaced).toEqual([]);
    expect(blocks).toHaveLength(1);
    expect(scheduledMinutes(blocks)).toBe(10);
  });

  it("reports a small demand that genuinely has nowhere to go", () => {
    const { blocks, unplaced } = autoSchedule(
      [demand({ id: "quick", estMins: 10 })],
      [],
      OPTIONS,
    );
    expect(blocks).toEqual([]);
    expect(unplaced[0].remainingMins).toBe(10);
  });

  it("does not report a few stray minutes as a shortfall", () => {
    /* "4 minutes didn't fit" is technically true and pure noise. */
    const { unplaced } = autoSchedule(
      [demand({ id: "t", estMins: 54 })],
      [win(TODAY, 540, 590)],
      OPTIONS,
    );
    expect(unplaced).toEqual([]);
  });
});
