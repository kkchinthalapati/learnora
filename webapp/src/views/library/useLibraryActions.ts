import { useCallback } from "react";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useDeleteFolder, useRenameFolder } from "../../hooks/useFolders";
import { useDeleteMaterial } from "../../hooks/useMaterials";
import { useDeleteDeck } from "../../hooks/useDecks";
import { useDeleteQuiz } from "../../hooks/useQuizzes";

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
        const folderDeleteOutcome = await deleteFolder.mutateAsync(id);
        if (folderDeleteOutcome?.storageCleanupFailed) {
          showToast(
            `Deleted "${name}", but some files may not have been fully cleaned up.`,
            { error: true },
          );
        } else {
          showToast(`Deleted "${name}".`);
        }
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
      // Decks belong to folders, not materials, so deleting a material keeps
      // its flashcard decks. Notes and quizzes are deleted with the material.
      const ok = await confirm(
        `"${title}" will be permanently deleted, along with the notes and quizzes generated from it.`,
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
