import { useCallback } from "react";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useDeleteFolder, useRenameFolder } from "../../hooks/useFolders";
import { useDeleteMaterial, useRenameMaterial } from "../../hooks/useMaterials";
import { useDeleteDeck } from "../../hooks/useDecks";
import { useDeleteQuiz } from "../../hooks/useQuizzes";
import { LESSON_TITLE_MAX, SUBJECT_MAX } from "../../lib/fieldLimits";

export function useLibraryActions() {
  const { confirm, promptText } = useDialog();
  const { showToast } = useToast();
  const deleteFolder = useDeleteFolder();
  const renameFolder = useRenameFolder();
  const deleteMaterial = useDeleteMaterial();
  const renameMaterialMutation = useRenameMaterial();
  const deleteDeck = useDeleteDeck();
  const deleteQuiz = useDeleteQuiz();

  const rename = useCallback(
    async (id: string, currentName: string) => {
      const name = await promptText("Give this folder a new name.", {
        title: "Rename folder",
        defaultValue: currentName,
        confirmText: "Save",
        maxLength: SUBJECT_MAX,
      });
      if (!name || name === currentName) return;
      try {
        await renameFolder.mutateAsync({ id, name });
      } catch {
        showToast("Couldn't rename that folder. Please try again.", {
          error: true,
        });
      }
    },
    [promptText, renameFolder, showToast],
  );

  /* Resolves true once the subject is gone, so a page showing it can leave. */
  const removeFolder = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const ok = await confirm(
        `"${name}" and everything inside it — lessons, notes, cards, quizzes and notebooks — will be permanently deleted. Your logged study time for this subject is kept.`,
        { title: "Delete subject?", confirmText: "Delete", danger: true },
      );
      if (!ok) return false;
      try {
        const folderDeleteOutcome = await deleteFolder.mutateAsync(id);
        if (folderDeleteOutcome?.storageCleanupFailed) {
          showToast(
            `Deleted "${name}", but some files may not have been fully cleaned up.`,
            { error: true },
          );
        } else {
          showToast(`Deleted "${name}".`);
        }
        return true;
      } catch {
        showToast("Couldn't delete that subject. Please try again.", {
          error: true,
        });
        return false;
      }
    },
    [confirm, deleteFolder, showToast],
  );

  /* Resolves true once the lesson is gone, so a page showing it can leave. */
  const removeMaterial = useCallback(
    async (id: string, title: string, storagePath: string | null): Promise<boolean> => {
      // Card sets belong to subjects, not lessons, so deleting a lesson keeps
      // them. Its notes and quizzes are deleted with it (FK cascade).
      const ok = await confirm(
        `"${title}" will be permanently deleted, along with its notes and quizzes. Card sets made from it stay in your Library.`,
        { title: "Delete lesson?", confirmText: "Delete", danger: true },
      );
      if (!ok) return false;
      try {
        await deleteMaterial.mutateAsync({ id, storagePath });
        showToast(`Deleted "${title}".`);
        return true;
      } catch {
        showToast("Couldn't delete that lesson. Please try again.", {
          error: true,
        });
        return false;
      }
    },
    [confirm, deleteMaterial, showToast],
  );

  const renameMaterial = useCallback(
    async (id: string, currentTitle: string) => {
      const title = await promptText("Give this lesson a new name.", {
        title: "Rename lesson",
        defaultValue: currentTitle,
        confirmText: "Save",
        maxLength: LESSON_TITLE_MAX,
      });
      if (!title?.trim() || title.trim() === currentTitle) return;
      try {
        await renameMaterialMutation.mutateAsync({ id, title });
      } catch {
        showToast("Couldn't rename that lesson. Please try again.", {
          error: true,
        });
      }
    },
    [promptText, renameMaterialMutation, showToast],
  );

  const removeDeck = useCallback(
    async (id: string, title: string) => {
      const ok = await confirm(
        `"${title}" and all its flashcards will be permanently deleted.`,
        { title: "Delete deck?", confirmText: "Delete", danger: true },
      );
      if (!ok) return;
      try {
        await deleteDeck.mutateAsync(id);
        showToast(`Deleted "${title}".`);
      } catch {
        showToast("Couldn't delete that deck. Please try again.", {
          error: true,
        });
      }
    },
    [confirm, deleteDeck, showToast],
  );

  const removeQuiz = useCallback(
    async (id: string, title: string) => {
      const ok = await confirm(
        `"${title}" and its attempt history will be permanently deleted.`,
        { title: "Delete quiz?", confirmText: "Delete", danger: true },
      );
      if (!ok) return;
      try {
        await deleteQuiz.mutateAsync(id);
        showToast(`Deleted "${title}".`);
      } catch {
        showToast("Couldn't delete that quiz. Please try again.", {
          error: true,
        });
      }
    },
    [confirm, deleteQuiz, showToast],
  );

  return { rename, removeFolder, removeMaterial, renameMaterial, removeDeck, removeQuiz };
}
