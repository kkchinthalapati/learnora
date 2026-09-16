import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "./SettingsProvider";
import { AuthContext } from "./auth";
import { useSettings } from "./settings";
import { authValue, fakeSession } from "../test/auth";
import { profileApi } from "../api/profile";
import { getFramework, getRegion } from "../lib/region";
import { loadSettings } from "../lib/settings";

vi.mock("../api/profile", () => ({ profileApi: { fetchRegion: vi.fn() } }));

function Probe() {
  const { settings, setSettings } = useSettings();
  return (
    <>
      <output>
        {settings.region}/{settings.framework}/{settings.gradeScale}
      </output>
      <button onClick={() => setSettings({ framework: "sat" })}>
        Choose SAT
      </button>
    </>
  );
}

function app(id: string | null = "maya") {
  return (
    <AuthContext.Provider
      value={authValue({ session: id ? fakeSession({ id }) : null })}
    >
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
});

describe("curriculum settings across devices", () => {
  it("hydrates the profile into both the controls and the API prompt settings", async () => {
    vi.mocked(profileApi.fetchRegion).mockResolvedValue({
      region: "US",
      framework_id: "sat",
      grade_scale_id: "percent",
    });
    render(app());
    await screen.findByText("US/sat/percent");
    expect(getFramework().id).toBe("sat");
    expect(getRegion().currency).toBe("USD");
    expect(profileApi.fetchRegion).toHaveBeenCalledWith("maya");
  });

  it("does not overwrite a curriculum choice made while the profile is loading", async () => {
    let resolve!: (profile: { region: string; framework_id: string }) => void;
    vi.mocked(profileApi.fetchRegion).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(app());
    fireEvent.click(screen.getByRole("button", { name: "Choose SAT" }));
    await act(async () => resolve({ region: "US", framework_id: "ap" }));
    expect(screen.getByText("US/sat/auto")).toBeInTheDocument();
    expect(loadSettings().framework).toBe("auto");
  });

  it("ignores a late response from a signed-out account", async () => {
    let resolve!: (profile: { region: string; framework_id: string }) => void;
    vi.mocked(profileApi.fetchRegion).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(app());
    view.rerender(app(null));
    await act(async () => resolve({ region: "US", framework_id: "ap" }));
    expect(screen.getByText("auto/auto/auto")).toBeInTheDocument();
    expect(loadSettings().framework).toBe("auto");
  });

  it("clears the previous account's pins when switching accounts", async () => {
    vi.mocked(profileApi.fetchRegion)
      .mockResolvedValueOnce({
        region: "US",
        framework_id: "ap",
        grade_scale_id: "ap",
      })
      .mockResolvedValueOnce({
        region: "GB",
        framework_id: null,
        grade_scale_id: null,
      });
    const view = render(app());
    await screen.findByText("US/ap/ap");
    view.rerender(app("another-student"));
    await screen.findByText("GB/auto/auto");
    expect(getFramework().id).toBe("gcse");
  });

  it("rejects inherited object keys received from a profile", async () => {
    vi.mocked(profileApi.fetchRegion).mockResolvedValue({
      region: "constructor",
      framework_id: "toString",
      grade_scale_id: "__proto__",
    });
    render(app());
    await waitFor(() => expect(profileApi.fetchRegion).toHaveBeenCalled());
    expect(screen.getByText("auto/auto/auto")).toBeInTheDocument();
  });
});
