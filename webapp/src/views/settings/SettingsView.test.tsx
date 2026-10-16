import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { resolveSettingsTab, SettingsView } from "./SettingsView";

/* Settings after the 2026-10 overhaul (webapp/DESIGN.md 0.3-0.4): a page
 * header, the shared tab strip and five sections. */

function renderSettings(path = "/settings") {
  return renderWithAuth(
    <SettingsView />,
    { session: fakeSession({ user_metadata: { full_name: "Ada Lovelace" } }) },
    { withRouter: true, initialEntries: [path] },
  );
}

describe("SettingsView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is one page titled Settings with five sections", () => {
    renderSettings();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Account",
      "Appearance",
      "Study",
      "Privacy and AI",
      "Plan and billing",
    ]);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Account");
  });

  /* "Turn on AI in Settings" links straight to the right section. */
  it("opens the section named in ?tab=", () => {
    renderSettings("/settings?tab=privacy");
    expect(screen.getByRole("tab", { name: "Privacy and AI" })).toHaveAttribute("aria-selected", "true");
  });

  it("sends the old section names to the section that holds them now", () => {
    expect(resolveSettingsTab("security")).toBe("account");
    expect(resolveSettingsTab("danger")).toBe("account");
    expect(resolveSettingsTab("preferences")).toBe("study");
    expect(resolveSettingsTab("notifications")).toBe("study");
    expect(resolveSettingsTab("subscription")).toBe("billing");
    expect(resolveSettingsTab("nonsense")).toBe("account");
    expect(resolveSettingsTab(null)).toBe("account");
  });

  it("keeps security and deleting your data in Account", () => {
    renderSettings();
    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Danger zone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update password" })).toBeInTheDocument();
  });

  it("moves between sections with the arrow keys, Home and End", async () => {
    const user = userEvent.setup();
    renderSettings();
    screen.getByRole("tab", { name: "Account" }).focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Appearance" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Plan and billing" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Plan and billing" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps only the selected section in the tab order", () => {
    renderSettings();
    const tabbable = screen.getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toHaveTextContent("Account");
  });

  it("switches the rendered section on click, and renders nothing from the others", async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(screen.queryByRole("heading", { name: "Browser notifications" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Study" }));
    expect(screen.getByRole("heading", { name: "Browser notifications" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Danger zone" })).toBeNull();
  });

  it("discards a section's in-progress edit when you leave and come back", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const input = screen.getByRole("textbox", { name: "Display name" });
    await user.clear(input);
    await user.type(input, "Half typed");

    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    await user.click(screen.getByRole("tab", { name: "Account" }));

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Half typed")).toBeNull();
  });

  /* Sign out is in the profile menu, once (TopBar). */
  it("has no sign-out button of its own", () => {
    renderSettings();
    expect(screen.queryByRole("button", { name: /log out|sign out$/i })).toBeNull();
  });
});
