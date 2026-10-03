import { supabase } from "./supabase";
import { examBoardLabel, readOnboarding } from "./onboarding";
import { getFramework } from "./region";
import { queryClient } from "./queryClient";
import { localDateStr } from "./date";
import { pickExamSpec } from "./examSpec";
import { specWithTierLabel, syllabusPromptLine } from "./syllabus";
import { examsApi } from "../api/exams";
import { examsKeys } from "../hooks/useExams";

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
  /* A guess from the browser's locale, said to be one: an en-US laptop
     used by a GCSE student was being marked against "AP / College Board".
     First run now asks; this is for the students who skipped it. */
  return `${getFramework().boardLabel} (not confirmed by the student, so keep to core secondary-school detail)`;
}

export interface StudentStandard {
  /** What `studentLevel()` returns, or the exam's own spec and tier when the
   *  work belongs to an exam that names one. */
  level: string;
  /** The spec (and section) line for the prompt, or "" when none applies. */
  specLine: string;
}

/* Exams are read through the shared query cache, so a session that already
   has them on screen makes no request, and one that doesn't makes one. */
const EXAMS_STALE_MS = 5 * 60_000;

/**
 * The standard to pitch work on `topic` at. When the topic belongs to one of
 * the student's upcoming exams with a specification (lib/examSpec), that
 * spec — "AQA GCSE Biology (8461), Higher tier" — is the level, and the
 * matched spec section comes with it. Otherwise this is `studentLevel()`.
 * Never throws and never blocks on a failed read: the spec is a refinement.
 */
export async function studentStandard(topic?: string | null): Promise<StudentStandard> {
  const fallback = async (): Promise<StudentStandard> => ({
    level: await studentLevel(),
    specLine: "",
  });
  try {
    const exams = await queryClient.fetchQuery({
      queryKey: examsKeys.all,
      queryFn: examsApi.fetch,
      staleTime: EXAMS_STALE_MS,
    });
    const match = pickExamSpec(exams, localDateStr(), topic);
    if (!match) return fallback();
    return {
      level: specWithTierLabel(match.spec, match.tier),
      specLine: syllabusPromptLine(match.spec, match.tier, match.topic),
    };
  } catch {
    return fallback();
  }
}

/** The instruction every question-and-marking prompt gets, so what is asked,
 *  what is credited and what is recorded as missing all use one standard. */
export function levelRules(level: string, specLine = ""): string {
  return `STUDENT LEVEL: ${level}.
- Ask only for what a ${level} mark scheme would require. Do not ask for detail from a higher level.
- An answer that covers the ${level} mark-scheme points is a full answer: score it as one, and never list higher-level detail as missing.
- If the level names more than one qualification, aim at the first (the lower) unless the student's own answers show they are working above it.
- Never attribute a claim to the student that they did not make.${specLine ? `\n${specLine}` : ""}`;
}
