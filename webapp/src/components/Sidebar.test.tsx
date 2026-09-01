import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Sidebar } from "./Sidebar";
import {
  CreateModalContext,
  type CreateModalApi,
} from "../context/createModal";
import { fakeSession, renderWithAuth } from "../test/auth";
import * as useFlashcardsModule from "../hooks/useFlashcards";
import * as useFriendsModule from "../hooks/useFriends";

describe("Sidebar", () => {
  const openCreateModal = vi.fn();
  const onNavigate = vi.fn();
  const onToggleRail = vi.fn();
  const createModalContext: CreateModalApi = { openCreateModal };

  function renderSidebar({
    railCollapsed = false,
    drawerOpen = false,
    initialPath = "/",
    dueCount = 0,
    incomingRequests = 0,
    countsPending = false,
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
      <CreateModalContext.Provider value={createModalContext}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Sidebar
            railCollapsed={railCollapsed}
            drawerOpen={drawerOpen}
            onNavigate={onNavigate}
            onToggleRail={onToggleRail}
          />
        </MemoryRouter>
      </CreateModalContext.Provider>,
      { session: fakeSession() },
    );
  }

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders the five primary destinations", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: "Learnora" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute(
      "href",
      "/library",
    );
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute(
      "href",
      "/plan",
    );
    expect(screen.getByRole("link", { name: "Focus" })).toHaveAttribute(
      "href",
      "/timer",
    );
    expect(screen.getByRole("link", { name: "Progress" })).toHaveAttribute(
      "href",
      "/analytics",
    );
  });

  it("opens Create and closes mobile navigation", async () => {
    renderSidebar();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(openCreateModal).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("toggles the desktop rail", async () => {
    renderSidebar();
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    );
    expect(onToggleRail).toHaveBeenCalledTimes(1);
  });

  /* Tasks and Exams share Plan's "plan" destination so that sub-routes of the
     family keep a parent lit. They also have rail entries of their own now, so
     the item's own path has to win over the shared destination — matching on
     destination alone marked Plan, Tasks and Exams aria-current="page" all at
     once on every one of those three routes. */
  it("lights the item that owns the route, not its whole family", () => {
    renderSidebar({ initialPath: "/tasks" });
    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Plan" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it.each(["/", "/plan", "/tasks", "/exams", "/library", "/analytics"])(
    "marks exactly one sidebar link as the current page on %s",
    (initialPath) => {
      renderSidebar({ initialPath });
      const current = screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page");
      expect(current).toHaveLength(1);
    },
  );

  it("shows due reviews on Library", () => {
    renderSidebar({ dueCount: 5 });
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("holds the badge's slot while the due count is still loading", () => {
    /* `data: dueCount = 0` reads as "nothing due" while the request is in
       flight, so the badge was absent on first paint and then appeared. The
       placeholder keeps the row the same shape either way. */
    const { container } = renderSidebar({ dueCount: 5, countsPending: true });

    expect(screen.queryByText("5")).not.toBeInTheDocument();
    const placeholder = container.querySelector('[class*="badgePlaceholder"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
  });

  it("expands secondary groups and shows their routes", async () => {
    renderSidebar({ incomingRequests: 3 });
    const user = userEvent.setup();

    expect(
      screen.getByRole("group", { name: "Workspace" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Study Lab" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Community" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Account" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Study Lab" }));
    expect(
      screen.getByRole("link", { name: "Find My Mistake" }),
    ).toHaveAttribute("href", "/debugger");

    await user.click(screen.getByRole("button", { name: "Expand Community" }));
    expect(screen.getByRole("link", { name: "Friends" })).toHaveAttribute(
      "href",
      "/friends",
    );
    expect(screen.getByText("3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Account" }));
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});
