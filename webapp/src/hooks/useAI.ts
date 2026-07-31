import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createStudyPackage,
  generateWeeklyPlan,
  type CreateStudyPackageRequest,
} from "../api/ai";
import { decksKeys } from "./useDecks";
import { flashcardsKeys } from "./useFlashcards";
import { materialsKeys } from "./useMaterials";
import { notesKeys } from "./useNotes";
import { quizzesKeys } from "./useQuizzes";

/* createStudyPackage() can write to materials, notes, decks, flashcards and
 * quizzes in one call — same broad invalidation shape useDeleteFolder/
 * useDeleteMaterial already use for their own cross-entity writes (Step 11). */
export function useCreateStudyPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateStudyPackageRequest) => createStudyPackage(request),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: materialsKeys.all });
      qc.invalidateQueries({ queryKey: notesKeys.all });
      qc.invalidateQueries({ queryKey: decksKeys.all });
      qc.invalidateQueries({ queryKey: flashcardsKeys.dueCount });
      qc.invalidateQueries({ queryKey: quizzesKeys.all });
    },
  });
}

export function useGenerateWeeklyPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => generateWeeklyPlan(),
    // The week a plan lands on isn't known to the caller ahead of the call
    // (generateWeeklyPlan derives "this week" itself), so the whole "plans"
    // prefix is invalidated rather than one specific week's key.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}
