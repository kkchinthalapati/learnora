import { supabase } from "./supabase";
import { examBoardLabel, readOnboarding } from "./onboarding";
import { getFramework } from "./region";

/* What level to pitch AI questions and marking at.
 *
 * Oral practice asked a GCSE student about calcium coupling and Purkinje
 * fibres, scored a correct GCSE answer 40% for rigour, and wrote those
 * university-level "gaps" to the misconception ledger. The model had only
 * "GCSE / A-Level" to go on — the region's pair of systems — so it aimed at
 * the top of that range. The wizard's exam answer (GCSE, A-Level, IB, …) is
 * the most specific thing we know; the region's label is the fallback. */
export async function studentLevel(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const answers = readOnboarding(data.session?.user ?? null);
    if (answers?.examType && answers.examType !== "other") {
      return examBoardLabel(answers.examType, answers.region);
    }
    if (answers?.goal === "university") return "university";
  } catch {
    /* No session to read: fall through to the region. */
  }
  return getFramework().boardLabel;
}

/** The instruction every question-and-marking prompt gets, so what is asked,
 *  what is credited and what is recorded as missing all use one standard. */
export function levelRules(level: string): string {
  return `STUDENT LEVEL: ${level}.
- Ask only for what a ${level} mark scheme would require. Do not ask for detail from a higher level.
- An answer that covers the ${level} mark-scheme points is a full answer: score it as one, and never list higher-level detail as missing.
- If the level names more than one qualification, aim at the first (the lower) unless the student's own answers show they are working above it.
- Never attribute a claim to the student that they did not make.`;
}
