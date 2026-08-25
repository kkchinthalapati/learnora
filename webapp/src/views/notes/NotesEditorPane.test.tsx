import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ref } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { Note } from "../../api/types";
import { NotesEditorPane } from "./NotesEditorPane";

const editorMock = vi.hoisted(() => ({
  html: "<p>Original selected passage with more notes</p>",
  plain: "Original selected passage with more notes\n",
  selectionCallback: null as
    ((range: { index: number; length: number } | null) => void) | null,
  replaceRange: vi.fn(),
  insertAfterRange: vi.fn(),
  setHtml: vi.fn(),
}));
const runInlineActionMock = vi.hoisted(() => vi.fn());
const createCardFromSnippetMock = vi.hoisted(() => vi.fn());
const showToastMock = vi.hoisted(() => vi.fn());
const updateMutateMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/aiInlineActions", () => ({
  runInlineAction: runInlineActionMock,
  createCardFromSnippet: createCardFromSnippetMock,
}));

vi.mock("../../hooks/useNotes", () => ({
  useUpdateNoteHtml: () => ({ isPending: false, mutate: updateMutateMock }),
}));

vi.mock("../../context/settings", () => ({
  useSettings: () => ({
    settings: {
      aiPersona: "tutor",
      aiConciseness: "medium",
      uiLanguage: "en",
      aiLanguage: "English",
      timezone: "UTC",
      notifyStudyReminders: true,
      notifyTimerAlerts: true,
      timerFocusWatchdog: true,
      examTerminationGrace: true,
    },
  }),
}));

vi.mock("../../context/toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock("./NotesAiSidebar", () => ({
  NotesAiSidebar: () => <aside aria-label="Study assistant" />,
}));

vi.mock("../../components/RichTextEditor", async () => {
  const React = await import("react");
  return {
    RichTextEditor: ({ ref }: { ref?: Ref<unknown>; initialHtml: string }) => {
      React.useImperativeHandle(ref, () => ({
        getPlainText: () => editorMock.plain,
        appendText: vi.fn(),
        getHtml: () => editorMock.html,
        setHtml: (html: string) => {
          editorMock.html = html;
          editorMock.plain = html.replace(/<[^>]*>/g, "");
          editorMock.setHtml(html);
        },
        getSelection: () => ({ index: 0, length: 25 }),
        getSelectedText: () => "Original selected passage",
        getSelectedHtml: () => "<p>Original selected passage</p>",
        getSelectionRect: () => ({
          top: 180,
          right: 360,
          bottom: 204,
          left: 160,
          width: 200,
          height: 24,
        }),
        replaceRange: (index: number, length: number, html: string) => {
          editorMock.replaceRange(index, length, html);
          editorMock.html =
            html || "<p>Original selected passage with more notes</p>";
          editorMock.plain = html
            ? `${html.replace(/<[^>]*>/g, "")} with more notes\n`
            : "Original selected passage with more notes\n";
        },
        insertAfterRange: (index: number, length: number, html: string) => {
          editorMock.insertAfterRange(index, length, html);
          editorMock.html += html;
          editorMock.plain += "AI explanation\n";
        },
        onSelectionChange: (
          callback: (range: { index: number; length: number } | null) => void,
        ) => {
          editorMock.selectionCallback = callback;
        },
      }));
      return (
        <button
          type="button"
          onClick={() =>
            editorMock.selectionCallback?.({ index: 0, length: 25 })
          }
        >
          Simulate text selection
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
  html_content: "<p>Original selected passage with more notes</p>",
  created_at: "2026-08-22T00:00:00.000Z",
};

function renderPane() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotesEditorPane
          materialId="material-1"
          materialTitle="Cell division"
          folderId={null}
          note={note}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function selectPassage() {
  fireEvent.click(
    screen.getByRole("button", { name: "Simulate text selection" }),
  );
  return screen.findByRole("toolbar", {
    name: "AI actions for selected text",
  });
}

describe("NotesEditorPane inline AI", () => {
  beforeEach(() => {
    editorMock.html = "<p>Original selected passage with more notes</p>";
    editorMock.plain = "Original selected passage with more notes\n";
    editorMock.selectionCallback = null;
    editorMock.replaceRange.mockReset();
    editorMock.insertAfterRange.mockReset();
    editorMock.setHtml.mockReset();
    runInlineActionMock.mockReset();
    createCardFromSnippetMock.mockReset();
    showToastMock.mockReset();
    updateMutateMock.mockReset();
  });

  it("stages an inline replacement, accepts it, and exposes inline undo", async () => {
    runInlineActionMock.mockResolvedValue({
      action: "improve",
      originalText: "Original selected passage",
      newText: "A clearer replacement",
    });
    renderPane();
    await selectPassage();

    fireEvent.click(
      screen.getByRole("button", { name: "Improve selected text" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Review AI edit" }),
    ).toBeInTheDocument();
    expect(editorMock.replaceRange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(editorMock.replaceRange).toHaveBeenCalledWith(
      0,
      25,
      expect.stringContaining("A clearer replacement"),
    );

    const undo = screen.getByRole("button", { name: "Undo Last AI Edit" });
    fireEvent.click(undo);
    expect(editorMock.setHtml).toHaveBeenCalledWith(
      "<p>Original selected passage with more notes</p>",
    );
    expect(
      screen.queryByRole("button", { name: "Undo Last AI Edit" }),
    ).not.toBeInTheDocument();
  });

  it("inserts Explain below the range and allows removing it", async () => {
    runInlineActionMock.mockResolvedValue({
      action: "explain",
      originalText: "Original selected passage",
      newText: "This passage describes the key mechanism.",
    });
    renderPane();
    await selectPassage();
    fireEvent.click(
      screen.getByRole("button", { name: "Explain selected text" }),
    );

    expect(
      await screen.findByRole("button", { name: "Remove AI explanation" }),
    ).toBeInTheDocument();
    expect(editorMock.insertAfterRange).toHaveBeenCalledWith(
      0,
      25,
      expect.stringContaining("AI explanation"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Remove AI explanation" }),
    );
    expect(editorMock.replaceRange).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove AI explanation" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("routes Ask AI instructions through the standard diff preview", async () => {
    runInlineActionMock.mockResolvedValue({
      action: "custom",
      originalText: "Original selected passage",
      newText: "Pasaje seleccionado original",
    });
    renderPane();
    await selectPassage();
    fireEvent.click(
      screen.getByRole("button", { name: "Ask AI about selected text" }),
    );
    fireEvent.change(screen.getByLabelText("Custom AI instruction"), {
      target: { value: "Translate to Spanish" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Run custom AI instruction" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Review AI edit" }),
    ).toBeInTheDocument();
    expect(runInlineActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "custom",
        customInstruction: "Translate to Spanish",
        selectedText: "Original selected passage",
      }),
    );
  });

  it("captures selected snippet and material metadata to create a flashcard", async () => {
    createCardFromSnippetMock.mockResolvedValue({
      deck: { id: "d-1", title: "Cell division Flashcards" },
      cards: [
        {
          id: "c-1",
          front: "What is mitosis?",
          back: "Cell division producing 2 daughter cells.",
        },
      ],
    });
    renderPane();
    await selectPassage();

    const makeCardBtn = screen.getByRole("button", {
      name: "Make Flashcard selected text",
    });
    fireEvent.click(makeCardBtn);

    await waitFor(() => {
      expect(createCardFromSnippetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedText: "Original selected passage",
          materialId: "material-1",
          materialTitle: "Cell division",
          folderId: null,
        }),
      );
    });

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        'Created flashcard in "Cell division Flashcards"!',
      );
    });

    // Toolbar should be dismissed
    expect(
      screen.queryByRole("toolbar", { name: "AI actions for selected text" }),
    ).not.toBeInTheDocument();
  });
});
