import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopBar } from "./TopBar";
import { CommandPaletteContext, type CommandPaletteApi } from "../context/commandPalette";
import { fakeSession, renderWithAuth } from "../test/auth";
import { mockAuthSession } from "../test/mockSession";

/* The top bar's tools (webapp/DESIGN.md 0.2). Navigation, the profile menu
 * and the due count are covered in AppShell.test.tsx. */
describe("TopBar", () => {
  const open = vi.fn();
  const palette: CommandPaletteApi = {
    isOpen: false,
    open,
    close: vi.fn(),
    toggle: vi.fn(),
    openWithPrefix: vi.fn(),
    initialQuery: "",
  };

  function renderBar(path = "/") {
    return renderWithAuth(
      <CommandPaletteContext.Provider value={palette}>
        <TopBar />
      </CommandPaletteContext.Provider>,
      { session: fakeSession() },
      { withRouter: true, initialEntries: [path] },
    );
  }

  beforeEach(() => {
    mockAuthSession("user-1");
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("opens search from its button, with the platform's shortcut in the hint", async () => {
    renderBar();
    const search = screen.getByRole("button", { name: "Search" });
    /* jsdom's platform is not a Mac, so the hint is the Windows one. */
    expect(search).toHaveAttribute("title", "Search (Ctrl K)");
    await userEvent.setup().click(search);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("opens contextual help with install and feedback guidance", async () => {
    renderBar("/library");
    await userEvent.click(screen.getByRole("button", { name: "Help and support" }));

    expect(screen.getByRole("heading", { level: 2, name: "Library workspace" })).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send feedback" })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:support@learnora.app"),
    );
  });

  it.each(["/study", "/solver", "/feynman", "/viva", "/exam-detective"])(
    "shows Study tools help on %s",
    async (path) => {
      renderBar(path);
      await userEvent.click(screen.getByRole("button", { name: "Help and support" }));
      expect(screen.getByRole("heading", { level: 2, name: "Study tools" })).toBeInTheDocument();
    },
  );

  it("offers a bottom bar with the same destinations for phones", () => {
    renderBar();
    const phone = screen.getByRole("navigation", { name: "Main navigation, phone" });
    expect([...phone.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Home", "Subjects", "Progress"]);
  });
});
