import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../context/toast";

export const DEFERRED_DELETE_WINDOW_MS = 4000;

export interface UseDeferredDeleteOptions<TId> {
  deleteFn: (id: TId) => Promise<void>;
  invalidateKey: string[];
  label: string;
}

export interface UseDeferredDeleteResult<TId, T> {
  /** Hide the item from the UI and arm an undo window. */
  remove: (id: TId, undoLabel?: string) => void;
  /** Filter items to exclude those pending deletion. */
  visible: (items: T[], idOf: (item: T) => TId) => T[];
  /** The set of IDs currently pending deletion. */
  pendingIds: ReadonlySet<TId>;
}

/**
 * Generalized deferred-delete-with-undo pattern.
 *
 * Hide an item from the UI immediately, show an "Undo" toast for N ms,
 * and only fire the actual delete API call once the window closes or on
 * unmount. If the user clicks Undo, the timer is cleared and the item
 * reappears.
 *
 * The deferred delete deliberately fires the actual mutation via the
 * passed-in callback, not through a mutation hook that ties to a component
 * lifecycle. That way, a delete armed just before unmounting/navigation
 * still commits (flushed, not cancelled).
 *
 * Based on the pattern from useTaskActions.ts.
 */
export function useDeferredDelete<TId extends string | number, T = never>(
  options: UseDeferredDeleteOptions<TId>,
): UseDeferredDeleteResult<TId, T> {
  const { deleteFn, invalidateKey, label } = options;
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  /* Ids hidden pending their undo window. Kept separate from the query cache
     so a refetch mid-window can't bring the row back. */
  const [pendingDelete, setPendingDelete] = useState<ReadonlySet<TId>>(
    () => new Set(),
  );
  const timers = useRef(new Map<TId, ReturnType<typeof setTimeout>>());
  const undone = useRef(new Set<TId>());
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const commitDelete = useCallback(
    async (id: TId) => {
      timers.current.delete(id);
      if (undone.current.has(id)) {
        undone.current.delete(id);
        return;
      }
      try {
        await deleteFn(id);
        await queryClient.invalidateQueries({ queryKey: invalidateKey });
      } catch (err) {
        if (isMounted.current) {
          setPendingDelete((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
        showToast(`Failed to delete. ${(err as Error).message}`, {
          error: true,
        });
      }
    },
    [deleteFn, invalidateKey, queryClient, showToast],
  );

  /* Flush on unmount rather than cancel — a delete armed just before
     unmounting should still commit. */
  const commitRef = useRef(commitDelete);
  commitRef.current = commitDelete;
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const [id, timer] of map) {
        clearTimeout(timer);
        void commitRef.current(id);
      }
      map.clear();
    };
  }, []);

  const remove = useCallback(
    (id: TId, undoLabel: string = "Undo") => {
      setPendingDelete((prev) => new Set(prev).add(id));
      undone.current.delete(id);

      showToast(`${label} deleted.`, {
        duration: DEFERRED_DELETE_WINDOW_MS,
        actionLabel: undoLabel,
        onAction: () => {
          undone.current.add(id);
          const timer = timers.current.get(id);
          if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
          }
          setPendingDelete((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      });

      timers.current.set(
        id,
        setTimeout(
          () => void commitRef.current(id),
          DEFERRED_DELETE_WINDOW_MS,
        ),
      );
    },
    [showToast, label],
  );

  const visible = useCallback(
    (items: T[], idOf: (item: T) => TId): T[] =>
      items.filter((item) => !pendingDelete.has(idOf(item))),
    [pendingDelete],
  );

  return { remove, visible, pendingIds: pendingDelete };
}
