import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { profileApi } from "../../api/profile";
import { getFramework } from "../../lib/region";

describe("PreferencesTab", () => {
  afterEach(() => vi.restoreAllMocks());

  it("saves region and SAT framework together only when Save Changes is pressed", async () => {
    vi.spyOn(profileApi, "updateTimezone").mockResolvedValue();
    const sync = vi.spyOn(profileApi, "updateRegion").mockResolvedValue();
    const user = userEvent.setup();
    renderWithProviders(<PreferencesTab />, undefined, { withRouter: true });
    await user.selectOptions(screen.getByLabelText("Region"), "US");
    await user.selectOptions(screen.getByLabelText("Exam framework"), "sat");
    expect(sync).not.toHaveBeenCalled();
    expect(loadSettings().framework).toBe("auto");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByText("Preferences saved.")).toBeInTheDocument();
    expect(sync).toHaveBeenCalledWith({
      region: "US",
      framework_id: "sat",
      grade_scale_id: null,
    });
    expect(getFramework().id).toBe("sat");
  });

  it("keeps local preferences and reports a failed cross-device save", async () => {
    vi.spyOn(profileApi, "updateTimezone").mockResolvedValue();
    vi.spyOn(profileApi, "updateRegion").mockRejectedValue(
      new Error("offline"),
    );
    const user = userEvent.setup();
    renderWithProviders(<PreferencesTab />, undefined, { withRouter: true });
    await user.selectOptions(screen.getByLabelText("Exam framework"), "sat");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(
      await screen.findByText(
        /Saved on this device. Could not sync preferences/,
      ),
    ).toBeInTheDocument();
    expect(loadSettings().framework).toBe("sat");
    expect(screen.queryByText("Preferences saved.")).not.toBeInTheDocument();
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the stored values on mount", () => {
    Storage.set(SETTINGS_KEY, {
      ...DEFAULT_SETTINGS,
      aiPersona: "coach",
      aiLanguage: "Hindi",
    });
    renderWithProviders(<PreferencesTab />, undefined, { withRouter: true });

    expect(screen.getByLabelText("AI Persona")).toHaveValue("coach");
    expect(screen.getByLabelText("AI Response Language")).toHaveValue("Hindi");
  });

  it("does not persist until Save Changes is pressed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PreferencesTab />, undefined, { withRouter: true });

    await user.selectOptions(screen.getByLabelText("AI Persona"), "buddy");
    expect(loadSettings().aiPersona).toBe("tutor");

    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(loadSettings().aiPersona).toBe("buddy");
  });

  it("saves all four selects together", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PreferencesTab />, undefined, { withRouter: true });

    await user.selectOptions(screen.getByLabelText("AI Persona"), "coach");
    await user.selectOptions(screen.getByLabelText("Response Length"), "short");
    /* AI Response Language before UI Language: switching UI Language
       re-translates this tab live (Step 23's useTranslation), which renames
       the "AI Response Language" <label> itself once it's no longer English
       — selecting it first, while the label still reads in English, avoids
       the query racing its own translation. */
    await user.selectOptions(
      screen.getByLabelText("AI Response Language"),
      "Spanish",
    );
    await user.selectOptions(screen.getByLabelText("UI Language"), "fr");
    await user.click(
      screen.getByRole("button", { name: /^(Save Changes|Enregistrer)$/ }),
    );

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
    renderWithProviders(<PreferencesTab />, undefined, { withRouter: true });

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByText("Preferences saved.")).toBeInTheDocument();
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
      undefined,
      { withRouter: true },
    );

    await user.click(screen.getByRole("switch", { name: "Timer Alerts" }));
    expect(loadSettings().notifyTimerAlerts).toBe(false);

    await user.selectOptions(screen.getByLabelText("AI Persona"), "coach");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(loadSettings()).toMatchObject({
      aiPersona: "coach",
      notifyTimerAlerts: false,
    });
  });

  it("updates and saves study behaviour and source settings", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PreferencesTab />, undefined, { withRouter: true });

    expect(
      screen.getByRole("heading", { name: "Study behaviour and sources" }),
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText("Depth Level"),
      "4: Advanced Analysis",
    );
    await user.selectOptions(screen.getByLabelText("Study Style"), "visual");
    await user.click(
      screen.getByRole("switch", { name: "Auto-Adapt Persona" }),
    );
    await user.click(
      screen.getByRole("switch", { name: "Live Web Intelligence" }),
    );

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(loadSettings()).toMatchObject({
      aiDepth: 4,
      aiStyle: "visual",
      aiAutoAdapt: false,
      webAccess: false,
    });
  });
});
