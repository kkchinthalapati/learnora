import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "../../components/RichTextEditor";
import { useUpdateNoteHtml } from "../../hooks/useNotes";
import { renderMarkdown } from "../../lib/markdown";
import { NotesAiSidebar } from "./NotesAiSidebar";
import type { Note } from "../../api/types";
import styles from "./notes.module.css";

export const SAVE_DEBOUNCE_MS = 2000;
const SAVED_STATUS_LINGER_MS = 2000;

type SaveStatus =
  "idle" | "unsaved" | "saving" | "saved" | "failed" | "readonly";

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: "",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  failed: "Failed to save",
  readonly: "Notes aren't ready to edit yet",
};

const STATUS_CLASS: Record<SaveStatus, string | undefined> = {
  idle: undefined,
  unsaved: styles.statusUnsaved,
  saving: undefined,
  saved: styles.statusSaved,
  failed: styles.statusFailed,
  readonly: undefined,
};

interface NotesEditorPaneProps {
  materialId: string;
  materialTitle: string;
  /** The open material's folder, passed through to the AI sidebar's
   *  quick-action cards so a deck or quiz made from this document is filed
   *  alongside it. */
  folderId: string | null;
  /** The material's most recent note row, or null if generation hasn't
   *  produced one yet. Rendered by `NotesView`, keyed on the material id so
   *  a navigation between two materials always mounts a fresh instance. */
  note: Note | null;
}

/* The autosave/save-status state machine above RichTextEditor, which only
 * knows how to hold a document — ports js/editor.js's `save`/`scheduleSave`/
 * `destroy` (:122-189). */
export function NotesEditorPane({
  materialId,
  materialTitle,
  folderId,
  note,
}: NotesEditorPaneProps) {
  const navigate = useNavigate();
  const updateHtml = useUpdateNoteHtml();
  const [status, setStatus] = useState<SaveStatus>(note ? "idle" : "readonly");
  const editorRef = useRef<RichTextEditorHandle>(null);

  const dirtyHtmlRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Always points at the latest `flush` — read from the unmount cleanup
     effect below, which (being unmount-only) would otherwise close over a
     stale `note`/mutation. Same pattern useTaskActions.ts uses for its own
     flush-on-unmount. */
  const flushRef = useRef<() => void>(() => {});

  const acknowledgeSaved = useCallback(() => {
    setStatus("saved");
    if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
    lingerTimerRef.current = setTimeout(() => {
      setStatus((s) => (s === "saved" ? "idle" : s));
    }, SAVED_STATUS_LINGER_MS);
  }, []);

  const flush = useCallback(() => {
    if (!note || dirtyHtmlRef.current === null) return;
    /* A save already in flight is left to finish rather than raced — the
       vanilla's own guard (js/editor.js:130). Whichever edit is current by
       the time this one settles gets its own turn: the debounce timer is
       reset on every keystroke regardless, so nothing beyond this one save
       cycle is silently dropped. */
    if (updateHtml.isPending) return;

    const html = dirtyHtmlRef.current;
    dirtyHtmlRef.current = null;
    setStatus("saving");
    updateHtml.mutate(
      { id: note.id, htmlContent: html },
      { onSuccess: acknowledgeSaved, onError: () => setStatus("failed") },
    );
  }, [note, updateHtml, acknowledgeSaved]);
  flushRef.current = flush;

  const handleUserChange = useCallback((html: string) => {
    dirtyHtmlRef.current = html;
    setStatus("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(
      () => flushRef.current(),
      SAVE_DEBOUNCE_MS,
    );
  }, []);

  /* Flush a pending edit on unmount rather than drop it — Editor.destroy()
     does the same fire-and-forget save (js/editor.js:180-189), so navigating
     away inside the 2s debounce window doesn't lose the edit. */
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
      flushRef.current();
    };
  }, []);

  function manualSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (dirtyHtmlRef.current === null) {
      /* Save on an unchanged doc used to do nothing at all, which read as a
         broken button (js/editor.js:131-138) — acknowledge it instead. */
      acknowledgeSaved();
      return;
    }
    flush();
  }

  const initialHtml =
    note?.html_content ||
    (note?.markdown_content ? renderMarkdown(note.markdown_content) : "") ||
    (note
      ? ""
      : "<p>No notes yet — Learnora is still processing this material.</p>");

  return (
    <div className={styles.view}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Button size="sm" onClick={() => void navigate(-1)}>
            ← Back
          </Button>
          <span className={styles.title}>{materialTitle}</span>
        </div>
        <div className={styles.toolbarRight}>
          <span
            className={`${styles.status}${STATUS_CLASS[status] ? ` ${STATUS_CLASS[status]}` : ""}`}
            role={status === "failed" ? "alert" : "status"}
          >
            {STATUS_TEXT[status]}
          </span>
          <Button
            variant="primary"
            size="sm"
            disabled={!note}
            onClick={manualSave}
          >
            Save
          </Button>
        </div>
      </div>

      <div className={styles.splitLayout}>
        <Card variant="elevated" padding="none" className={styles.editorPane}>
          <RichTextEditor
            ref={editorRef}
            initialHtml={initialHtml}
            readOnly={!note}
            placeholder="Start typing your notes here…"
            onUserChange={note ? handleUserChange : undefined}
          />
        </Card>

        <NotesAiSidebar
          materialId={materialId}
          folderId={folderId}
          getDocumentText={() => editorRef.current?.getPlainText() ?? ""}
          onInsertText={
            note ? (text) => editorRef.current?.appendText(text) : undefined
          }
        />
      </div>
    </div>
  );
}
