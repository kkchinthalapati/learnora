import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeSession, renderWithAuth } from "../../test/auth";
import { SettingsView } from "./SettingsView";

function renderSettings(signOut = vi.fn(), path = "/settings") {
  return renderWithAuth(
    <SettingsView />,
    {
      session: fakeSession({ user_metadata: { full_name: "Ada Lovelace" } }),
      signOut,
    },
    { withRouter: true, initialEntries: [path] },
  );
}

describe("SettingsView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /* "Turn on AI in Settings" links straight to the right tab. */
  it("opens the tab named in ?tab=", () => {
    renderSettings(vi.fn(), "/settings?tab=privacy");
    expect(screen.getByRole("tab", { name: /Privacy/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  /* Links from before the six-section Settings still land somewhere real. */
  it.each([
    ["security", "You"],
    ["danger", "Privacy and data"],
    ["subscription", "Plan and usage"],
  ])("maps the old ?tab=%s to %s", (old, label) => {
    renderSettings(vi.fn(), `/settings?tab=${old}`);
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName(label);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes every tab as a tablist with one selected", () => {
    renderSettings();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "You",
      "Look and reading",
      "Study",
      "Reminders",
      "Privacy and data",
      "Plan and usage",
    ]);
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName(
      "You",
    );
  });

  it("describes each section in the desktop index", () => {
    renderSettings();

    expect(screen.getByText("Profile, password and sign-in")).toBeInTheDocument();
    expect(screen.getByText("Tutor, language and calendar")).toBeInTheDocument();
    expect(screen.getByText("AI consent, exports and your account")).toBeInTheDocument();
  });

  it("points each tab at the panel it controls", () => {
    renderSettings();
    const tab = screen.getByRole("tab", { name: "You" });
    const panel = screen.getByRole("tabpanel");
    expect(tab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
  });

  it("switches the rendered panel on click", async () => {
    const user = userEvent.setup();
    renderSettings();
    /* "You" holds the profile and, since the six-section Settings, the
       password too. */
    expect(
      screen.getByRole("heading", { name: "Profile" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Change Password" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Look and reading" }));

    expect(screen.queryByRole("heading", { name: "Profile" })).toBeNull();
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName(
      "Look and reading",
    );
  });

  it("keeps only the selected tab in the tab order", async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(screen.getByRole("tab", { name: "You" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("tab", { name: "Look and reading" })).toHaveAttribute(
      "tabindex",
      "-1",
    );

    await user.click(screen.getByRole("tab", { name: "Look and reading" }));

    expect(screen.getByRole("tab", { name: "You" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("moves between tabs with the arrow keys and wraps at both ends", async () => {
    const user = userEvent.setup();
    renderSettings();
    const account = screen.getByRole("tab", { name: "You" });
    account.focus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "Look and reading" })).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("tab", { name: "You" })).toHaveFocus();

    // Wrapping backwards off the first tab lands on the last.
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("tab", { name: "Plan and usage" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "You" })).toHaveFocus();
  });

  it("jumps to the ends with Home and End", async () => {
    const user = userEvent.setup();
    renderSettings();
    screen.getByRole("tab", { name: "You" }).focus();

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Plan and usage" })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "You" })).toHaveFocus();
  });

  it("discards a tab's in-progress edit when you leave and come back", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const input = screen.getByRole("textbox", { name: "Display Name" });
    await user.clear(input);
    await user.type(input, "Half typed");

    await user.click(screen.getByRole("tab", { name: "Look and reading" }));
    await user.click(screen.getByRole("tab", { name: "You" }));

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
