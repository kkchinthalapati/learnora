import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { SettingsView } from "./SettingsView";

function renderSettings(signOut = vi.fn()) {
  return renderWithAuth(<SettingsView />, {
    session: fakeSession({ user_metadata: { full_name: "Ada Lovelace" } }),
    signOut,
  });
}

describe("SettingsView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes every tab as a tablist with one selected", () => {
    renderSettings();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Account",
      "Appearance",
      "Security",
      "Preferences",
      "Plan",
      "Notifications",
      "Danger Zone",
    ]);
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName(
      "Account",
    );
  });

  it("describes each section in the desktop index", () => {
    renderSettings();

    expect(screen.getByText("Profile and exports")).toBeInTheDocument();
    expect(screen.getByText("AI, language, and calendar")).toBeInTheDocument();
    expect(screen.getByText("Data and account removal")).toBeInTheDocument();
  });

  it("points each tab at the panel it controls", () => {
    renderSettings();
    const tab = screen.getByRole("tab", { name: "Account" });
    const panel = screen.getByRole("tabpanel");
    expect(tab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
  });

  it("switches the rendered panel on click", async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(
      screen.getByRole("heading", { name: "Profile" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Security" }));

    expect(
      screen.getByRole("heading", { name: "Change Password" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Profile" })).toBeNull();
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName(
      "Security",
    );
  });

  it("keeps only the selected tab in the tab order", async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("tab", { name: "Security" })).toHaveAttribute(
      "tabindex",
      "-1",
    );

    await user.click(screen.getByRole("tab", { name: "Security" }));

    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("moves between tabs with the arrow keys and wraps at both ends", async () => {
    const user = userEvent.setup();
    renderSettings();
    const account = screen.getByRole("tab", { name: "Account" });
    account.focus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "Appearance" })).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("tab", { name: "Account" })).toHaveFocus();

    // Wrapping backwards off the first tab lands on the last.
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("tab", { name: "Danger Zone" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Account" })).toHaveFocus();
  });

  it("jumps to the ends with Home and End", async () => {
    const user = userEvent.setup();
    renderSettings();
    screen.getByRole("tab", { name: "Account" }).focus();

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Danger Zone" })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Account" })).toHaveFocus();
  });

  it("discards a tab's in-progress edit when you leave and come back", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const input = screen.getByRole("textbox", { name: "Display Name" });
    await user.clear(input);
    await user.type(input, "Half typed");

    await user.click(screen.getByRole("tab", { name: "Security" }));
    await user.click(screen.getByRole("tab", { name: "Account" }));

    // Back to the collapsed row, not the abandoned draft.
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Half typed")).toBeNull();
  });

  it("signs out from the sidebar button", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn().mockResolvedValue(undefined);
    renderSettings(signOut);

    await user.click(screen.getByRole("button", { name: "Log Out" }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("does not render controls belonging to unselected tabs", () => {
    renderSettings();
    // The vanilla kept all six panels mounted behind display:none, so the
    // Danger Zone's delete button sat in the tab order from page load.
    expect(screen.queryByRole("button", { name: /Delete Account/ })).toBeNull();
  });
});
