import { describe, expect, it } from "vitest";
import {
  availabilityRange,
  busyBlocksForDate,
  capacityForDate,
  commitmentsOn,
  dayAvailability,
  energyAt,
  mergeBusy,
  trimToCapacity,
  windowEnergy,
} from "./availability";
import {
  DEFAULT_LIFE_CONTEXT,
  createCommitment,
  toMinutes,
  type LifeContext,
} from "./lifeContext";
import type { IcsEvent } from "./icsImport";

// 2026-09-01 is a Tuesday; 2026-09-05 a Saturday.
const TUESDAY = "2026-09-01";
const SATURDAY = "2026-09-05";

function ctx(patch: Partial<LifeContext> = {}): LifeContext {
  return { ...DEFAULT_LIFE_CONTEXT, ...patch };
}

const at = (time: string) => toMinutes(time)!;

describe("energyAt", () => {
  it("peaks in the morning for an early type and in the evening for a night owl", () => {
    expect(energyAt("early", at("09:00"))).toBeGreaterThan(
      energyAt("early", at("21:00")),
    );
    expect(energyAt("night", at("21:00"))).toBeGreaterThan(
      energyAt("night", at("09:00")),
    );
  });

  it("dips after lunch for every type", () => {
    for (const type of ["early", "neutral", "night"] as const) {
      expect(energyAt(type, at("13:00"))).toBeLessThan(
        energyAt(type, at("15:30")),
      );
    }
  });

  it("stays inside 0-1 across the whole day", () => {
    for (let m = 0; m <= 1440; m += 15) {
      const e = energyAt("neutral", m);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
  });
});

describe("windowEnergy", () => {
  it("samples the window rather than reading its midpoint", () => {
    /* A 12:00-16:00 window contains the dip. Scoring it by its 14:00 midpoint
       alone would misprice it against a clean 14:00-16:00 window. */
    const wide = windowEnergy("neutral", at("12:00"), at("16:00"));
    const clean = windowEnergy("neutral", at("15:00"), at("16:00"));
    expect(clean).toBeGreaterThan(wide);
  });

  it("is zero for an empty window", () => {
    expect(windowEnergy("neutral", 600, 600)).toBe(0);
  });
});

describe("capacityForDate", () => {
  it("uses the weekend number at the weekend", () => {
    const c = ctx({ weekdayCapacityMins: 100, weekendCapacityMins: 300 });
    expect(capacityForDate(c, TUESDAY)).toBe(100);
    expect(capacityForDate(c, SATURDAY)).toBe(300);
  });
});

describe("commitmentsOn", () => {
  it("only returns commitments that fall on the weekday", () => {
    const tue = createCommitment({
      label: "Lecture",
      days: [2],
      start: "09:00",
      end: "10:00",
    });
    const wed = createCommitment({
      label: "Lab",
      days: [3],
      start: "09:00",
      end: "10:00",
    });
    expect(commitmentsOn([tue, wed], TUESDAY, 2).map((b) => b.label)).toEqual([
      "Lecture",
    ]);
  });

  it("labels an unnamed commitment rather than rendering a blank row", () => {
    const c = createCommitment({ label: "  ", days: [2] });
    expect(commitmentsOn([c], TUESDAY, 2)[0].label).toBe("Commitment");
  });

  it("marks a shift as draining and a lecture as not", () => {
    const shift = createCommitment({
      kind: "work",
      days: [2],
      start: "09:00",
      end: "17:00",
    });
    const lecture = createCommitment({
      kind: "class",
      days: [2],
      start: "09:00",
      end: "10:00",
    });
    expect(commitmentsOn([shift], TUESDAY, 2)[0].draining).toBe(true);
    expect(commitmentsOn([lecture], TUESDAY, 2)[0].draining).toBe(false);
  });
});

describe("busyBlocksForDate", () => {
  const calendar: IcsEvent[] = [
    {
      date: TUESDAY,
      startMin: at("14:00"),
      endMin: at("15:00"),
      label: "Dentist",
      allDay: false,
    },
    {
      date: TUESDAY,
      startMin: 0,
      endMin: 0,
      label: "Reading week",
      allDay: true,
    },
    {
      date: "2026-09-02",
      startMin: at("09:00"),
      endMin: at("10:00"),
      label: "Other day",
      allDay: false,
    },
  ];

  it("merges commitments and imported events for the date only", () => {
    const c = ctx({
      commitments: [
        createCommitment({
          label: "Lecture",
          days: [2],
          start: "09:00",
          end: "10:00",
        }),
      ],
    });
    expect(busyBlocksForDate(c, TUESDAY, calendar).map((b) => b.label)).toEqual(
      ["Lecture", "Dentist"],
    );
  });

  it("never treats an all-day entry as busy", () => {
    expect(
      busyBlocksForDate(ctx(), TUESDAY, calendar).map((b) => b.label),
    ).toEqual(["Dentist"]);
  });
});

describe("mergeBusy", () => {
  it("pads each block and merges what then overlaps", () => {
    /* Back-to-back lectures must not leave a phantom window made of nothing
       but the two buffers. */
    const merged = mergeBusy(
      [
        { startMin: 540, endMin: 600 },
        { startMin: 600, endMin: 660 },
      ],
      15,
    );
    expect(merged).toEqual([{ startMin: 525, endMin: 675 }]);
  });

  it("leaves genuinely separate blocks separate", () => {
    const merged = mergeBusy(
      [
        { startMin: 540, endMin: 600 },
        { startMin: 900, endMin: 960 },
      ],
      15,
    );
    expect(merged).toHaveLength(2);
  });

  it("clamps padding to the day", () => {
    expect(mergeBusy([{ startMin: 5, endMin: 30 }], 30)).toEqual([
      { startMin: 0, endMin: 60 },
    ]);
  });
});

describe("dayAvailability", () => {
  it("offers the whole waking day when nothing is booked and capacity allows", () => {
    const day = dayAvailability(
      ctx({ wakeTime: "08:00", sleepTime: "20:00", weekdayCapacityMins: 900 }),
      TUESDAY,
    );
    expect(day.windows).toHaveLength(1);
    expect(day.windows[0].startMin).toBe(at("08:00"));
    expect(day.windows[0].endMin).toBe(at("20:00"));
  });

  it("never offers more of an empty day than the student's stated capacity", () => {
    /* The honest ceiling is the whole point: an unbooked Saturday is not
       fifteen hours of study, and offering it is how a plan gets abandoned. */
    const day = dayAvailability(ctx({ weekdayCapacityMins: 120 }), TUESDAY);
    expect(day.availableMins).toBe(120);
  });

  it("schedules nothing on a protected day", () => {
    const day = dayAvailability(ctx({ protectedDays: [2] }), TUESDAY);
    expect(day.protectedDay).toBe(true);
    expect(day.windows).toEqual([]);
    expect(day.availableMins).toBe(0);
  });

  it("carves the day around a commitment, buffered on both sides", () => {
    const c = ctx({
      weekdayCapacityMins: 900,
      bufferMins: 15,
      commitments: [
        createCommitment({
          label: "Lecture",
          days: [2],
          start: "09:00",
          end: "11:00",
        }),
      ],
    });
    const day = dayAvailability(c, TUESDAY);
    expect(day.windows.map((w) => [w.startMin, w.endMin])).toEqual([
      [at("07:30"), at("08:45")],
      [at("11:15"), at("23:00")],
    ]);
  });

  it("drops a gap too short to be worth sitting down for", () => {
    const c = ctx({
      weekdayCapacityMins: 900,
      minBlockMins: 30,
      bufferMins: 0,
      commitments: [
        createCommitment({ days: [2], start: "07:30", end: "12:00" }),
        createCommitment({ days: [2], start: "12:20", end: "23:00" }),
      ],
    });
    expect(dayAvailability(c, TUESDAY).windows).toEqual([]);
  });

  it("surfaces all-day entries as notes", () => {
    const day = dayAvailability(ctx(), TUESDAY, [
      {
        date: TUESDAY,
        startMin: 0,
        endMin: 0,
        label: "Mum's birthday",
        allDay: true,
      },
    ]);
    expect(day.notes).toEqual(["Mum's birthday"]);
    expect(day.windows.length).toBeGreaterThan(0);
  });

  it("discounts the hour after a draining commitment", () => {
    const shift = ctx({
      weekdayCapacityMins: 900,
      bufferMins: 0,
      commitments: [
        createCommitment({
          kind: "work",
          days: [2],
          start: "09:00",
          end: "17:00",
        }),
      ],
    });
    const lecture = ctx({
      weekdayCapacityMins: 900,
      bufferMins: 0,
      commitments: [
        createCommitment({
          kind: "class",
          days: [2],
          start: "09:00",
          end: "17:00",
        }),
      ],
    });
    const after = (c: LifeContext) =>
      dayAvailability(c, TUESDAY).windows.find(
        (w) => w.startMin === at("17:00"),
      )!.energy;
    expect(after(shift)).toBeLessThan(after(lecture));
  });

  it("returns nothing when the day's capacity is zero", () => {
    expect(
      dayAvailability(ctx({ weekdayCapacityMins: 0 }), TUESDAY).windows,
    ).toEqual([]);
  });
});

describe("trimToCapacity", () => {
  const w = (startMin: number, endMin: number, energy: number) => ({
    date: TUESDAY,
    startMin,
    endMin,
    energy,
  });

  it("spends the budget on the best windows first", () => {
    const kept = trimToCapacity(
      [w(at("08:00"), at("09:00"), 0.3), w(at("20:00"), at("21:00"), 0.9)],
      60,
      25,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].startMin).toBe(at("20:00"));
  });

  it("returns what it keeps in clock order, whatever order it chose them in", () => {
    const kept = trimToCapacity(
      [w(at("08:00"), at("09:00"), 0.3), w(at("20:00"), at("21:00"), 0.9)],
      120,
      25,
    );
    expect(kept.map((k) => k.startMin)).toEqual([at("08:00"), at("20:00")]);
  });

  it("trims the crossing window from its weaker end", () => {
    /* 12:00-16:00 holds the dip at the front and the recovery at the back, so
       an hour of it should come off the front. */
    const kept = trimToCapacity([w(at("12:00"), at("16:00"), 0.7)], 60, 25);
    expect(kept[0].endMin).toBe(at("16:00"));
    expect(kept[0].startMin).toBe(at("15:00"));
  });

  it("stops rather than offering a scrap smaller than a usable block", () => {
    expect(trimToCapacity([w(at("08:00"), at("12:00"), 0.5)], 10, 25)).toEqual(
      [],
    );
  });

  it("keeps everything when capacity is not the constraint", () => {
    const windows = [
      w(at("08:00"), at("09:00"), 0.3),
      w(at("20:00"), at("21:00"), 0.9),
    ];
    expect(trimToCapacity(windows, 600, 25)).toHaveLength(2);
  });
});

describe("availabilityRange", () => {
  it("returns one entry per day, in order, with the right weekday", () => {
    const days = availabilityRange(ctx(), TUESDAY, 3);
    expect(days.map((d) => d.date)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
    expect(days.map((d) => d.weekday)).toEqual([2, 3, 4]);
  });

  it("reports available minutes matching the windows it returned", () => {
    const c = ctx({ weekdayCapacityMins: 120, weekendCapacityMins: 120 });
    for (const day of availabilityRange(c, TUESDAY, 7)) {
      const summed = day.windows.reduce(
        (s, w) => s + (w.endMin - w.startMin),
        0,
      );
      expect(day.availableMins).toBe(summed);
      expect(day.availableMins).toBeLessThanOrEqual(day.capacityMins);
    }
  });
});
