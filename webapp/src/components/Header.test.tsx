import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "./Header";
import { CommandPaletteContext, type CommandPaletteApi } from "../context/commandPalette";
import { fakeSession, renderWithAuth } from "../test/auth";
import { mockAuthSession } from "../test/mockSession";
import { Storage } from "../lib/storage";

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

  it("renders page title, user greeting, live clock and actions", () => {
    renderHeader({ path: "/", fullName: "Marie Curie" });

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Marie/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("renders the Cmd+K search trigger button and opens Command Palette on click", async () => {
    renderHeader();

    const searchButton = screen.getByRole("button", { name: /search and command palette/i });
    expect(searchButton).toBeInTheDocument();
    expect(screen.getByText("⌘K")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(searchButton);

    expect(mockOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it("toggles sidebar menu when hamburger button is clicked", async () => {
    renderHeader();

    const menuToggle = screen.getByRole("button", { name: /toggle sidebar menu/i });
    const user = userEvent.setup();
    await user.click(menuToggle);

    expect(mockToggleMenu).toHaveBeenCalledTimes(1);
  });

  it("toggles appearance theme when theme toggle button is clicked", async () => {
    renderHeader();

    const themeToggle = screen.getByRole("button", { name: /toggle theme/i });
    const user = userEvent.setup();
    await user.click(themeToggle);

    expect(Storage.get("learnora_mode")).toBeDefined();
  });
});
