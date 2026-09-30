import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "./Header";
import {
  CommandPaletteContext,
  type CommandPaletteApi,
} from "../context/commandPalette";
import { fakeSession, renderWithAuth } from "../test/auth";
import { mockAuthSession } from "../test/mockSession";

describe("Header", () => {
  const mockOpenCommandPalette = vi.fn();
  const mockCloseCommandPalette = vi.fn();
  const mockToggleCommandPalette = vi.fn();
  const mockOpenWithPrefix = vi.fn();

  const mockCommandPaletteContext: CommandPaletteApi = {
    isOpen: false,
    open: mockOpenCommandPalette,
    close: mockCloseCommandPalette,
    toggle: mockToggleCommandPalette,
    openWithPrefix: mockOpenWithPrefix,
    initialQuery: "",
  };

  const mockToggleMenu = vi.fn();

  function renderHeader({
    path = "/",
    fullName = "Ada Lovelace",
  }: {
    path?: string;
    fullName?: string;
  } = {}) {
    return renderWithAuth(
      <CommandPaletteContext.Provider value={mockCommandPaletteContext}>
        <Header onToggleMenu={mockToggleMenu} />
      </CommandPaletteContext.Provider>,
      { session: fakeSession({ user_metadata: { full_name: fullName } }) },
      { withRouter: true, initialEntries: [path] },
    );
  }

  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders user greeting, live clock and actions on the root route", () => {
    renderHeader({ path: "/", fullName: "Marie Curie" });

    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText(/Marie/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
    /* Theme moved to Settings → Appearance and Ask to the sidebar (⌘J). */
    expect(screen.queryByRole("button", { name: /toggle theme/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /ask ai/i })).toBeNull();
    /* Log out is in the sidebar Account group, not one tap away here. */
    expect(screen.queryByRole("button", { name: /log out/i })).toBeNull();
  });

  it("renders page title heading on non-hero routes like /tasks", () => {
    renderHeader({ path: "/tasks" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Tasks",
    );
  });

  it("renders the Cmd+K search trigger button and opens Command Palette on click", async () => {
    renderHeader();

    const searchButton = screen.getByRole("button", {
      name: /search and command palette/i,
    });
    expect(searchButton).toBeInTheDocument();
    /* jsdom's platform is not a Mac, so the hint is the Windows one. */
    expect(screen.getByText("Ctrl K")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(searchButton);

    expect(mockOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it("opens contextual help with mobile install and feedback guidance", async () => {
    renderHeader({ path: "/library" });

    await userEvent.click(
      screen.getByRole("button", { name: "Help and support" }),
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Library workspace" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send feedback" })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:support@learnora.app"),
    );
  });

  it.each(["/study", "/solver", "/feynman", "/viva", "/exam-detective"])(
    "shows Study tools help on canonical study route %s",
    async (path) => {
      renderHeader({ path });

      await userEvent.click(
        screen.getByRole("button", { name: "Help and support" }),
      );

      expect(
        screen.getByRole("heading", { level: 2, name: "Study tools" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Pick the exercise that matches your problem/i),
      ).toBeInTheDocument();
    },
  );

  it("toggles sidebar menu when hamburger button is clicked", async () => {
    renderHeader();

    const menuToggle = screen.getByRole("button", {
      name: /toggle sidebar menu/i,
    });
    const user = userEvent.setup();
    await user.click(menuToggle);

    expect(mockToggleMenu).toHaveBeenCalledTimes(1);
  });
});
