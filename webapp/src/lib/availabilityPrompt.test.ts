import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_RULE,
  formatAvailabilityNote,
  formatChronotypeNote,
} from "./availabilityPrompt";
import { availabilityRange } from "./availability";
import { DEFAULT_LIFE_CONTEXT, createCommitment } from "./lifeContext";

// 2026-09-01 is a Tuesday.
const TUESDAY = "2026-09-01";

describe("formatAvailabilityNote", () => {
  it("says None for an empty week", () => {
    expect(formatAvailabilityNote([])).toBe("None");
  });

  it("names the day, its free windows and its ceiling", () => {
    const days = availabilityRange(
      {
        ...DEFAULT_LIFE_CONTEXT,
        wakeTime: "08:00",
        sleepTime: "20:00",
        bufferMins: 0,
        weekdayCapacityMins: 600,
        commitments: [
          createCommitment({
            label: "Chemistry",
            days: [2],
            start: "09:00",
            end: "11:00",
          }),
        ],
      },
      TUESDAY,
      1,
    );
    const note = formatAvailabilityNote(days);
    expect(note).toContain("Tue 2026-09-01");
    expect(note).toContain("free");
    expect(note).toContain("at most");
    expect(note).toContain("busy: Chemistry");
  });

  it("tells the model plainly to leave a protected day alone", () => {
    const days = availabilityRange(
      { ...DEFAULT_LIFE_CONTEXT, protectedDays: [2] },
      TUESDAY,
      1,
    );
    expect(formatAvailabilityNote(days)).toBe(
      "Tue 2026-09-01: day off, schedule nothing",
    );
  });

  it("reports a fully booked day as having no time", () => {
    const days = availabilityRange(
      {
        ...DEFAULT_LIFE_CONTEXT,
        commitments: [
          createCommitment({
            label: "Shift",
            days: [2],
            start: "07:00",
            end: "23:00",
          }),
        ],
      },
      TUESDAY,
      1,
    );
    expect(formatAvailabilityNote(days)).toContain("no time available");
  });

  it("joins a week into one line the prompt can carry", () => {
    const days = availabilityRange(DEFAULT_LIFE_CONTEXT, TUESDAY, 7);
    expect(formatAvailabilityNote(days).split("; ")).toHaveLength(7);
  });
});

describe("formatChronotypeNote", () => {
  it("names the type and what it means", () => {
    expect(formatChronotypeNote("night")).toContain("Night owl");
    expect(formatChronotypeNote("early")).toContain("Morning person");
  });
});

describe("AVAILABILITY_RULE", () => {
  it("binds the model to the windows rather than suggesting them", () => {
    /* Without an explicit MUST, a model reads a list of free windows as
       background colour and still schedules an hour on top of a lecture. */
    expect(AVAILABILITY_RULE).toMatch(/MUST/);
    expect(AVAILABILITY_RULE).toMatch(/day off/);
  });
});
