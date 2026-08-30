import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notebooksApi } from "../api/notebooks";
import type {
  Notebook,
  NotebookSource,
  NotebookArtifact,
  GroundedChatMessage,
} from "../types/notebooks";

/* Notebooks state, backed by Supabase.
 *
 * This previously kept everything in localStorage under
 * "learnora_notebooks_v1" and seeded itself with hardcoded NCERT sample
 * content — so a student lost every notebook by switching browser, nothing
 * synced between devices, and deleting all notebooks re-seeded the samples on
 * the next reload. The grounded tutor and the cheat-sheet-to-deck export were
 * always real (they call callEdge and write to flashcard_decks); only the
 * notebooks themselves were not.
 *
 * See supabase/migrations/20260830000000_add_notebooks.sql and
 * api/notebooks.ts. The hook's shape is unchanged apart from createNotebook,
 * which is now async because the id comes from the database. */

export const notebooksKeys = {
  all: ["notebooks"] as const,
  one: (id: string) => ["notebooks", id] as const,
};

export function useNotebooks() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: notebooksKeys.all,
    queryFn: notebooksApi.fetch,
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: notebooksKeys.all });
  }, [qc]);

  const create = useMutation({
    mutationFn: notebooksApi.add,
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: notebooksApi.delete,
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof notebooksApi.update>[1] }) =>
      notebooksApi.update(id, patch),
    onSuccess: invalidate,
  });

  return {
    notebooks: data ?? [],
    isLoading,
    createNotebook: (input: {
      title: string;
      subject?: string;
      color?: string;
      description?: string;
    }) => create.mutateAsync(input),
    deleteNotebook: (id: string) => remove.mutate(id),
    updateNotebook: (id: string, patch: Parameters<typeof notebooksApi.update>[1]) =>
      update.mutate({ id, patch }),
  };
}

/* The title input and the notes canvas both write on every keystroke. Against
 * localStorage that cost nothing; against Supabase it is one round-trip per
 * character. Both are therefore debounced here rather than in the view, so a
 * caller cannot forget — and held as local drafts meanwhile so typing stays
 * responsive and does not fight the refetch.
 *
 * Modelled on useQuizDraft: the latest value lives in a ref so the unmount
 * effect can flush a pending write without re-subscribing on every change. */
const TEXT_DEBOUNCE_MS = 700;

export function useNotebook(notebookId: string) {
  const qc = useQueryClient();
  const { data: notebook, isLoading } = useQuery({
    queryKey: notebooksKeys.one(notebookId),
    queryFn: () => notebooksApi.fetchOne(notebookId),
    enabled: Boolean(notebookId),
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: notebooksKeys.one(notebookId) });
    void qc.invalidateQueries({ queryKey: notebooksKeys.all });
  }, [qc, notebookId]);

  /* --- Debounced free-text fields ---------------------------------------- */
  const [draft, setDraft] = useState<{ title?: string; notes?: string }>({});
  const pending = useRef<{ title?: string; notes?: string }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    if (!notebookId || Object.keys(patch).length === 0) return;
    pending.current = {};
    void notebooksApi.update(notebookId, patch).then(invalidate);
  }, [notebookId, invalidate]);

  const queueText = useCallback(
    (patch: { title?: string; notes?: string }) => {
      setDraft((d) => ({ ...d, ...patch }));
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, TEXT_DEBOUNCE_MS);
    },
    [flush],
  );

  /* Flush on unmount so navigating away mid-debounce does not drop the edit.
     Empty deps: `flush` reads everything it needs from refs. */
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  /* Once a save has landed and the refetch has caught up, drop the draft so
     the server value is authoritative again. */
  useEffect(() => {
    if (!notebook) return;
    setDraft((d) => {
      const next = { ...d };
      if (next.title !== undefined && next.title === notebook.title) delete next.title;
      if (next.notes !== undefined && next.notes === notebook.notes) delete next.notes;
      return Object.keys(next).length === Object.keys(d).length ? d : next;
    });
  }, [notebook]);

  const merged: Notebook | null = notebook
    ? { ...notebook, ...draft }
    : null;

  /* --- Child collections -------------------------------------------------- */
  const mutate = <A,>(fn: (arg: A) => Promise<unknown>) =>
    (arg: A) => void fn(arg).then(invalidate);

  return {
    notebook: merged,
    isLoading,
    updateTitle: (title: string) => queueText({ title }),
    updateNotes: (notes: string) => queueText({ notes }),
    addSource: mutate((source: Omit<NotebookSource, "id" | "uploadedAt" | "selected">) =>
      notebooksApi.addSource(notebookId, { ...source, selected: true }),
    ),
    toggleSource: (sourceId: string) => {
      const current = merged?.sources.find((s) => s.id === sourceId);
      if (!current) return;
      void notebooksApi
        .setSourceSelected(sourceId, !current.selected)
        .then(invalidate);
    },
    removeSource: mutate((sourceId: string) => notebooksApi.deleteSource(sourceId)),
    addArtifact: mutate((artifact: Omit<NotebookArtifact, "id" | "createdAt">) =>
      notebooksApi.addArtifact(notebookId, artifact),
    ),
    removeArtifact: mutate((artifactId: string) =>
      notebooksApi.deleteArtifact(artifactId),
    ),
    addChatMessage: mutate((message: Omit<GroundedChatMessage, "id" | "timestamp">) =>
      notebooksApi.addMessage(notebookId, message),
    ),
    clearChat: () => void notebooksApi.clearMessages(notebookId).then(invalidate),
  };
}
