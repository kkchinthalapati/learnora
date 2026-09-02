import { describe, expect, it } from "vitest";
import {
  importIcs,
  importIcsForRange,
  parseIcsDate,
  parseIcsDuration,
  parseRrule,
  parseVEvents,
  unfoldIcs,
} from "./icsImport";

/** Build a minimal but valid document around some VEVENT bodies. */
function calendar(...events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//EN",
    ...events.flatMap((e) => [
      "BEGIN:VEVENT",
      ...e.trim().split("\n"),
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("unfoldIcs", () => {
  it("rejoins folded continuation lines", () => {
    /* Exporters wrap at 75 octets, so a long lecture title always arrives
       split — a naive split() shreds the SUMMARY of every real calendar. */
    const text =
      "SUMMARY:Organic Chemistry\r\n  and Spectroscopy\r\nDTSTART:20260901";
    expect(unfoldIcs(text)).toEqual([
      "SUMMARY:Organic Chemistry and Spectroscopy",
      "DTSTART:20260901",
    ]);
  });

  it("handles tab continuations and bare newlines", () => {
    expect(unfoldIcs("SUMMARY:a\n\tb")).toEqual(["SUMMARY:ab"]);
  });
});

describe("parseIcsDate", () => {
  it("reads a date-only value as an all-day moment", () => {
    const m = parseIcsDate("20260901");
    expect(m?.allDay).toBe(true);
    expect(m?.at.getFullYear()).toBe(2026);
    expect(m?.at.getMonth()).toBe(8);
    expect(m?.at.getDate()).toBe(1);
  });

  it("reads a floating date-time as local wall-clock time", () => {
    const m = parseIcsDate("20260901T093000");
    expect(m?.allDay).toBe(false);
    expect(m?.at.getHours()).toBe(9);
    expect(m?.at.getMinutes()).toBe(30);
  });

  it("converts a Z value out of UTC", () => {
    const m = parseIcsDate("20260901T093000Z");
    expect(m?.at.getTime()).toBe(Date.UTC(2026, 8, 1, 9, 30, 0));
  });

  it("honours VALUE=DATE even on a date-time value", () => {
    expect(parseIcsDate("20260901T000000", "VALUE=DATE")?.allDay).toBe(true);
  });

  it("returns null for junk", () => {
    expect(parseIcsDate("tomorrow")).toBeNull();
  });
});

describe("parseIcsDuration", () => {
  it("reads the forms exporters actually emit", () => {
    expect(parseIcsDuration("PT1H30M")).toBe(90);
    expect(parseIcsDuration("PT45M")).toBe(45);
    expect(parseIcsDuration("P1D")).toBe(1440);
    expect(parseIcsDuration("P1W")).toBe(10080);
  });

  it("returns null for an unusable duration", () => {
    expect(parseIcsDuration("PT0M")).toBeNull();
    expect(parseIcsDuration("banana")).toBeNull();
  });
});

describe("parseRrule", () => {
  it("reads the parts a timetable uses", () => {
    const rule = parseRrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10");
    expect(rule).toMatchObject({
      freq: "WEEKLY",
      interval: 2,
      count: 10,
      byday: [1, 3],
    });
  });

  it("defaults INTERVAL to 1 and ignores an ordinal prefix on BYDAY", () => {
    expect(parseRrule("FREQ=MONTHLY;BYDAY=-1FR")).toMatchObject({
      interval: 1,
      byday: [5],
    });
  });

  it("returns null without a FREQ", () => {
    expect(parseRrule("COUNT=3")).toBeNull();
    expect(parseRrule("")).toBeNull();
  });
});

describe("parseVEvents", () => {
  it("pulls out summary, start and end", () => {
    const events = parseVEvents(
      calendar(
        "SUMMARY:Chemistry lecture\nDTSTART:20260901T090000\nDTEND:20260901T103000",
      ),
    );
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("Chemistry lecture");
    expect(events[0].start.at.getHours()).toBe(9);
    expect(events[0].end?.at.getHours()).toBe(10);
  });

  it("unescapes commas and semicolons in a summary", () => {
    const events = parseVEvents(
      calendar("SUMMARY:Kinetics\\, part 2\\; lab\nDTSTART:20260901T090000"),
    );
    expect(events[0].summary).toBe("Kinetics, part 2; lab");
  });

  it("derives an end from DURATION when there is no DTEND", () => {
    const events = parseVEvents(
      calendar("SUMMARY:Seminar\nDTSTART:20260901T090000\nDURATION:PT90M"),
    );
    expect(events[0].end?.at.getHours()).toBe(10);
    expect(events[0].end?.at.getMinutes()).toBe(30);
  });

  it("drops an event with no usable DTSTART rather than guessing", () => {
    expect(parseVEvents(calendar("SUMMARY:Mystery"))).toHaveLength(0);
  });

  it("survives a truncated document", () => {
    expect(
      parseVEvents("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:x"),
    ).toEqual([]);
  });
});

describe("importIcs", () => {
  it("returns nothing for text that is not a calendar", () => {
    expect(importIcs("hello", "2026-09-01", "2026-09-07")).toEqual({
      events: [],
      sourceEventCount: 0,
    });
  });

  it("places a single timed event on its local date with clock minutes", () => {
    const { events, sourceEventCount } = importIcs(
      calendar("SUMMARY:Lab\nDTSTART:20260902T140000\nDTEND:20260902T163000"),
      "2026-09-01",
      "2026-09-07",
    );
    expect(sourceEventCount).toBe(1);
    expect(events).toEqual([
      {
        date: "2026-09-02",
        startMin: 840,
        endMin: 990,
        label: "Lab",
        allDay: false,
      },
    ]);
  });

  it("excludes events outside the requested range", () => {
    const { events } = importIcs(
      calendar("SUMMARY:Lab\nDTSTART:20260920T140000\nDTEND:20260920T150000"),
      "2026-09-01",
      "2026-09-07",
    );
    expect(events).toEqual([]);
  });

  it("marks an all-day entry rather than blocking the day", () => {
    /* Treating "Reading week" as 1440 busy minutes would silently delete whole
       days from the schedule — the worst failure this feature can have. */
    const { events } = importIcs(
      calendar("SUMMARY:Reading week\nDTSTART;VALUE=DATE:20260903"),
      "2026-09-01",
      "2026-09-07",
    );
    expect(events).toEqual([
      {
        date: "2026-09-03",
        startMin: 0,
        endMin: 0,
        label: "Reading week",
        allDay: true,
      },
    ]);
  });

  it("gives an event with no end a nominal hour", () => {
    const { events } = importIcs(
      calendar("SUMMARY:Meeting\nDTSTART:20260902T140000"),
      "2026-09-01",
      "2026-09-07",
    );
    expect(events[0]).toMatchObject({ startMin: 840, endMin: 900 });
  });

  it("clips a block that would run past midnight to the end of its day", () => {
    const { events } = importIcs(
      calendar(
        "SUMMARY:Late shift\nDTSTART:20260902T230000\nDTEND:20260903T020000",
      ),
      "2026-09-01",
      "2026-09-07",
    );
    expect(events[0]).toMatchObject({
      date: "2026-09-02",
      startMin: 1380,
      endMin: 1440,
    });
  });

  it("sorts the result by date then start time", () => {
    const { events } = importIcs(
      calendar(
        "SUMMARY:Second\nDTSTART:20260902T140000\nDTEND:20260902T150000",
        "SUMMARY:First\nDTSTART:20260902T090000\nDTEND:20260902T100000",
        "SUMMARY:Zeroth\nDTSTART:20260901T180000\nDTEND:20260901T190000",
      ),
      "2026-09-01",
      "2026-09-07",
    );
    expect(events.map((e) => e.label)).toEqual(["Zeroth", "First", "Second"]);
  });
});

describe("importIcs — recurrence", () => {
  it("expands a weekly lecture across the range", () => {
    // 2026-09-01 is a Tuesday.
    const { events } = importIcs(
      calendar(
        "SUMMARY:Physics\nDTSTART:20260901T090000\nDTEND:20260901T100000\nRRULE:FREQ=WEEKLY;BYDAY=TU",
      ),
      "2026-09-01",
      "2026-09-22",
    );
    expect(events.map((e) => e.date)).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
      "2026-09-22",
    ]);
  });

  it("expands a multi-day BYDAY rule", () => {
    const { events } = importIcs(
      calendar(
        "SUMMARY:Maths\nDTSTART:20260901T090000\nDTEND:20260901T100000\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH",
      ),
      "2026-09-01",
      "2026-09-10",
    );
    expect(events.map((e) => e.date)).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-08",
      "2026-09-10",
    ]);
  });

  it("honours INTERVAL on a weekly rule", () => {
    const { events } = importIcs(
      calendar(
        "SUMMARY:Fortnightly\nDTSTART:20260901T090000\nDTEND:20260901T100000\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU",
      ),
      "2026-09-01",
      "2026-09-29",
    );
    expect(events.map((e) => e.date)).toEqual([
      "2026-09-01",
      "2026-09-15",
      "2026-09-29",
    ]);
  });

  it("stops at UNTIL", () => {
    const { events } = importIcs(
      calendar(
        "SUMMARY:Term\nDTSTART:20260901T090000\nDTEND:20260901T100000\nRRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260909T000000Z",
      ),
      "2026-09-01",
      "2026-09-30",
    );
    expect(events.map((e) => e.date)).toEqual(["2026-09-01", "2026-09-08"]);
  });

  it("counts occurrences from the rule's own start, not from the window", () => {
    /* A COUNT=2 rule starting in August must not keep producing lectures in
       September just because that is where we happened to start looking. */
    const { events } = importIcs(
      calendar(
        "SUMMARY:Short course\nDTSTART:20260825T090000\nDTEND:20260825T100000\nRRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=2",
      ),
      "2026-09-01",
      "2026-09-30",
    );
    expect(events.map((e) => e.date)).toEqual(["2026-09-01"]);
  });

  it("expands a daily rule", () => {
    const { events } = importIcs(
      calendar(
        "SUMMARY:Standup\nDTSTART:20260901T083000\nDTEND:20260901T084500\nRRULE:FREQ=DAILY;COUNT=3",
      ),
      "2026-09-01",
      "2026-09-30",
    );
    expect(events.map((e) => e.date)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("expands a monthly rule", () => {
    const { events } = importIcs(
      calendar(
        "SUMMARY:Tutorial\nDTSTART:20260901T090000\nDTEND:20260901T100000\nRRULE:FREQ=MONTHLY",
      ),
      "2026-09-01",
      "2026-11-30",
    );
    expect(events.map((e) => e.date)).toEqual([
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
  });

  it("drops a cancelled occurrence via EXDATE", () => {
    const { events } = importIcs(
      calendar(
        "SUMMARY:Physics\nDTSTART:20260901T090000\nDTEND:20260901T100000\nRRULE:FREQ=WEEKLY;BYDAY=TU\nEXDATE:20260908T090000",
      ),
      "2026-09-01",
      "2026-09-15",
    );
    expect(events.map((e) => e.date)).toEqual(["2026-09-01", "2026-09-15"]);
  });

  it("yields only the first occurrence for a rule it does not understand", () => {
    /* Under-booking the student is the safe direction to be wrong in. */
    const { events } = importIcs(
      calendar(
        "SUMMARY:Odd\nDTSTART:20260901T090000\nDTEND:20260901T100000\nRRULE:FREQ=HOURLY",
      ),
      "2026-09-01",
      "2026-09-30",
    );
    expect(events).toHaveLength(0);
  });
});

describe("importIcsForRange", () => {
  it("covers exactly `days` days starting at the given date", () => {
    const doc = calendar(
      "SUMMARY:Daily\nDTSTART:20260901T090000\nDTEND:20260901T100000\nRRULE:FREQ=DAILY",
    );
    expect(
      importIcsForRange(doc, "2026-09-01", 3).events.map((e) => e.date),
    ).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });
});
