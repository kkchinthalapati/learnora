/* The first-run board picker's options (2026-10 revamp, design_handoff →
 * Screens "First run"). Every option says how well Learnora supports it, and
 * the label is worked out from what is actually built, never typed by hand:
 *
 *   Ready        — the specification is in the syllabus ledger AND the
 *                  question bank has checked questions for it.
 *   Partly ready — anything less: a syllabus with no bank yet (questions are
 *                  AI-written and say so), or a board with no syllabus at all
 *                  (practice is general).
 *
 * The audit's finding was that CBSE was offered with nothing behind it. This
 * list cannot over-claim: adding a bank for a spec is what promotes it. */

import { hasBank } from "../../api/questionBank";
import { SYLLABUS_SPECS, specLabel } from "../../lib/syllabus";
import type { SyllabusSpec } from "../../lib/syllabus";
import type { ExamTypeId } from "../../lib/onboarding";

export type BoardSupport = "ready" | "partly" | "none";

export interface BoardOption {
  id: string;
  label: string;
  group: "GCSE" | "IB" | "India" | "Other";
  support: BoardSupport;
  /** One sentence of honesty, shown when a partly-ready board is picked. */
  honesty?: string;
  spec?: SyllabusSpec;
  examType?: ExamTypeId;
  /** How the level is named to the AI when there is no spec. */
  levelLabel?: string;
}

const GROUP_OF: Record<SyllabusSpec["qualification"], BoardOption["group"]> = {
  GCSE: "GCSE",
  IB: "IB",
  CBSE: "India",
};

const EXAM_TYPE_OF: Record<SyllabusSpec["qualification"], ExamTypeId> = {
  GCSE: "gcse",
  IB: "ib",
  CBSE: "other",
};

export function boardOptions(
  specs: readonly SyllabusSpec[] = SYLLABUS_SPECS,
): BoardOption[] {
  const fromSpecs: BoardOption[] = specs.map((spec) => {
    const ready = hasBank(spec);
    return {
      id: spec.id,
      label: specLabel(spec),
      group: GROUP_OF[spec.qualification],
      support: ready ? "ready" : "partly",
      honesty: ready
        ? undefined
        : `The ${specLabel(spec)} syllabus is built in, but there are no checked questions for it yet, so practice questions are written by AI and labelled that way.`,
      spec,
      examType: EXAM_TYPE_OF[spec.qualification],
    };
  });
  return [
    ...fromSpecs,
    {
      id: "icse-10",
      label: "ICSE Class 10",
      group: "India",
      support: "partly",
      honesty:
        "There's no ICSE syllabus behind this yet. Practice is general and AI-written, and it says so.",
      examType: "other",
      levelLabel: "ICSE Class 10 (India)",
    },
    {
      id: "a-level",
      label: "A-level",
      group: "Other",
      support: "partly",
      honesty:
        "There's no A-level syllabus behind this yet. Practice is general and AI-written, and it says so.",
      examType: "a_level",
    },
    {
      id: "no-exams",
      label: "Not doing exams yet (Year 7–9)",
      group: "Other",
      support: "none",
      levelLabel: "Key Stage 3 (Year 7–9)",
    },
    {
      id: "other",
      label: "My board isn’t here",
      group: "Other",
      support: "none",
    },
  ];
}

export const GROUP_LABELS: Record<BoardOption["group"], string> = {
  GCSE: "GCSE",
  IB: "IB Diploma",
  India: "India (Class 9–10)",
  Other: "Something else",
};
