import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createStudyPackage,
  type StudyPackageRequest,
  type StudyPackageResult,
} from "../api/studyPackage";
import { useSettings } from "../context/settings";
import { decksKeys } from "./useDecks";
import { flashcardsKeys } from "./useFlashcards";
import { foldersKeys } from "./useFolders";
import { materialsKeys } from "./useMaterials";
import { notesKeys } from "./useNotes";
import { quizzesKeys } from "./useQuizzes";

/** What the caller supplies — `settings` is read here rather than passed in,
 *  so the request carries whatever `SettingsProvider` currently holds,
 *  including edits the user hasn't saved yet. That is what the vanilla's
 *  `UI.loadSettings()` read off its live in-memory object, and it matches
 *  `useGenerateWeeklyPlan`. */
export type StudyPackageInput = Omit<StudyPackageRequest, "settings">;

/* One run can write rows in five tables, and a partial run writes a subset of
 * them — so rather than reason about which, every list the run could have
 * touched is invalidated once at the end. Cheap: these are the same queries a
 * navigation to the Library would refetch anyway, and the alternative (writing
 * each new row into its cache by hand) has to get the per-folder keys right
 * for a deck the student may never open. */
export function useCreateStudyPackage() {
  const qc = useQueryClient();
  const { settings } = useSettings();

  return useMutation({
    mutationFn: (input: StudyPackageInput) =>
      createStudyPackage({ ...input, settings }),
    onSuccess: (result: StudyPackageResult) => {
      if (result.material) {
        qc.invalidateQueries({ queryKey: materialsKeys.all });
        // Notes are keyed per material, and this run may have written the
        // first ones this material has ever had.
        qc.invalidateQueries({
          queryKey: notesKeys.byMaterial(result.material.id),
        });
      }
      if (result.deck) {
        qc.invalidateQueries({ queryKey: decksKeys.all });
        if (result.deck.folder_id) {
          qc.invalidateQueries({
            queryKey: decksKeys.byFolder(result.deck.folder_id),
          });
        }
        // Brand-new cards have a NULL next_review_date, so they are due now —
        // the dashboard and Library both show that count.
        qc.invalidateQueries({ queryKey: flashcardsKeys.dueCount });
      }
      if (result.quiz) qc.invalidateQueries({ queryKey: quizzesKeys.all });
      // Subject cards count the materials, decks and quizzes filed under them.
      if (result.material || result.deck || result.quiz) {
        qc.invalidateQueries({ queryKey: foldersKeys.all });
      }
    },
  });
}
