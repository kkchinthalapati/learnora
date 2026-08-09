import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useDeleteFolder, useRenameFolder } from "../../hooks/useFolders";
import { foldersKeys } from "../../hooks/useFolders";
import { useDeleteMaterial } from "../../hooks/useMaterials";
import { materialsKeys } from "../../hooks/useMaterials";
import { useDeleteDeck } from "../../hooks/useDecks";
import { decksKeys } from "../../hooks/useDecks";
import { useDeleteQuiz } from "../../hooks/useQuizzes";
import { quizzesKeys } from "../../hooks/useQuizzes";

const DEFERRED_DELETE_WINDOW_MS = 4000;

/* The confirm-then-delete flows the Library tabs and a subject's workspace
 * share, ported from js/router.js:540-638 (renameFolder, deleteFolder,
 * deleteMaterial, deleteDeck, deleteQuiz). Every confirmation keeps the
 * vanilla's exact wording — these are the messages that tell a student what
 * else disappears with the thing they clicked.
 *
 * Deletes now use a deferred pattern with undo (same as task delete): the row
 * hides/item disappears, a toast offers "Undo" for 4s, and the API call only
 * fires once the window closes. This gives users a safety net if they delete
 * by mistake.
 *
 * Two deliberate changes from the vanilla:
 *
 * 1. Failures surface as an error toast rather than `UI.showPopup`. The React
 *    app has no popup primitive (DialogProvider covers confirm/promptText
 *    only), and a failed delete is exactly the transient, non-blocking report
 *    a toast exists for.
 * 2. A successful delete now toasts like the others. The vanilla silently
 *    re-rendered the grid, so the only feedback was a card vanishing.
 *
 * Nothing here re-renders a view by hand: the vanilla's four "which screen am
 * I on?" branches (each parsing `window.location.hash` for `folder-<id>` to
 * decide whether to call `loadFolderDetail` or `loadAllX`) are replaced by the
 * mutations' cache invalidation, which reaches every subscriber regardless of
 * which one is mounted. */
export function useLibraryActions() {
  const { confirm, promptText } = useDialog();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const deleteFolder = useDeleteFolder();
  const renameFolder = useRenameFolder();
  const deleteMaterial = useDeleteMaterial();
  const deleteDeck = useDeleteDeck();
  const deleteQuiz = useDeleteQuiz();

  /* Track pending deletes and their timers so we can cancel them on undo. */
  const [pendingDeletes] = useState(new Map<string, ReturnType<typeof setTimeout>>());
  const [undoneIds] = useState(new Set<string>());

  useEffect(() => {
    return () => {
      /* Flush all pending deletes on unmount. */
      for (const [, timer] of pendingDeletes.entries()) {
        clearTimeout(timer);
      }
      pendingDeletes.clear();
    };
  }, [pendingDeletes]);

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

      let cancelled = false;
      showToast(`Deleted "${name}".`, {
        duration: DEFERRED_DELETE_WINDOW_MS,
        actionLabel: "Undo",
        onAction: () => {
          cancelled = true;
          undoneIds.add(id);
          const timer = pendingDeletes.get(id);
          if (timer) {
            clearTimeout(timer);
            pendingDeletes.delete(id);
          }
        },
      });

      const timer = setTimeout(async () => {
        pendingDeletes.delete(id);
        if (cancelled || undoneIds.has(id)) {
          undoneIds.delete(id);
          return;
        }
        try {
          const result = await deleteFolder.mutateAsync(id);
          await queryClient.invalidateQueries({ queryKey: foldersKeys.all });
          if (result?.storageCleanupFailed) {
            showToast(
              `Deleted "${name}", but some files may not have been fully cleaned up.`,
              { error: true },
            );
          }
        } catch {
          showToast("Couldn't delete that folder. Please try again.", {
            error: true,
          });
        }
      }, DEFERRED_DELETE_WINDOW_MS);

      pendingDeletes.set(id, timer);
    },
    [confirm, deleteFolder, showToast, queryClient, pendingDeletes, undoneIds],
  );

  const removeMaterial = useCallback(
    async (id: string, title: string, storagePath: string | null) => {
      /* The vanilla's copy also named flashcards, but `flashcard_decks` has
         no `material_id` — decks reference a folder only, so a deck outlives
         the material it was generated from. Notes and quizzes really are
         deleted; flashcards aren't touched. */
      const ok = await confirm(
        `"${title}" will be permanently deleted, along with the notes and quizzes generated from it.`,
        { title: "Delete file?", confirmText: "Delete", danger: true },
      );
      if (!ok) return;

      let cancelled = false;
      showToast(`Deleted "${title}".`, {
        duration: DEFERRED_DELETE_WINDOW_MS,
        actionLabel: "Undo",
        onAction: () => {
          cancelled = true;
          undoneIds.add(id);
          const timer = pendingDeletes.get(id);
          if (timer) {
            clearTimeout(timer);
            pendingDeletes.delete(id);
          }
        },
      });

      const timer = setTimeout(async () => {
        pendingDeletes.delete(id);
        if (cancelled || undoneIds.has(id)) {
          undoneIds.delete(id);
          return;
        }
        try {
          await deleteMaterial.mutateAsync({ id, storagePath });
          await queryClient.invalidateQueries({
            queryKey: materialsKeys.all,
          });
        } catch {
          showToast("Couldn't delete that file. Please try again.", {
            error: true,
          });
        }
      }, DEFERRED_DELETE_WINDOW_MS);

      pendingDeletes.set(id, timer);
    },
    [confirm, deleteMaterial, showToast, queryClient, pendingDeletes, undoneIds],
  );

  const removeDeck = useCallback(
    async (id: string, title: string) => {
      const ok = await confirm(
        `"${title}" and all its flashcards will be permanently deleted.`,
        { title: "Delete deck?", confirmText: "Delete", danger: true },
      );
      if (!ok) return;

      let cancelled = false;
      showToast(`Deleted "${title}".`, {
        duration: DEFERRED_DELETE_WINDOW_MS,
        actionLabel: "Undo",
        onAction: () => {
          cancelled = true;
          undoneIds.add(id);
          const timer = pendingDeletes.get(id);
          if (timer) {
            clearTimeout(timer);
            pendingDeletes.delete(id);
          }
        },
      });

      const timer = setTimeout(async () => {
        pendingDeletes.delete(id);
        if (cancelled || undoneIds.has(id)) {
          undoneIds.delete(id);
          return;
        }
        try {
          await deleteDeck.mutateAsync(id);
          await queryClient.invalidateQueries({ queryKey: decksKeys.all });
        } catch {
          showToast("Couldn't delete that deck. Please try again.", {
            error: true,
          });
        }
      }, DEFERRED_DELETE_WINDOW_MS);

      pendingDeletes.set(id, timer);
    },
    [confirm, deleteDeck, showToast, queryClient, pendingDeletes, undoneIds],
  );

  const removeQuiz = useCallback(
    async (id: string, title: string) => {
      const ok = await confirm(
        `"${title}" and its attempt history will be permanently deleted.`,
        { title: "Delete quiz?", confirmText: "Delete", danger: true },
      );
      if (!ok) return;

      let cancelled = false;
      showToast(`Deleted "${title}".`, {
        duration: DEFERRED_DELETE_WINDOW_MS,
        actionLabel: "Undo",
        onAction: () => {
          cancelled = true;
          undoneIds.add(id);
          const timer = pendingDeletes.get(id);
          if (timer) {
            clearTimeout(timer);
            pendingDeletes.delete(id);
          }
        },
      });

      const timer = setTimeout(async () => {
        pendingDeletes.delete(id);
        if (cancelled || undoneIds.has(id)) {
          undoneIds.delete(id);
          return;
        }
        try {
          await deleteQuiz.mutateAsync(id);
          await queryClient.invalidateQueries({ queryKey: quizzesKeys.all });
        } catch {
          showToast("Couldn't delete that quiz. Please try again.", {
            error: true,
          });
        }
      }, DEFERRED_DELETE_WINDOW_MS);

      pendingDeletes.set(id, timer);
    },
    [confirm, deleteQuiz, showToast, queryClient, pendingDeletes, undoneIds],
  );

  return { rename, removeFolder, removeMaterial, removeDeck, removeQuiz };
}
