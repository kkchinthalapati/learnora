import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Sidebar } from "./Sidebar";
import { ChatContext, type ChatApi } from "../context/chat";
import {
  CommandPaletteContext,
  type CommandPaletteApi,
} from "../context/commandPalette";
import { clearStudySnapshot, recordStudySession } from "../lib/continuity";
import { fakeSession, renderWithAuth } from "../test/auth";
import * as useFlashcardsModule from "../hooks/useFlashcards";
import * as useFriendsModule from "../hooks/useFriends";

describe("Sidebar", () => {
  const onNavigate = vi.fn();
  const onToggleRail = vi.fn();

  function renderSidebar({
    railCollapsed = false,
    drawerOpen = false,
    initialPath = "/",
    dueCount = 0,
    incomingRequests = 0,
    countsPending = false,
    chat = {},
    palette = {},
  }: {
    railCollapsed?: boolean;
    drawerOpen?: boolean;
    initialPath?: string;
    dueCount?: number;
    incomingRequests?: number;
    countsPending?: boolean;
    chat?: Partial<ChatApi>;
    palette?: Partial<CommandPaletteApi>;
  } = {}) {
    vi.spyOn(useFlashcardsModule, "useFlashcardsDueCount").mockReturnValue({
      data: countsPending ? undefined : dueCount,
      isPending: countsPending,
      isError: false,
      error: null,
    } as unknown as ReturnType<
      typeof useFlashcardsModule.useFlashcardsDueCount
    >);
    vi.spyOn(useFriendsModule, "useIncomingFriendRequestCount").mockReturnValue(
      {
        data: incomingRequests,
        isPending: false,
        isError: false,
        error: null,
      } as unknown as ReturnType<
        typeof useFriendsModule.useIncomingFriendRequestCount
      >,
    );

    return renderWithAuth(
      <CommandPaletteContext.Provider
        value={{ open: vi.fn(), ...palette } as CommandPaletteApi}
      >
        <ChatContext.Provider value={{ open: vi.fn(), ...chat } as ChatApi}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Sidebar
              railCollapsed={railCollapsed}
              drawerOpen={drawerOpen}
              onNavigate={onNavigate}
              onToggleRail={onToggleRail}
            />
          </MemoryRouter>
        </ChatContext.Provider>
      </CommandPaletteContext.Provider>,
      { session: fakeSession() },
    );
  }

  beforeEach(() => {
    localStorage.clear();
    clearStudySnapshot();
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders the five destinations", () => {
    renderSidebar();
    const expected: Array<[string, string]> = [
      ["Today", "/"],
      ["Library", "/library"],
      ["Study", "/study"],
      ["Plan", "/plan"],
      ["Progress", "/analytics"],
    ];
    for (const [name, href] of expected) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(screen.getByRole("link", { name: "Learnora" })).toHaveAttribute(
      "href",
      "/",
    );
    /* The retired destinations are not rail rows any more. */
    for (const gone of ["Focus timer", "Study tools", "Dashboard"]) {
      expect(screen.queryByRole("link", { name: gone })).toBeNull();
    }
  });

  it("has no Create button — Create lives in Library and the palette", () => {
    renderSidebar();
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  });

  it("toggles the desktop rail", async () => {
    renderSidebar();
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    );
    expect(onToggleRail).toHaveBeenCalledTimes(1);
  });

  it("opens the command palette from the search trigger", async () => {
    const open = vi.fn();
    renderSidebar({ palette: { open } });
    await userEvent.click(
      screen.getByRole("button", { name: "Search or jump to…" }),
    );
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("opens the tutor drawer from Ask the tutor", async () => {
    const open = vi.fn();
    renderSidebar({ chat: { open } });
    await userEvent.click(screen.getByRole("button", { name: "Ask the tutor" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  /* Tasks, Exams, Availability and the timer hang off Plan rather than taking
     permanent rail slots; the rail reveals them while Plan is open. */
  it("reveals Plan's pages while Plan is the open section", () => {
    renderSidebar({ initialPath: "/timer" });

    for (const label of ["Availability", "Tasks", "Exams", "Focus timer"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Focus timer" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Plan" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.queryByRole("link", { name: "Trajectory" })).toBeNull();
  });

  it.each([
    "/",
    "/plan",
    "/tasks",
    "/exams",
    "/timer",
    "/library",
    "/quiz/q-1",
    "/study",
    "/study/s-1",
    "/analytics",
    "/trajectory",
    "/room",
    "/friends",
    "/settings",
  ])("marks exactly one sidebar link as the current page on %s", (initialPath) => {
    renderSidebar({ initialPath });
    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
  });

  it("shows due reviews on Library", () => {
    renderSidebar({ dueCount: 5 });
    expect(screen.getByRole("link", { name: "Library" })).toHaveTextContent("5");
  });

  it("holds the badge's slot while the due count is still loading", () => {
    const { container } = renderSidebar({ dueCount: 5, countsPending: true });
    expect(screen.queryByText("5")).not.toBeInTheDocument();
    const placeholder = container.querySelector('[class*="badgePlaceholder"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
  });

  it("puts community in the footer, with the friend-request count", () => {
    renderSidebar({ incomingRequests: 3 });
    const link = screen.getByRole("link", { name: "Study room & friends" });
    expect(link).toHaveAttribute("href", "/room");
    expect(link).toHaveTextContent("3");
  });

  it("links the avatar row to Settings and keeps Terms and Log out in its menu", async () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
    const menu = screen.getByRole("button", { name: "Account menu" });
    await userEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /Terms of Service/ })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  it("shows a paused session and resumes it", () => {
    recordStudySession({
      id: "s-9",
      objective: "Electron transport chain",
      mode: "explain",
      stepIndex: 2,
      totalSteps: 5,
      minutesLeft: 12,
      status: "paused",
    });
    renderSidebar();
    const card = screen.getByRole("link", { name: /Session paused/ });
    expect(card).toHaveTextContent("Electron transport chain");
    expect(card).toHaveTextContent("Step 3 of 5 · 12 min left");
    expect(card).toHaveAttribute("href", "/study/s-9?mode=explain");
  });

  it("shows no paused card while nothing is paused", () => {
    renderSidebar();
    expect(screen.queryByRole("link", { name: /Session paused/ })).toBeNull();
  });
});
