import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import type { LearnerProfile } from "../../lib/learnerProfile";

let stored: LearnerProfile = { style: "visual", prefs: [], notes: "", interests: "" };
const save = vi.fn(async (patch: Partial<LearnerProfile>) => {
  stored = { ...stored, ...patch };
  return stored;
});
vi.mock("../../api/learnerStyle", () => ({
  loadLearnerProfile: async () => stored,
  saveLearnerProfile: (patch: Partial<LearnerProfile>) => save(patch),
}));
vi.mock("../../api/learnerSignals", () => ({
  learnerSignalsKey: ["learner-signals"],
  learnerSignalsApi: { fetchState: async () => ({ signals: [], available: true }), record: async () => undefined },
}));

const { HowYouLearnCard } = await import("./HowYouLearnCard");

beforeEach(() => {
  stored = { style: "visual", prefs: [], notes: "", interests: "" };
  save.mockClear();
});

describe("HowYouLearnCard", () => {
  it("shows what they chose in onboarding and saves a change at once", async () => {
    renderWithProviders(<HowYouLearnCard />, undefined, { withRouter: true });
    /* Fields wait for the saved answers before they can be changed. */
    await waitFor(() => expect(screen.getByRole("radio", { name: /Pictures and diagrams/ })).toBeChecked());
    await userEvent.click(screen.getByRole("radio", { name: /Practice first/ }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ style: "practice" })));
    expect(await screen.findByText(/Saved\. The next lesson will use it\./)).toBeInTheDocument();
  });

  it("saves their own words when they leave the field, keeping what they typed", async () => {
    renderWithProviders(<HowYouLearnCard />, undefined, { withRouter: true });
    const box = await screen.findByRole("textbox", { name: "Describe how you learn" });
    await waitFor(() => expect(box).toBeEnabled());
    await userEvent.type(box, "I learn by doing ");
    expect(box).toHaveValue("I learn by doing ");
    await userEvent.tab();
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ notes: "I learn by doing " })));
    expect(box).toHaveValue("I learn by doing ");
  });
});
