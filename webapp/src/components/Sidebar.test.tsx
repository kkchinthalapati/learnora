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
  } = {}) {
    vi.spyOn(useFlashcardsModule, "useFlashcardsDueCount").mockReturnValue({
      data: dueCount,
      isPending: false,
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

  it("uses route families for primary active state", () => {
    renderSidebar({ initialPath: "/tasks" });
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows due reviews on Library", () => {
    renderSidebar({ dueCount: 5 });
    expect(screen.getByText("5")).toBeInTheDocument();
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
