import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type Ref } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { Note } from "../../api/types";
import {
  NotesEditorPane,
  SAVE_DEBOUNCE_MS,
  SAVE_BUSY_RETRY_MS,
  SAVE_ERROR_RETRY_MS,
} from "./NotesEditorPane";

/* The autosave state machine in isolation, on fake timers — the sibling
 * NotesEditorPane.test.tsx covers the inline-AI surface with real ones and
 * the two don't mix. What's under test here is the path that used to lose a
 * student's work: a debounce that fired while a save was in flight bailed out
 * without rescheduling, leaving the last edit sitting in a ref that nothing
 * would ever read again. */

const saveState = vi.hoisted(() => ({ isPending: false }));
const mutateMock = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useNotes", () => ({
  useUpdateNoteHtml: () => ({
    isPending: saveState.isPending,
    mutate: mutateMock,
  }),
}));

vi.mock("../../hooks/useStudyPackage", () => ({
  useRetryStudyPackage: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("../../lib/materialProcessing", () => ({
  useMaterialProcessing: () => ({ status: "completed" }),
}));

vi.mock("../../context/settings", () => ({
  useSettings: () => ({ settings: { aiLanguage: "English" } }),
}));

vi.mock("../../context/toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("./NotesAiSidebar", () => ({
  NotesAiSidebar: () => <aside aria-label="Study assistant" />,
}));

vi.mock("../../components/RichTextEditor", async () => {
  const React = await import("react");
  let typed = 0;
  return {
    RichTextEditor: ({
      ref,
      onUserChange,
    }: {
      ref?: Ref<unknown>;
      initialHtml: string;
      onUserChange?: (html: string) => void;
    }) => {
      React.useImperativeHandle(ref, () => ({
        getPlainText: () => "",
        getHtml: () => "<p>edit</p>",
        setHtml: () => {},
        appendText: () => {},
        getSelection: () => null,
        getSelectedText: () => "",
        getSelectedHtml: () => "",
        getSelectionRect: () => null,
        replaceRange: () => {},
        insertAfterRange: () => {},
        onSelectionChange: () => {},
      }));
      return (
        <button
          type="button"
          onClick={() => onUserChange?.(`<p>edit ${++typed}</p>`)}
        >
          Simulate typing
        </button>
      );
    },
  };
});

const note: Note = {
  id: "note-1",
  user_id: "user-1",
  material_id: "material-1",
  markdown_content: "",
  html_content: "<p>original</p>",
  created_at: "2026-08-22T00:00:00.000Z",
};

/* A button that re-renders the pane on demand. In the app react-query
   re-renders when `isPending` flips; here that flip is a plain assignment, so
   the render it would have caused has to be asked for explicitly. */
function Harness() {
  const [, setTick] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setTick((t) => t + 1)}>
        Re-render
      </button>
      <NotesEditorPane
        materialId="material-1"
        materialTitle="Cell division"
        folderId={null}
        note={note}
      />
    </>
  );
}

function renderPane() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const type = () =>
  fireEvent.click(screen.getByRole("button", { name: "Simulate typing" }));
const rerender = () =>
  fireEvent.click(screen.getByRole("button", { name: "Re-render" }));
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("NotesEditorPane autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveState.isPending = false;
    mutateMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("comes back for an edit whose save was blocked by one in flight", () => {
    saveState.isPending = true;
    renderPane();

    type();
    advance(SAVE_DEBOUNCE_MS);
    // Correct so far: the in-flight save is left to finish rather than raced.
    expect(mutateMock).not.toHaveBeenCalled();

    // The student stops typing here. Nothing else will ever call flush, so
    // this is the moment the edit used to be stranded.
    saveState.isPending = false;
    rerender();
    advance(SAVE_BUSY_RETRY_MS);

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock.mock.calls[0][0]).toEqual({
      id: "note-1",
      htmlContent: "<p>edit 1</p>",
    });
  });

  it("retries a failed save once, then stops and says so", () => {
    mutateMock.mockImplementation(
      (
        _vars: unknown,
        opts: { onError: (e: Error) => void },
      ) => opts.onError(new Error("network down")),
    );
    renderPane();

    type();
    advance(SAVE_DEBOUNCE_MS);
    expect(mutateMock).toHaveBeenCalledTimes(1);
    // First failure is not final — the edit goes back in the buffer and the
    // status stays "unsaved" rather than jumping straight to red.
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    advance(SAVE_ERROR_RETRY_MS);
    expect(mutateMock).toHaveBeenCalledTimes(2);
    // The retry carries the same body — the failed save put it back in the
    // buffer instead of dropping it.
    expect(mutateMock.mock.calls[1][0]).toEqual(mutateMock.mock.calls[0][0]);
    expect(screen.getByText("Failed to save")).toBeInTheDocument();

    // Second failure is the end of it — no retry storm against a dead network.
    advance(SAVE_ERROR_RETRY_MS * 5);
    expect(mutateMock).toHaveBeenCalledTimes(2);
  });

  it("warns before the tab closes on work that hasn't reached the server", () => {
    mutateMock.mockImplementation(
      (
        _vars: unknown,
        opts: { onError: (e: Error) => void },
      ) => opts.onError(new Error("network down")),
    );
    renderPane();

    const beforeUnload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    // Clean document: closing the tab is not worth interrupting.
    expect(beforeUnload()).toBe(false);

    type();
    expect(beforeUnload()).toBe(true);

    // Still guarded once the save has failed for good — this is exactly the
    // screen a student would otherwise close on a red label and lose.
    advance(SAVE_DEBOUNCE_MS);
    advance(SAVE_ERROR_RETRY_MS);
    expect(screen.getByText("Failed to save")).toBeInTheDocument();
    expect(beforeUnload()).toBe(true);
  });

  it("releases the unload guard once the edit is saved", () => {
    mutateMock.mockImplementation(
      (_vars: unknown, opts: { onSuccess: () => void }) => opts.onSuccess(),
    );
    renderPane();

    type();
    advance(SAVE_DEBOUNCE_MS);
    expect(screen.getByText("Saved")).toBeInTheDocument();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
