/* Reading the student's real calendar.
 *
 * `ics.ts` has always been able to write a calendar out. This reads one in —
 * the university timetable, the shift rota, the fixtures list — so the planner
 * can schedule around a student's actual week instead of an imagined one. It
 * is the single highest-leverage thing we can know about someone's life, and
 * every calendar app on earth can hand it over as an .ics file or a secret
 * subscription URL.
 *
 * The import stays on the device: the text lands in `lifeContext`, which lives
 * in localStorage, and nothing here uploads it. That is a deliberate limit —
 * a student's calendar names their doctor's appointments and their family, and
 * we want none of it on our servers to run a scheduler that works fine locally.
 *
 * Scope, stated honestly rather than discovered later:
 *
 *  - `DTSTART;TZID=Europe/London:...` is read as *local* wall-clock time. Doing
 *    better needs a full IANA tz database in the bundle, and the case it gets
 *    wrong — a calendar authored in one timezone, read in another — is rarer
 *    for a student than the bundle cost is certain.
 *  - `...Z` (UTC) values are converted properly, because those are exact.
 *  - RRULE covers DAILY / WEEKLY / MONTHLY / YEARLY with INTERVAL, COUNT,
 *    UNTIL, BYDAY and BYMONTHDAY. Anything else yields the first occurrence
 *    only, which under-books the student rather than over-booking them.
 *  - All-day events are surfaced but never treated as busy — see `IcsEvent`. */

import { formatDateStr, localDateStr, parseLocalDate } from "./date";

export interface IcsEvent {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  /** Minutes from local midnight. Both 0 when `allDay`. */
  startMin: number;
  endMin: number;
  label: string;
  /* All-day entries are marked, not blocked. In a student's calendar they are
     usually "Reading week", "Mum's birthday", "Term ends" — labels on a day,
     not three hundred busy minutes. Treating them as busy would silently
     delete whole days from the schedule, which is the worst failure this
     feature can have. `availability.ts` shows them and schedules through. */
  allDay: boolean;
}

/** RFC 5545 line unfolding: a continuation line begins with a space or tab and
 *  belongs to the line before it. Exporters wrap at 75 octets, so a long
 *  SUMMARY arrives split across lines and a naive split() shreds it. */
export function unfoldIcs(text: string): string[] {
  const out: string[] = [];
  for (const raw of text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out;
}

/** Split "DTSTART;TZID=Europe/London:20260901T090000" into its three parts. */
function splitLine(
  line: string,
): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const semi = head.indexOf(";");
  return semi === -1
    ? { name: head.toUpperCase(), params: "", value }
    : {
        name: head.slice(0, semi).toUpperCase(),
        params: head.slice(semi + 1).toUpperCase(),
        value,
      };
}

/** Text values escape commas, semicolons and newlines (RFC 5545 §3.3.11). */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

const DATE_ONLY_RE = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/;

interface IcsMoment {
  /** Local wall-clock instant for the occurrence. */
  at: Date;
  allDay: boolean;
}

/** Parse an ICS date or date-time into a local `Date`.
 *
 * A trailing `Z` is a real UTC instant, so it goes through `Date.UTC` and the
 * local calendar fields fall out of the conversion. Everything else is read as
 * wall-clock time in the viewer's own zone — see this file's header. */
export function parseIcsDate(value: string, params = ""): IcsMoment | null {
  const v = value.trim();

  const dateOnly = DATE_ONLY_RE.exec(v);
  if (dateOnly || params.includes("VALUE=DATE")) {
    const m = dateOnly ?? DATE_TIME_RE.exec(v);
    if (!m) return null;
    return {
      at: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
      allDay: true,
    };
  }

  const dt = DATE_TIME_RE.exec(v);
  if (!dt) return null;
  const [, y, mo, d, h, mi, s, utc] = dt;
  const at = utc
    ? new Date(
        Date.UTC(
          Number(y),
          Number(mo) - 1,
          Number(d),
          Number(h),
          Number(mi),
          Number(s),
        ),
      )
    : new Date(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(h),
        Number(mi),
        Number(s),
      );
  return { at, allDay: false };
}

interface RawVEvent {
  summary: string;
  start: IcsMoment;
  end: IcsMoment | null;
  rrule: string;
  /** Cancelled occurrences — the single class that got called off. */
  exdates: Set<string>;
}

/** Pull the VEVENTs out of an ICS document. Anything without a usable DTSTART
 *  is dropped rather than guessed at. */
export function parseVEvents(text: string): RawVEvent[] {
  const events: RawVEvent[] = [];
  let current: (Partial<RawVEvent> & { exdates: Set<string> }) | null = null;

  for (const line of unfoldIcs(text)) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      current = { exdates: new Set(), summary: "", rrule: "" };
      continue;
    }
    if (trimmed === "END:VEVENT") {
      if (current?.start) {
        events.push({
          summary: current.summary || "Busy",
          start: current.start,
          end: current.end ?? null,
          rrule: current.rrule ?? "",
          exdates: current.exdates,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const parts = splitLine(line);
    if (!parts) continue;
    const { name, params, value } = parts;

    if (name === "SUMMARY") current.summary = unescapeText(value);
    else if (name === "DTSTART")
      current.start = parseIcsDate(value, params) ?? undefined;
    else if (name === "DTEND") current.end = parseIcsDate(value, params);
    else if (name === "RRULE") current.rrule = value.toUpperCase();
    else if (name === "EXDATE") {
      /* EXDATE may carry several comma-separated values on one line. Only the
         date matters for exclusion — an exporter that shifts the time by a
         second would otherwise fail to cancel the class it meant to cancel. */
      for (const v of value.split(",")) {
        const m = parseIcsDate(v, params);
        if (m) current.exdates.add(localDateStr(m.at));
      }
    } else if (name === "DURATION" && !current.end && current.start) {
      const mins = parseIcsDuration(value);
      if (mins !== null) {
        current.end = {
          at: new Date(current.start.at.getTime() + mins * 60000),
          allDay: current.start.allDay,
        };
      }
    }
  }
  return events;
}

/** "PT1H30M" / "P1D" → minutes. Some exporters send DURATION instead of DTEND. */
export function parseIcsDuration(value: string): number | null {
  const m =
    /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
      value.trim().toUpperCase(),
    );
  if (!m) return null;
  const [, w, d, h, mi, s] = m.map((x) =>
    x ? Number(x) : 0,
  ) as unknown as number[];
  const total = w * 10080 + d * 1440 + h * 60 + mi + Math.round(s / 60);
  return total > 0 ? total : null;
}

const BYDAY_INDEX: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

interface Rrule {
  freq: string;
  interval: number;
  count: number | null;
  until: Date | null;
  byday: number[];
  bymonthday: number[];
}

export function parseRrule(rrule: string): Rrule | null {
  if (!rrule) return null;
  const parts = Object.fromEntries(
    rrule
      .split(";")
      .map((p) => p.split("="))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k.trim(), v.trim()]),
  );
  if (!parts.FREQ) return null;

  const untilMoment = parts.UNTIL ? parseIcsDate(parts.UNTIL) : null;
  return {
    freq: parts.FREQ,
    interval: Math.max(1, Number(parts.INTERVAL) || 1),
    count: parts.COUNT ? Math.max(1, Number(parts.COUNT)) : null,
    until: untilMoment?.at ?? null,
    byday: (parts.BYDAY ?? "")
      .split(",")
      /* Strip the ordinal in "-1FR" / "2MO": we honour the weekday and let the
         day-scan decide, which over-generates for those rare rules. Left as-is
         because a student's timetable never uses them. */
      .map((d) => BYDAY_INDEX[d.replace(/^[+-]?\d+/, "")])
      .filter((n) => n !== undefined),
    bymonthday: (parts.BYMONTHDAY ?? "")
      .split(",")
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31),
  };
}

function mondayIndex(d: Date): number {
  /* Whole-days since the Unix epoch, Monday-aligned, so a WEEKLY INTERVAL can
     be tested with one modulo. Built from local calendar fields (not
     getTime()) so a DST shift can never move a day across the boundary. */
  const days = Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000,
  );
  return days;
}

function matchesRrule(rule: Rrule, start: Date, day: Date): boolean {
  const dayDiff = mondayIndex(day) - mondayIndex(start);
  if (dayDiff < 0) return false;

  switch (rule.freq) {
    case "DAILY":
      return dayDiff % rule.interval === 0;
    case "WEEKLY": {
      const days = rule.byday.length ? rule.byday : [start.getDay()];
      if (!days.includes(day.getDay())) return false;
      /* Weeks are counted from the Monday of the start's week so that a rule
         beginning on a Friday still puts the following Monday in week 0 —
         the reading every calendar app agrees on (WKST defaults to MO). */
      const weekOf = (d: Date) =>
        Math.floor((mondayIndex(d) - ((d.getDay() + 6) % 7)) / 7);
      return (weekOf(day) - weekOf(start)) % rule.interval === 0;
    }
    case "MONTHLY": {
      const days = rule.bymonthday.length ? rule.bymonthday : [start.getDate()];
      if (!days.includes(day.getDate())) return false;
      const months =
        (day.getFullYear() - start.getFullYear()) * 12 +
        (day.getMonth() - start.getMonth());
      return months >= 0 && months % rule.interval === 0;
    }
    case "YEARLY":
      return (
        day.getMonth() === start.getMonth() &&
        day.getDate() === start.getDate() &&
        (day.getFullYear() - start.getFullYear()) % rule.interval === 0
      );
    default:
      return false;
  }
}

/* A recurring event with no COUNT and no UNTIL repeats forever, so the scan
   needs its own ceiling. Two years of days is far past any range a student
   view asks for and keeps a malformed rule from hanging the tab. */
const MAX_SCAN_DAYS = 800;

/** Expand one VEVENT into the occurrences that fall inside [from, to]. */
function expandEvent(ev: RawVEvent, from: string, to: string): IcsEvent[] {
  const durationMs = ev.end
    ? Math.max(0, ev.end.at.getTime() - ev.start.at.getTime())
    : 0;
  const startMin = ev.start.allDay
    ? 0
    : ev.start.at.getHours() * 60 + ev.start.at.getMinutes();
  /* An event with no DTEND is an instant; give it a nominal hour so it still
     occupies something a student would recognise on a timeline. */
  const lengthMin = ev.start.allDay
    ? 0
    : Math.max(15, Math.round(durationMs / 60000) || 60);

  const emit = (date: string): IcsEvent => ({
    date,
    startMin,
    /* A block running past midnight is clipped to the end of its own day
       rather than leaking into the next one — the engine indexes strictly by
       local date, and a clipped late night is a better answer than a busy
       block that silently belongs to two days at once. */
    endMin: ev.start.allDay ? 0 : Math.min(24 * 60, startMin + lengthMin),
    label: ev.summary,
    allDay: ev.start.allDay,
  });

  const rule = parseRrule(ev.rrule);
  if (!rule) {
    const date = localDateStr(ev.start.at);
    return date >= from && date <= to && !ev.exdates.has(date)
      ? [emit(date)]
      : [];
  }

  const out: IcsEvent[] = [];
  const cursor = new Date(
    ev.start.at.getFullYear(),
    ev.start.at.getMonth(),
    ev.start.at.getDate(),
  );
  let emitted = 0;

  for (let i = 0; i < MAX_SCAN_DAYS; i += 1) {
    if (rule.count !== null && emitted >= rule.count) break;
    if (rule.until && cursor > rule.until) break;

    const date = formatDateStr(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate(),
    );
    if (date > to && rule.count === null) break;

    if (matchesRrule(rule, ev.start.at, cursor)) {
      /* COUNT counts every occurrence the rule generates, including the ones
         before the requested window — otherwise a "20 lectures" rule starting
         in September would still be producing lectures the following summer. */
      emitted += 1;
      if (date >= from && date <= to && !ev.exdates.has(date))
        out.push(emit(date));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export interface IcsImportResult {
  events: IcsEvent[];
  /** How many VEVENTs the file held, for the "imported 43 events" confirmation
   *  — a student needs to see that the import actually took. */
  sourceEventCount: number;
}

/** Parse an ICS document and expand it across [fromDate, toDate] inclusive. */
export function importIcs(
  text: string,
  fromDate: string,
  toDate: string,
): IcsImportResult {
  if (!text || !text.includes("BEGIN:VEVENT")) {
    return { events: [], sourceEventCount: 0 };
  }
  const raw = parseVEvents(text);
  const events = raw
    .flatMap((ev) => expandEvent(ev, fromDate, toDate))
    .sort((a, b) =>
      a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1,
    );
  return { events, sourceEventCount: raw.length };
}

/** Convenience for the common ask: everything from `start` for `days` days. */
export function importIcsForRange(
  text: string,
  startDate: string,
  days: number,
): IcsImportResult {
  const end = new Date(parseLocalDate(startDate));
  end.setDate(end.getDate() + Math.max(0, days - 1));
  return importIcs(text, startDate, localDateStr(end));
}
