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
import { callEdge } from "../../api/ai";
import { useMutation } from "@tanstack/react-query";
import { useSettings } from "../../context/settings";
import { useToast } from "../../context/toast";
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

  const { settings } = useSettings();
  const { showToast } = useToast();
  const [complexity, setComplexity] = useState(3);
  const [undoStack, setUndoStack] = useState<string[]>([]);

  const rewriteMutation = useMutation({
    mutationFn: async (level: number) => {
      const currentHtml = editorRef.current?.getHtml() || "";
      let levelDesc = "";
      if (level === 1) levelDesc = "Explain it like I am 5 years old. Extremely simple language, analogies.";
      else if (level === 2) levelDesc = "Simplified for a beginner. Clear, no jargon.";
      else if (level === 3) levelDesc = "Standard college level. Balanced detail and clarity.";
      else if (level === 4) levelDesc = "Advanced academic level. Highly detailed, domain-specific terminology.";
      else if (level === 5) levelDesc = "Expert / post-graduate level. Dense, rigorous, assume deep prior knowledge.";

      const prompt = `Rewrite the following notes to match this complexity level: ${levelDesc}\n\nNotes:\n${currentHtml}`;

      return callEdge({
        history: [{ role: "user", content: prompt }],
        mode: "rewrite",
        settings,
      });
    },
    onSuccess: (result) => {
      const currentHtml = editorRef.current?.getHtml() || "";
      setUndoStack((prev) => [...prev, currentHtml]);

      const md = result.text;
      const html = renderMarkdown(md);
      editorRef.current?.setHtml(html);
      handleUserChange(html);
      showToast("Notes rewritten!");
    },
    onError: (_err) => {
      showToast("Failed to rewrite notes.", { error: true });
    }
  });

  const undoRewrite = () => {
    if (undoStack.length === 0) return;
    const lastHtml = undoStack[undoStack.length - 1];
    editorRef.current?.setHtml(lastHtml);
    handleUserChange(lastHtml);
    setUndoStack((prev) => prev.slice(0, -1));
    showToast("Rewrite undone.");
  };

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

      <div className={styles.complexityBar} style={{ padding: '8px 16px', background: 'var(--panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500 }}>Complexity:</span>
        <input 
          type="range" 
          min="1" 
          max="5" 
          value={complexity} 
          onChange={(e) => setComplexity(Number(e.target.value))}
          style={{ flex: 1, maxWidth: '200px' }}
        />
        <span style={{ fontSize: '12px', color: 'var(--muted)', width: '80px' }}>
          {complexity === 1 ? "ELI5" : complexity === 2 ? "Beginner" : complexity === 3 ? "Standard" : complexity === 4 ? "Advanced" : "Expert"}
        </span>
        <Button 
          size="sm" 
          disabled={!note || rewriteMutation.isPending}
          onClick={() => rewriteMutation.mutate(complexity)}
        >
          {rewriteMutation.isPending ? "Rewriting..." : "Rewrite Notes"}
        </Button>
        {undoStack.length > 0 && (
          <Button size="sm" variant="secondary" onClick={undoRewrite}>
            Undo Rewrite
          </Button>
        )}
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
