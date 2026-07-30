import { useCallback } from "react";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useDeleteFolder, useRenameFolder } from "../../hooks/useFolders";
import { useDeleteMaterial } from "../../hooks/useMaterials";
import { useDeleteDeck } from "../../hooks/useDecks";
import { useDeleteQuiz } from "../../hooks/useQuizzes";

/* The confirm-then-delete flows the Library tabs and a subject's workspace
 * share, ported from js/router.js:540-638 (renameFolder, deleteFolder,
 * deleteMaterial, deleteDeck, deleteQuiz). Every confirmation keeps the
 * vanilla's exact wording — these are the messages that tell a student what
 * else disappears with the thing they clicked.
 *
 * Two deliberate changes:
 *
 * 1. Failures surface as an error toast rather than `UI.showPopup`. The React
 *    app has no popup primitive (DialogProvider covers confirm/promptText
 *    only), and a failed delete is exactly the transient, non-blocking report
 *    a toast exists for.
 * 2. A successful folder delete now toasts like the other three. The vanilla
 *    silently re-rendered the grid, so the only feedback that anything had
 *    happened was a card vanishing.
 *
 * Nothing here re-renders a view by hand: the vanilla's four "which screen am
 * I on?" branches (each parsing `window.location.hash` for `folder-<id>` to
 * decide whether to call `loadFolderDetail` or `loadAllX`) are replaced by the
 * mutations' cache invalidation, which reaches every subscriber regardless of
 * which one is mounted. */
export function useLibraryActions() {
  const { confirm, promptText } = useDialog();
  const { showToast } = useToast();
  const deleteFolder = useDeleteFolder();
  const renameFolder = useRenameFolder();
  const deleteMaterial = useDeleteMaterial();
  const deleteDeck = useDeleteDeck();
  const deleteQuiz = useDeleteQuiz();

  const rename = useCallback(
    async (id: string, currentName: string) => {
      const name = await promptText("Give this folder a new name.", {
        title: "Rename folder",
        defaultValue: currentName,
        confirmText: "Save",
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

  const removeFolder = useCallback(
    async (id: string, name: string) => {
      const ok = await confirm(
        `"${name}" and everything inside it — materials, notes, flashcards, and quizzes — will be permanently deleted. Your logged study time for this folder is kept.`,
        { title: "Delete folder?", confirmText: "Delete", danger: true },
      );
      if (!ok) return;
      try {
        await deleteFolder.mutateAsync(id);
        showToast(`Deleted "${name}".`);
      } catch {
        showToast("Couldn't delete that folder. Please try again.", {
          error: true,
        });
      }
    },
    [confirm, deleteFolder, showToast],
  );

  const removeMaterial = useCallback(
    async (id: string, title: string, storagePath: string | null) => {
      const ok = await confirm(
        `"${title}" will be permanently deleted, along with the notes, flashcards and quizzes generated from it.`,
        { title: "Delete file?", confirmText: "Delete", danger: true },
      );
      if (!ok) return;
      try {
        await deleteMaterial.mutateAsync({ id, storagePath });
        showToast(`Deleted "${title}".`);
      } catch {
        showToast("Couldn't delete that file. Please try again.", {
          error: true,
        });
      }
    },
    [confirm, deleteMaterial, showToast],
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

  return { rename, removeFolder, removeMaterial, removeDeck, removeQuiz };
}
