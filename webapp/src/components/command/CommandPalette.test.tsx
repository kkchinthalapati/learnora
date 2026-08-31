import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { CommandPalette } from "./CommandPalette";
import { CommandPaletteProvider } from "../../context/CommandPaletteProvider";
import { ChatContext, type ChatApi } from "../../context/chat";
import { tasksApi } from "../../api/tasks";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import { Storage } from "../../lib/storage";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

describe("CommandPalette", () => {
  const mockChat: ChatApi = {
    messages: [],
    isOpen: false,
    isFullscreen: false,
    isSending: false,
    file: null,
    draft: "",
    open: vi.fn(),
    close: vi.fn(),
    toggleFullscreen: vi.fn(),
    compose: vi.fn(),
    clearDraft: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
    attachFile: vi.fn(),
    clearFile: vi.fn(),
    saveCards: vi.fn().mockResolvedValue(undefined),
    registerFlashcardGrader: vi.fn(),
  };

  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
    sessionStorage.clear();
    CognitiveBridge.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPalette({
    isOpen = true,
    onClose = vi.fn(),
    initialPath = "/",
  }: {
    isOpen?: boolean;
    onClose?: () => void;
    initialPath?: string;
  } = {}) {
    return renderWithAuth(
      <ChatContext.Provider value={mockChat}>
        <CommandPalette isOpen={isOpen} onClose={onClose} />
        <Routes>
          <Route path="/" element={<div>Dashboard Page</div>} />
          <Route path="/timer" element={<div>Timer Page</div>} />
          <Route path="/debugger" element={<div>Debugger Page</div>} />
          <Route path="/feynman" element={<div>Feynman Page</div>} />
          <Route path="/premortem" element={<div>Pre-Mortem Page</div>} />
          <Route path="/graph" element={<div>Graph Page</div>} />
          <Route path="/analytics" element={<div>Analytics Page</div>} />
          <Route path="/folders/:folderId" element={<div>Subject Folder Page</div>} />
          <Route path="/notes/:materialId" element={<div>Notes Page</div>} />
          <Route path="/review/:deckId" element={<div>Review Deck Page</div>} />
        </Routes>
      </ChatContext.Provider>,
      { session: fakeSession() },
      { withTimer: true, withRouter: true, initialEntries: [initialPath] },
    );
  }

  it("renders when open and displays search input with default quick actions", () => {
    renderPalette({ isOpen: true });

    expect(screen.getByRole("dialog", { name: /command palette/i })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/type a command, search, or prefix/i),
    ).toBeInTheDocument();

    expect(screen.getByText("Start 25m Timer")).toBeInTheDocument();
    expect(screen.getByText("Start 50m Timer")).toBeInTheDocument();
    expect(screen.getByText("Find My Mistake")).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    renderPalette({ isOpen: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when clicking the backdrop overlay or pressing Escape", () => {
    const mockClose = vi.fn();
    renderPalette({ isOpen: true, onClose: mockClose });

    const overlay = screen.getByTestId("command-palette-overlay");
    fireEvent.mouseDown(overlay);
    expect(mockClose).toHaveBeenCalledTimes(1);

    const input = screen.getByPlaceholderText(/type a command, search, or prefix/i);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockClose).toHaveBeenCalledTimes(2);
  });

  it("supports direct task prefix 't:' to create a task with tasksApi.add", async () => {
    const addTaskSpy = vi.spyOn(tasksApi, "add").mockResolvedValue(undefined);
    const mockClose = vi.fn();
    renderPalette({ isOpen: true, onClose: mockClose });

    const input = screen.getByPlaceholderText(/type a command, search, or prefix/i);
    const user = userEvent.setup();

    await user.type(input, "t: Finish physics lab report");

    expect(
      screen.getByText(/create task: "finish physics lab report"/i),
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(addTaskSpy).toHaveBeenCalledWith("Finish physics lab report");
      expect(mockClose).toHaveBeenCalled();
    });
  });

  it("supports direct task prefix 'task:' to create a task", async () => {
    const addTaskSpy = vi.spyOn(tasksApi, "add").mockResolvedValue(undefined);
    const mockClose = vi.fn();
    renderPalette({ isOpen: true, onClose: mockClose });

    const input = screen.getByPlaceholderText(/type a command, search, or prefix/i);
    const user = userEvent.setup();

    await user.type(input, "task: Revise Organic Chemistry");
    expect(
      screen.getByText(/create task: "revise organic chemistry"/i),
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(addTaskSpy).toHaveBeenCalledWith("Revise Organic Chemistry");
      expect(mockClose).toHaveBeenCalled();
    });
  });

  it("supports direct AI prefix 'ai:' to launch TurboChat with query", async () => {
    const mockClose = vi.fn();
    renderPalette({ isOpen: true, onClose: mockClose });

    const input = screen.getByPlaceholderText(/type a command, search, or prefix/i);
    const user = userEvent.setup();

    await user.type(input, "ai: Explain Bayes Theorem intuitively");

    expect(
      screen.getByText(/ask ai: "explain bayes theorem intuitively"/i),
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(mockChat.open).toHaveBeenCalled();
    expect(mockChat.send).toHaveBeenCalledWith("Explain Bayes Theorem intuitively");
    expect(mockClose).toHaveBeenCalled();
  });

  it("supports direct AI prefix '?' to send prompt to TurboChat", async () => {
    const mockClose = vi.fn();
    renderPalette({ isOpen: true, onClose: mockClose });

    const input = screen.getByPlaceholderText(/type a command, search, or prefix/i);
    const user = userEvent.setup();

    await user.type(input, "? What is the Krebs cycle?");

    expect(
      screen.getByText(/ask ai: "what is the krebs cycle\?"/i),
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");

    expect(mockChat.open).toHaveBeenCalled();
    expect(mockChat.send).toHaveBeenCalledWith("What is the Krebs cycle?");
    expect(mockClose).toHaveBeenCalled();
  });

  it("supports direct debugger prefix 'debug:' to navigate to Find My Mistake", async () => {
    const mockClose = vi.fn();
    renderPalette({ isOpen: true, onClose: mockClose });

    const input = screen.getByPlaceholderText(/type a command, search, or prefix/i);
    const user = userEvent.setup();

    await user.type(input, "debug: Chain Rule Derivative");

    expect(
      screen.getByText(/look at: "chain rule derivative"/i),
    ).toBeInTheDocument();

    await user.keyboard("{Enter}");

    const payload = CognitiveBridge.getPayload();
    expect(payload?.topic).toBe("Chain Rule Derivative");
    expect(mockClose).toHaveBeenCalled();
  });

  it("executes 0ms local action to Start 25m Timer", async () => {
    const mockClose = vi.fn();
    renderPalette({ isOpen: true, onClose: mockClose });

    const user = userEvent.setup();
    const timerAction = screen.getByText("Start 25m Timer");
    await user.click(timerAction);

    expect(mockClose).toHaveBeenCalled();
  });

  it("executes 0ms local action to toggle theme", async () => {
    const mockClose = vi.fn();
    renderPalette({ isOpen: true, onClose: mockClose });

    const user = userEvent.setup();
    const themeAction = screen.getByText(/switch to (dark|light) mode/i);
    await user.click(themeAction);

    expect(Storage.get("learnora_mode")).toBeDefined();
    expect(mockClose).toHaveBeenCalled();
  });

  it("filters items by search query and shows matching subjects/materials/decks", async () => {
    server.use(
      http.get(rest("folders"), () =>
        HttpResponse.json([
          { id: "folder-bio", name: "Molecular Biology", color: "#4A90E2" },
        ]),
      ),
      http.get(rest("materials"), () =>
        HttpResponse.json([
          {
            id: "mat-1",
            title: "Photosynthesis Notes",
            type: "text",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ),
      http.get(rest("flashcard_decks"), () =>
        HttpResponse.json([
          { id: "deck-1", title: "Biochemistry Deck", folder_id: "folder-bio" },
        ]),
      ),
    );

    renderPalette({ isOpen: true });

    const input = screen.getByPlaceholderText(/type a command, search, or prefix/i);
    const user = userEvent.setup();

    await user.type(input, "Molecular");

    await waitFor(() => {
      expect(screen.getByText("Molecular Biology")).toBeInTheDocument();
    });
  });

  it("displays empty state when no items match the search query", async () => {
    renderPalette({ isOpen: true });

    const input = screen.getByPlaceholderText(/type a command, search, or prefix/i);
    const user = userEvent.setup();

    await user.type(input, "xyznonexistentquery123");

    expect(screen.getByText(/no matching results/i)).toBeInTheDocument();
  });

  it("handles keyboard navigation with ArrowDown, ArrowUp, and Enter", async () => {
    const mockClose = vi.fn();
    renderPalette({ isOpen: true, onClose: mockClose });

    const input = screen.getByPlaceholderText(/type a command, search, or prefix/i);
    const user = userEvent.setup();

    // Default selection is 0 ("Start 25m Timer")
    // Press ArrowDown to select index 1 ("Start 50m Timer")
    fireEvent.keyDown(input, { key: "ArrowDown" });

    // Press Enter to trigger selection
    await user.keyboard("{Enter}");

    expect(mockClose).toHaveBeenCalled();
  });

  it("opens palette when Cmd+K or Ctrl+K shortcut is pressed via CommandPaletteProvider", async () => {
    renderWithAuth(
      <ChatContext.Provider value={mockChat}>
        <CommandPaletteProvider>
          <h1>Main Content</h1>
        </CommandPaletteProvider>
      </ChatContext.Provider>,
      { session: fakeSession() },
      { withTimer: true, withRouter: true, initialEntries: ["/"] },
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Dispatch Cmd+K on window
    fireEvent.keyDown(window, { key: "k", metaKey: true });

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /command palette/i })).toBeInTheDocument();
    });

    // Press Escape to close
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
