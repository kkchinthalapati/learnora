import { createContext, useContext } from "react";
import type { StudyPackageResult } from "../api/studyPackage";
import type { StudyPackageInput } from "../hooks/useStudyPackage";

/* Making a study set (notes, cards, a quiz) takes long enough that it needs
   its own screen, and long enough that the student may wander off. The
   provider (GenerationProvider.tsx) owns the run, so it survives navigation,
   shows what is actually happening, and takes the student into the lesson
   when it is ready. */

export type GenerationStage =
  "read" | "notes" | "cards" | "quiz" | "done" | "failed";

export interface GenerationJob {
  /** What the student will recognise: the topic, the file name. */
  label: string;
  stage: GenerationStage;
  /** The pipeline's own caption for the step in flight. */
  message: string;
  startedAt: number;
  minimized: boolean;
  /** Which steps this run includes, in order. */
  steps: Exclude<GenerationStage, "done" | "failed">[];
  error?: string;
  /** Where "Open" goes once it's done. */
  destination?: string | null;
}

export interface GenerationApi {
  job: GenerationJob | null;
  /** Runs the request with the full-screen progress view and, when anything
   *  was made, opens it. Resolves with the result, partial or empty ones
   *  included (summarizeStudyPackage tells them apart); null when it threw,
   *  was abandoned, or another run was already going. Failures are shown on
   *  the screen itself, with a retry. */
  start: (
    input: StudyPackageInput,
    meta: { label: string },
  ) => Promise<StudyPackageResult | null>;
}

export const GenerationContext = createContext<GenerationApi | null>(null);

export function useGeneration(): GenerationApi {
  const ctx = useContext(GenerationContext);
  if (!ctx)
    throw new Error("useGeneration must be used inside <GenerationProvider>");
  return ctx;
}

/** Which step a pipeline caption belongs to (api/studyPackage.ts `step`). */
export function stageForMessage(
  message: string,
): GenerationJob["steps"][number] | null {
  if (/flashcards/i.test(message)) return "cards";
  if (/quiz/i.test(message)) return "quiz";
  if (/upload|reading the linked|download|loading your saved/i.test(message))
    return "read";
  if (/notes|diagram|drawing/i.test(message)) return "notes";
  return null;
}
