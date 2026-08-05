import type { Exam, WeeklyPlan } from "../api/types";
import type { WeeklyPlanJson } from "./aiJson";

function formatDate(dateStr: string): string {
  // 2026-08-20 -> 20260820
  return dateStr.replace(/-/g, "");
}

function generateUID(): string {
  return Math.random().toString(36).substring(2, 11) + "@learnora.app";
}

function getDtstamp(): string {
  // YYYYMMDDTHHMMSSZ
  return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function generateICS(exams: Exam[], plans: WeeklyPlan[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Learnora//Learnora Calendar Export//EN",
    "CALSCALE:GREGORIAN",
  ];

  const dtstamp = getDtstamp();

  // Add Exams
  for (const exam of exams) {
    if (!exam.exam_date || exam.status === "Completed") continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${generateUID()}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${formatDate(exam.exam_date)}`,
      `SUMMARY:Exam: ${exam.exam_name}`,
      `DESCRIPTION:Difficulty: ${exam.difficulty || "unspecified"}`,
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
          `SUMMARY:Study: ${block.subject}`,
          `DESCRIPTION:${desc.trim()}`,
          "END:VEVENT",
        );
      }
    }
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
