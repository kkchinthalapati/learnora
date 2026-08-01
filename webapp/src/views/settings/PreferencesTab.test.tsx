import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadSettings,
} from "../../lib/settings";
import { Storage } from "../../lib/storage";
import { PreferencesTab } from "./PreferencesTab";
import { NotificationsTab } from "./NotificationsTab";

describe("PreferencesTab", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the stored values on mount", () => {
    Storage.set(SETTINGS_KEY, {
      ...DEFAULT_SETTINGS,
      aiPersona: "coach",
      aiLanguage: "Hindi",
    });
    renderWithProviders(<PreferencesTab />);

    expect(screen.getByLabelText("AI Persona")).toHaveValue("coach");
    expect(screen.getByLabelText("AI Response Language")).toHaveValue("Hindi");
  });

  it("does not persist until Save Preferences is pressed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PreferencesTab />);

    await user.selectOptions(screen.getByLabelText("AI Persona"), "buddy");
    expect(loadSettings().aiPersona).toBe("tutor");

    await user.click(screen.getByRole("button", { name: "Save Preferences" }));
    expect(loadSettings().aiPersona).toBe("buddy");
  });

  it("saves all four selects together", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PreferencesTab />);

    await user.selectOptions(screen.getByLabelText("AI Persona"), "coach");
    await user.selectOptions(screen.getByLabelText("Response Length"), "short");
    await user.selectOptions(screen.getByLabelText("UI Language"), "fr");
    await user.selectOptions(
      screen.getByLabelText("AI Response Language"),
      "Spanish",
    );
    await user.click(screen.getByRole("button", { name: "Save Preferences" }));

    expect(loadSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      aiPersona: "coach",
      aiConciseness: "short",
      uiLanguage: "fr",
      aiLanguage: "Spanish",
    });
  });

  it("confirms the save with a toast", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PreferencesTab />);

    await user.click(screen.getByRole("button", { name: "Save Preferences" }));

    expect(
      await screen.findByText("Your settings have been saved successfully."),
    ).toBeInTheDocument();
  });

  it("does not clobber the Notifications tab's toggles", async () => {
    /* Both tabs write the same localStorage key. With per-tab state the
       explicit save here would serialise a stale copy of the toggles and
       silently switch them back on. */
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <NotificationsTab />
        <PreferencesTab />
      </>,
    );

    await user.click(screen.getByRole("switch", { name: "Timer Alerts" }));
    expect(loadSettings().notifyTimerAlerts).toBe(false);

    await user.selectOptions(screen.getByLabelText("AI Persona"), "coach");
    await user.click(screen.getByRole("button", { name: "Save Preferences" }));

    expect(loadSettings()).toMatchObject({
      aiPersona: "coach",
      notifyTimerAlerts: false,
    });
  });
});
