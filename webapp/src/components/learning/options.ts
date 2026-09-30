/* Option lists for the learning pills, kept out of the component files so
   those stay fast-refresh friendly. */

export type HintLevel = "nudge" | "bigger" | "show";

export const HINT_LEVELS: ReadonlyArray<{ id: HintLevel; label: string }> = [
  { id: "nudge", label: "Nudge" },
  { id: "bigger", label: "Bigger hint" },
  { id: "show", label: "Show me, then quiz me" },
];

/** Stored on each quiz answer as `answer.confidence`. */
export type Confidence = "guess" | "fairly" | "certain";

export const CONFIDENCE_OPTIONS: ReadonlyArray<{
  id: Confidence;
  label: string;
}> = [
  { id: "guess", label: "Guess" },
  { id: "fairly", label: "Fairly sure" },
  { id: "certain", label: "Certain" },
];
