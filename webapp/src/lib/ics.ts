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
 * generally supposed to be doing. */

import type { Exam, WeeklyPlan } from "../api/types";
import type { WeeklyPlanJson } from "./aiJson";
import type { ScheduledBlock } from "./autoSchedule";
import { parseLocalDate } from "./date";

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

  for (const block of blocks) {
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
      `UID:${generateUID()}`,
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
