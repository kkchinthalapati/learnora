import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createStudyPackage,
  type CreateOptions,
  type StudyPackageRequest,
  type StudyPackageResult,
} from "../api/studyPackage";
import {
  getMaterialProcessing,
  setMaterialProcessing,
} from "../lib/materialProcessing";
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

function handleProcessingStatusUpdate(
  materialId: string,
  result: StudyPackageResult,
  input?: unknown,
) {
  if (result.failures.length > 0) {
    const notesFailed = result.failures.some((f) => f.stage === "notes");
    if (!notesFailed && result.notes !== null) {
      setMaterialProcessing({
        materialId,
        status: "partially_processed",
        stageFailures: result.failures,
        error: result.failures.map((f) => f.message).join(" "),
        requestPayload: input,
      });
    } else if (notesFailed) {
      setMaterialProcessing({
        materialId,
        status: "failed",
        stageFailures: result.failures,
        error:
          result.failures.find((f) => f.stage === "notes")?.message ??
          "Notes generation failed.",
        requestPayload: input,
      });
    } else {
      setMaterialProcessing({
        materialId,
        status: "partially_processed",
        stageFailures: result.failures,
        error: result.failures.map((f) => f.message).join(" "),
        requestPayload: input,
      });
    }
  } else {
    setMaterialProcessing({
      materialId,
      status: "completed",
      requestPayload: input,
    });
  }
}

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
    mutationFn: async (input: StudyPackageInput) => {
      const startingMaterialId =
        input.source.kind === "material" ? input.source.materialId : null;
      if (startingMaterialId) {
        setMaterialProcessing({
          materialId: startingMaterialId,
          status: "processing",
          requestPayload: input,
        });
      }

      try {
        const result = await createStudyPackage({ ...input, settings });
        const targetMaterialId = result.material?.id ?? startingMaterialId;
        if (targetMaterialId) {
          handleProcessingStatusUpdate(targetMaterialId, result, input);
        }
        return result;
      } catch (err) {
        const targetMaterialId = startingMaterialId;
        if (targetMaterialId) {
          setMaterialProcessing({
            materialId: targetMaterialId,
            status: "failed",
            error: err instanceof Error ? err.message : "Processing failed.",
            requestPayload: input,
          });
        }
        throw err;
      }
    },
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

export interface RetryStudyPackageOptions {
  materialId: string;
  outputs?: { flashcards?: boolean; quiz?: boolean };
  options?: CreateOptions;
  folderId?: string | null;
  title?: string;
  onProgress?: (message: string) => void;
}

export function useRetryStudyPackage() {
  const qc = useQueryClient();
  const { settings } = useSettings();

  return useMutation({
    mutationFn: async (
      args: string | RetryStudyPackageOptions,
    ): Promise<StudyPackageResult> => {
      const materialId = typeof args === "string" ? args : args.materialId;
      const prevRecord = getMaterialProcessing(materialId);
      const prevPayload = prevRecord?.requestPayload as
        | StudyPackageInput
        | undefined;

      const outputs =
        typeof args !== "string" && args.outputs
          ? args.outputs
          : prevPayload?.outputs ?? { flashcards: true, quiz: true };

      const options =
        typeof args !== "string" && args.options
          ? args.options
          : prevPayload?.options;

      const folderId =
        typeof args !== "string" && args.folderId !== undefined
          ? args.folderId
          : prevPayload?.folderId;

      const title =
        typeof args !== "string" && args.title !== undefined
          ? args.title
          : prevPayload?.title;

      const onProgress = typeof args !== "string" ? args.onProgress : undefined;

      setMaterialProcessing({
        materialId,
        status: "processing",
      });

      try {
        const result = await createStudyPackage({
          source: { kind: "material", materialId },
          folderId,
          title,
          outputs,
          options,
          settings,
          onProgress,
        });

        handleProcessingStatusUpdate(materialId, result, {
          source: { kind: "material", materialId },
          folderId,
          title,
          outputs,
          options,
        });

        return result;
      } catch (err) {
        setMaterialProcessing({
          materialId,
          status: "failed",
          error: err instanceof Error ? err.message : "Processing failed.",
        });
        throw err;
      }
    },
    onSuccess: (result: StudyPackageResult) => {
      if (result.material) {
        qc.invalidateQueries({ queryKey: materialsKeys.all });
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
        qc.invalidateQueries({ queryKey: flashcardsKeys.dueCount });
      }
      if (result.quiz) qc.invalidateQueries({ queryKey: quizzesKeys.all });
      if (result.material || result.deck || result.quiz) {
        qc.invalidateQueries({ queryKey: foldersKeys.all });
      }
    },
  });
}
