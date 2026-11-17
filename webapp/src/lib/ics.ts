/* Writing the student's calendar back out.
 *
 * Two exports, for two different asks.
 *
 * `generateICS` is the original: exams and weekly-plan blocks as all-day
 * entries. It is what Settings → Export calendar has always produced, and it is
 * still the right shape for a plan that only ever said "Chemistry, Tuesday".
 *
 * `generateScheduleICS` is what Life Sync produces: real timed events at the
 * hours the scheduler chose, with an alarm before each one. That difference
 * matters more than it looks. An all-day entry lands in the strip at the top of
 * a calendar, where it is a note. A timed event with a reminder is an
 * appointment — it shows up in the day's column next to the lecture it has to
 * fit around, and the phone buzzes ten minutes before. We are trying to make
 * studying something that happens at a time, not something a student is
 * generally supposed to be doing.
 *
 * `generatePlanICS` is the Week plan page's saved plan. A saved block knows its
 * day and its length but usually only a loose hint of when ("morning"), so it
 * is timed when the hint is a real clock time and all-day otherwise —
 * inventing 09:00 for "morning" would book the student over a lecture we were
 * never told about.
 *
 * The two week exports give each block a UID derived from the block, not a
 * random one. A student adds their week every week, often the same week twice,
 * and a calendar keeps one event per UID: random UIDs made every re-import a
 * second copy of the whole week. */

import type { Exam, WeeklyPlan } from "../api/types";
import type { PlanBlock, PlanDay, WeeklyPlanJson } from "./aiJson";
import type { ScheduledBlock } from "./autoSchedule";
import { parseLocalDate } from "./date";
import { DEFAULT_BLOCK_MINUTES } from "./planShape";

function formatDate(dateStr: string): string {
  // 2026-08-20 -> 20260820
  return dateStr.replace(/-/g, "");
}

/** A local date plus minutes-from-midnight as a floating (no-Z) date-time.
 *
 * Floating is correct here and UTC would be wrong: the student scheduled
 * "19:00 on Tuesday" in their own life, and if they fly somewhere the block
 * should still be at seven in the evening rather than following them at a
 * fixed offset. RFC 5545 calls this a local time with no timezone reference,
 * and every calendar client reads it as the viewer's wall clock. */
function formatDateTime(dateStr: string, minutes: number): string {
  const d = parseLocalDate(dateStr);
  d.setMinutes(minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

let uidCounter = 0;

function generateUID(): string {
  /* A counter alongside the random part: two events generated in the same
     millisecond used to be able to collide, and a calendar client silently
     treats a duplicate UID as an update to the same event — so one study block
     would quietly replace another on import. */
  uidCounter += 1;
  return `${Date.now().toString(36)}-${uidCounter}-${Math.random().toString(36).slice(2, 9)}@learnora.app`;
}

function fnv1a(text: string, seed: number): string {
  let hash = seed;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** The same block always gets the same UID, so importing the file again
 *  updates the event already in the calendar instead of adding a twin.
 *
 *  The key is the day, what the block is, and which one of that kind it is
 *  that day — deliberately not its time. The worked-out week moves a block
 *  when the student's free time changes, and an edited plan block changes its
 *  start; with the time in the UID either one would re-import as a second
 *  event beside the stale one, instead of moving it. Two seeded passes because
 *  32 bits is thin for an id that lives in a calendar for years. */
function stableUID(scope: string, parts: (string | number)[]): string {
  const key = [scope, ...parts].join("|");
  return `${fnv1a(key, 0x811c9dc5)}${fnv1a(key, 0x01234567)}@learnora.app`;
}

/** Numbers repeats of the same key — two "Maths" blocks on one day are two
 *  events, so the second needs a UID of its own. */
function ordinalCounter(): (key: string) => number {
  const seen = new Map<string, number>();
  return (key) => {
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n;
  };
}

function getDtstamp(): string {
  // YYYYMMDDTHHMMSSZ
  return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Escape a value for a TEXT property (RFC 5545 §3.3.11). Without this, a task
 *  called "Revise: kinetics, part 2" splits into two properties at the comma
 *  and imports as a truncated event. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function calendarHeader(name: string): string[] {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Learnora//Learnora Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(name)}`,
  ];
}

export function generateICS(exams: Exam[], plans: WeeklyPlan[]): string {
  const lines = calendarHeader("Learnora");
  const dtstamp = getDtstamp();

  // Add Exams
  for (const exam of exams) {
    if (!exam.exam_date || exam.status === "Completed") continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${generateUID()}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${formatDate(exam.exam_date)}`,
      `SUMMARY:${escapeIcsText(`Exam: ${exam.exam_name}`)}`,
      `DESCRIPTION:${escapeIcsText(`Difficulty: ${exam.difficulty || "unspecified"}`)}`,
      "END:VEVENT",
    );
  }

  // Add Weekly Plan Blocks
  for (const plan of plans) {
    const json = plan.plan_json as WeeklyPlanJson;
    if (!json || !json.days) continue;

    for (const day of json.days) {
      if (!day.blocks) continue;
      for (const block of day.blocks) {
        let desc = "";
        if (block.durationMins) desc += `${block.durationMins} mins. `;
        if (block.reason) desc += block.reason;

        lines.push(
          "BEGIN:VEVENT",
          `UID:${generateUID()}`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;VALUE=DATE:${formatDate(day.date)}`,
          `SUMMARY:${escapeIcsText(`Study: ${block.subject}`)}`,
          `DESCRIPTION:${escapeIcsText(desc.trim())}`,
          "END:VEVENT",
        );
      }
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

const KIND_PREFIX: Record<ScheduledBlock["kind"], string> = {
  review: "Review",
  task: "Study",
  exam: "Exam prep",
  subject: "Deep work",
};

export interface ScheduleIcsOptions {
  /** Minutes before each block to fire a reminder. 0 disables alarms. */
  reminderMins?: number;
  calendarName?: string;
}

/** The auto-scheduled week, as timed appointments with reminders. */
export function generateScheduleICS(
  blocks: ScheduledBlock[],
  options: ScheduleIcsOptions = {},
): string {
  const { reminderMins = 10, calendarName = "Learnora study plan" } = options;
  const lines = calendarHeader(calendarName);
  const dtstamp = getDtstamp();
  const nth = ordinalCounter();

  for (const block of blocks) {
    /* Not `block.id`: the scheduler rebuilds its ids on every run. */
    const key = [block.date, block.kind, block.label, block.part?.index ?? 0];
    const mins = block.endMin - block.startMin;
    const part = block.part ? ` (${block.part.index}/${block.part.total})` : "";
    const description = [
      `${mins} minute ${KIND_PREFIX[block.kind].toLowerCase()} block, scheduled by Learnora.`,
      block.energy >= 0.8 ? "One of your best hours today — use it." : "",
      "Open Learnora to start the timer for this block.",
    ]
      .filter(Boolean)
      .join(" ");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${stableUID("block", [...key, nth(key.join("|"))])}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${formatDateTime(block.date, block.startMin)}`,
      `DTEND:${formatDateTime(block.date, block.endMin)}`,
      `SUMMARY:${escapeIcsText(`${KIND_PREFIX[block.kind]}: ${block.label}${part}`)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      /* TRANSPARENT would let another app book over the block, which defeats
         the point of exporting it — the whole reason it is in their calendar
         is so the rest of their life routes around it. */
      "TRANSP:OPAQUE",
      "CATEGORIES:LEARNORA",
    );
    if (reminderMins > 0) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-PT${Math.round(reminderMins)}M`,
        `DESCRIPTION:${escapeIcsText(`${KIND_PREFIX[block.kind]}: ${block.label}`)}`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** A start hint as minutes from midnight, when it opens with a clock time
 *  ("9:30 AM", "14:00", "7pm", "9 AM – 11 AM (Peak Focus)"). Anything looser
 *  ("morning", "after dinner") is null. A bare number is not a time: "2 past
 *  papers" must not become two in the morning. */
export function parseClockHint(hint: string | undefined): number | null {
  if (!hint) return null;
  const m = hint
    .trim()
    .match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(?:([ap])\.?\s?m\.?)?(?![\w])/i);
  if (!m || (m[2] === undefined && m[3] === undefined)) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  if (minute > 59) return null;
  if (m[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (m[3].toLowerCase() === "p" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

/** The saved plan's blocks that belong in a calendar. A rebalanced block is
 *  left out: it stays on the page struck through, but it is no longer owed,
 *  and the catch-up block that replaced it is already in the list. */
export function calendarPlanBlocks(
  days: PlanDay[],
): { date: string; block: PlanBlock }[] {
  return days.flatMap((day) =>
    /^\d{4}-\d{2}-\d{2}$/.test(day.date)
      ? (day.blocks ?? [])
          .filter((block) => !block.rebalanced)
          .map((block) => ({ date: day.date, block }))
      : [],
  );
}

/** The saved week plan: timed where a block names a clock time, all-day where
 *  it only names a day (the shape `generateICS` has always used for plans). */
export function generatePlanICS(
  days: PlanDay[],
  options: { calendarName?: string } = {},
): string {
  const lines = calendarHeader(options.calendarName ?? "Learnora study plan");
  const dtstamp = getDtstamp();
  const nth = ordinalCounter();

  for (const { date, block } of calendarPlanBlocks(days)) {
    const mins = block.durationMins ?? DEFAULT_BLOCK_MINUTES;
    const startMin = parseClockHint(block.startHint);
    const key = [date, block.subject];
    const description = [
      `${mins} minute study block from your Learnora week plan.`,
      startMin === null && block.startHint ? `When: ${block.startHint}.` : "",
      block.reason ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${stableUID("plan", [...key, nth(key.join("|"))])}`,
      `DTSTAMP:${dtstamp}`,
    );
    if (startMin === null) {
      lines.push(
        `DTSTART;VALUE=DATE:${formatDate(date)}`,
        /* An all-day entry is a note, not a booking. Left busy it would block
           the student's whole day for 45 minutes of Biology. */
        "TRANSP:TRANSPARENT",
      );
    } else {
      lines.push(
        `DTSTART:${formatDateTime(date, startMin)}`,
        `DTEND:${formatDateTime(date, startMin + mins)}`,
        "TRANSP:OPAQUE",
      );
    }
    lines.push(
      `SUMMARY:${escapeIcsText(`Study: ${block.subject}`)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      "CATEGORIES:LEARNORA",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS(
  content: string,
  filename: string = "learnora_schedule.ics",
) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
