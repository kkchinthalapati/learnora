/* What Learnora is doing with an upload, as a plan the student can watch
 * (2026-09 redesign), instead of a spinner and one line of text.
 *
 * Derived from the progress messages api/studyPackage already reports and
 * the stage failures it returns — nothing here guesses at progress the
 * pipeline didn't report. */

import type { PlanStep, StepStatus } from "../learning/StepPlan";

export interface PipelineInput {
  /** The latest onProgress message, or null when idle / finished. */
  message: string | null;
  outputs: { notes: boolean; flashcards: boolean; quiz: boolean };
  failed: Array<"notes" | "flashcards" | "quiz">;
}

type StageId = "read" | "notes" | "flashcards" | "quiz";

const ORDER: StageId[] = ["read", "notes", "flashcards", "quiz"];

function stageOf(message: string): StageId {
  const m = message.toLowerCase();
  if (m.includes("quiz")) return "quiz";
  if (m.includes("flashcard")) return "flashcards";
  if (m.includes("summary notes")) return "notes";
  return "read";
}

export function pipelineSteps({ message, outputs, failed }: PipelineInput): PlanStep[] {
  const wanted: Array<{ id: StageId; label: string }> = [
    { id: "read", label: outputs.notes ? "Reading text and writing notes" : "Reading text" },
    ...(outputs.flashcards ? [{ id: "flashcards" as const, label: "Writing recall questions" }] : []),
    ...(outputs.quiz ? [{ id: "quiz" as const, label: "Writing a practice quiz" }] : []),
  ];
  const at = message ? ORDER.indexOf(stageOf(message)) : ORDER.length;
  /* "Writing summary notes" is part of the reading stage in the plan. */
  const current = at === ORDER.indexOf("notes") ? 0 : at;
  return wanted.map((stage) => {
    const index = ORDER.indexOf(stage.id);
    const stageFailed =
      (stage.id === "read" && failed.includes("notes")) ||
      (stage.id !== "read" && failed.includes(stage.id as "flashcards" | "quiz"));
    let status: StepStatus =
      index < current ? "done" : index === current ? "current" : "upcoming";
    if (!message) status = "done";
    return {
      id: stage.id,
      label: stage.label,
      status: stageFailed ? "upcoming" : status,
      detail: stageFailed
        ? "Didn't finish. Retrying is safe; nothing else is lost."
        : status === "current" && message
          ? message
          : undefined,
    };
  });
}
