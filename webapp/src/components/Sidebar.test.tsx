import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Sidebar } from "./Sidebar";
import { CreateModalContext, type CreateModalApi } from "../context/createModal";
import { fakeSession, renderWithAuth } from "../test/auth";
import * as useFlashcardsModule from "../hooks/useFlashcards";
import * as useFriendsModule from "../hooks/useFriends";

describe("Sidebar", () => {
  const mockOpenCreateModal = vi.fn();
  const mockOnNavigate = vi.fn();
  const mockOnToggleCollapse = vi.fn();

  const fakeCreateModalContext: CreateModalApi = {
    openCreateModal: mockOpenCreateModal,
  };

  function renderSidebar({
    collapsed = false,
    initialPath = "/",
    dueCount = 0,
    incomingRequests = 0,
  }: {
    collapsed?: boolean;
    initialPath?: string;
    dueCount?: number;
    incomingRequests?: number;
  } = {}) {
    vi.spyOn(useFlashcardsModule, "useFlashcardsDueCount").mockReturnValue({
      data: dueCount,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useFlashcardsModule.useFlashcardsDueCount>);

    vi.spyOn(useFriendsModule, "useIncomingFriendRequestCount").mockReturnValue({
      data: incomingRequests,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useFriendsModule.useIncomingFriendRequestCount>);

    return renderWithAuth(
      <CreateModalContext.Provider value={fakeCreateModalContext}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Sidebar
            collapsed={collapsed}
            onNavigate={mockOnNavigate}
            onToggleCollapse={mockOnToggleCollapse}
          />
        </MemoryRouter>
      </CreateModalContext.Provider>,
      { session: fakeSession() },
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders navigation links and brand name", () => {
    renderSidebar();

    expect(screen.getByRole("heading", { level: 2, name: "Learnora" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dashboard/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /Create/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Library/i })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: /Timer/i })).toHaveAttribute("href", "/timer");
    expect(screen.getByRole("link", { name: /Task Manager/i })).toHaveAttribute("href", "/tasks");
    expect(screen.getByRole("link", { name: /This week's plan/i })).toHaveAttribute("href", "/plan");
    expect(screen.getByRole("link", { name: /Exams/i })).toHaveAttribute("href", "/exams");
    expect(screen.getByRole("link", { name: /Friends/i })).toHaveAttribute("href", "/friends");
    expect(screen.getByRole("link", { name: /Feynman Apprentice/i })).toHaveAttribute("href", "/feynman");
    expect(screen.getByRole("link", { name: /Cognitive Debugger/i })).toHaveAttribute("href", "/debugger");
    expect(screen.getByRole("link", { name: /Exam Pre-Mortem/i })).toHaveAttribute("href", "/premortem");
    expect(screen.getByRole("link", { name: /Settings/i })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: /Terms of Service/i })).toHaveAttribute("href", "/terms");
  });

  it("opens create modal and notifies onNavigate when Create button is clicked", async () => {
    renderSidebar();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Create/i }));

    expect(mockOpenCreateModal).toHaveBeenCalledTimes(1);
    expect(mockOnNavigate).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleCollapse when collapse button is clicked", async () => {
    renderSidebar({ collapsed: false });
    const user = userEvent.setup();

    const toggleBtn = screen.getByRole("button", { name: "Collapse sidebar" });
    await user.click(toggleBtn);

    expect(mockOnToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("renders Expand sidebar button label when collapsed is true", () => {
    renderSidebar({ collapsed: true });

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });

  it("shows flashcards due badge on Library link when dueCount > 0", () => {
    renderSidebar({ dueCount: 5 });

    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows incoming friend requests badge on Friends link when incomingRequests > 0", () => {
    renderSidebar({ incomingRequests: 3 });

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("notifies onNavigate when any navigation link is clicked", async () => {
    renderSidebar();
    const user = userEvent.setup();

    await user.click(screen.getByRole("link", { name: /Task Manager/i }));

    expect(mockOnNavigate).toHaveBeenCalledTimes(1);
  });
});
