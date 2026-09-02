/* The student's week, said in a sentence the model can act on.
 *
 * The weekly planner has always produced a plan out of tasks, exams and weak
 * topics alone — a plan that had no idea the student is in a lecture until
 * eleven on Tuesdays and works Thursday nights. It could not know: nothing in
 * the app did. Now something does, and this is the translation layer.
 *
 * Kept as a separate pure function rather than inlined into `buildPlanPrompt`
 * for the reason the rest of that file gives for its own split: prompt text is
 * the part of an AI feature worth testing, and it is only testable if building
 * it does not require a network call. */

import type { DayAvailability } from "./availability";
import {
  CHRONOTYPES,
  formatClock,
  formatDuration,
  type Chronotype,
} from "./lifeContext";
import { parseLocalDate } from "./date";

function dayName(date: string): string {
  return parseLocalDate(date).toLocaleDateString("en-GB", { weekday: "short" });
}

/** One line per day: what is booked, and what is genuinely left. */
export function formatAvailabilityNote(days: DayAvailability[]): string {
  if (days.length === 0) return "None";

  const lines = days.map((day) => {
    const label = `${dayName(day.date)} ${day.date}`;
    if (day.protectedDay) return `${label}: day off, schedule nothing`;
    if (day.windows.length === 0) return `${label}: no time available`;

    const windows = day.windows
      .map((w) => `${formatClock(w.startMin)}-${formatClock(w.endMin)}`)
      .join(", ");
    const busy = day.busy.length
      ? ` (busy: ${day.busy.map((b) => b.label).join(", ")})`
      : "";
    return `${label}: free ${windows} — at most ${formatDuration(day.availableMins)}${busy}`;
  });

  return lines.join("; ");
}

/** How the student's attention moves through a day, for the model to place the
 *  demanding work against. */
export function formatChronotypeNote(chronotype: Chronotype): string {
  const entry = CHRONOTYPES.find((c) => c.value === chronotype);
  return entry ? `${entry.label} — ${entry.hint.toLowerCase()}` : "Unknown";
}

/** The instruction that makes the availability line binding rather than
 *  decorative. Without it a model reads a list of free windows as background
 *  colour and still cheerfully schedules an hour on top of a lecture. */
export const AVAILABILITY_RULE =
  "Every block MUST start and end inside one of the listed free windows, and a day's blocks must not exceed that day's stated maximum. Schedule nothing on a day marked as a day off or with no time available. Put the most demanding work in the hours the chronotype note says are strongest.";
