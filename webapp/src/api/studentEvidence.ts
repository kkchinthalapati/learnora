/* Fetches the rows `lib/studentEvidence.ts` reduces.
 *
 * Kept apart from the pure reducer so the aggregation stays testable without a
 * Supabase double, and so every AI surface that wants performance context —
 * chat, the notebook studio, sparring — reaches it the same way.
 *
 * Best-effort by design, matching `loadWorkspaceContext` in api/aiPlan.ts: a
 * chat reply that knows less is a far smaller loss than no reply at all, so a
 * read failure resolves to `EMPTY_EVIDENCE` rather than throwing. That is the
 * honest fallback too — `EMPTY_EVIDENCE` carries `confidence: "none"`, whose
 * prompt rule forbids the model from estimating anything, so a failed read
 * makes the assistant more cautious rather than silently less grounded.
 */

import { quizzesApi } from "./quizzes";
import {
  EMPTY_EVIDENCE,
  buildStudentEvidence,
  type StudentEvidence,
} from "../lib/studentEvidence";

export async function loadStudentEvidence(): Promise<StudentEvidence> {
  try {
    const [quizzes, attempts] = await Promise.all([
      quizzesApi.fetchAll(),
      quizzesApi.fetchAllAttempts(),
    ]);
    return buildStudentEvidence({ quizzes, attempts });
  } catch (err) {
    console.warn("[evidence] Failed to load quiz performance:", err);
    return EMPTY_EVIDENCE;
  }
}
