import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithAuth, fakeSession } from "../../test/auth";
import { mockAuthSession } from "../../test/mockSession";
import { server } from "../../test/mocks/server";
import { SUPABASE_URL } from "../../lib/supabase";
import { StudyProfileWizard } from "./StudyProfileWizard";
import { draftOutline, studyProfileApi } from "../../api/studyProfile";
import { EMPTY_PROFILE, equalWeights, resumeStep, type StudyProfile } from "../../lib/studyProfile";

const navigate = vi.fn();
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigate,
}));
vi.mock("../../api/studyProfile", () => ({
  studyProfileApi: {
    load: vi.fn(),
    save: vi.fn(async (p: unknown) => p),
    fetchOutlines: vi.fn(async () => ({})),
    saveOutline: vi.fn(async () => {}),
  },
  draftOutline: vi.fn(),
}));

const ANSWERED: Partial<StudyProfile> = {
  ageBand: "16-17",
  weekdayMins: 60,
  weekendMins: 120,
  bestTime: "night",
  sessionLength: "medium",
  target: "Pass everything",
};

function start(p: Partial<StudyProfile>) {
  vi.mocked(studyProfileApi.load).mockResolvedValue({ ...EMPTY_PROFILE, ...p });
  return renderWithAuth(<StudyProfileWizard />, { session: fakeSession() }, { withRouter: true });
}

beforeEach(() => {
  mockAuthSession("user-1");
  vi.clearAllMocks();
  localStorage.clear();
});

describe("StudyProfileWizard", () => {
  it("resumes at the first unanswered step", () => {
    expect(resumeStep(EMPTY_PROFILE)).toBe("age");
    expect(resumeStep({ ...EMPTY_PROFILE, ageBand: "13-15", country: "GB" })).toBe("system");
    expect(
      resumeStep({
        ...EMPTY_PROFILE,
        ...ANSWERED,
        country: "GB",
        system: "gcse",
        board: "AQA",
        subjects: [{ name: "Biology", specId: "aqa-gcse-biology-8461", examDate: null, confidence: 2 }],
        deeperSkipped: true,
      }),
    ).toBe("plan");
  });

  it("an under-13 answer stops the wizard and is not saved", async () => {
    start({});
    await userEvent.click(await screen.findByRole("button", { name: "Under 13" }));
    expect(screen.getByText(/students aged 13 and over/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await new Promise((r) => setTimeout(r, 500));
    expect(studyProfileApi.save).not.toHaveBeenCalled();
  });

  it("seeded board: GCSE → AQA marks Biology supported and saves each answer", async () => {
    start({ ageBand: "16-17", country: "GB" });
    await userEvent.click(await screen.findByRole("button", { name: /GCSE \/ IGCSE/ }));
    await userEvent.click(screen.getByRole("button", { name: /^AQA/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: /^Biology/ }));
    expect(screen.getByText(/Biology · supported/)).toBeInTheDocument();
    await waitFor(() =>
      expect(studyProfileApi.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          system: "gcse",
          board: "AQA",
          subjects: [expect.objectContaining({ name: "Biology", specId: "aqa-gcse-biology-8461" })],
        }),
      ),
    );
  });

  it("non-seeded board: 'my board isn't listed' takes free text and runs in generic mode", async () => {
    start({ ageBand: "16-17", country: "NG" });
    await userEvent.click(await screen.findByRole("button", { name: "My board isn't listed" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText(/WAEC/), "WAEC");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.type(await screen.findByPlaceholderText("Any subject, in your words"), "Literature in English");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText(/Literature in English · generic mode \(unverified\)/)).toBeInTheDocument();
  });

  it("skipping 'go deeper' still builds a plan with an unverified draft outline and a reason per block", async () => {
    vi.mocked(draftOutline).mockResolvedValue(equalWeights(["Poetry", "Drama", "Prose"]));
    server.use(http.post(`${SUPABASE_URL}/rest/v1/exams`, () => new HttpResponse(null, { status: 201 })));
    start({
      ...ANSWERED,
      country: "NG",
      system: "other",
      board: "WAEC",
      level: "SS3",
      subjects: [{ name: "Literature", specId: null, examDate: null, confidence: 1 }],
    });
    await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
    await waitFor(() =>
      expect(studyProfileApi.save).toHaveBeenCalledWith(expect.objectContaining({ deeperSkipped: true })),
    );

    expect(await screen.findByText(/Literature topics · draft, unverified · equal weights/)).toBeInTheDocument();
    const plan = await screen.findByRole("list", { name: "Plan for the next seven days" });
    const first = within(plan).getAllByRole("listitem")[0];
    expect(first).toHaveTextContent(/Literature: (Poetry|Drama|Prose)/);
    expect(first).toHaveTextContent(/draft Literature outline \(unverified, equal weights\)/);
    expect(draftOutline).toHaveBeenCalledWith(expect.objectContaining({ board: "WAEC" }), "Literature");

    await userEvent.click(screen.getByRole("button", { name: "Save and open my plan" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/plan"));
  });
});

describe("editing a draft outline", () => {
  it("keeps the new line while typing, and plans with the typed topics", async () => {
    vi.mocked(draftOutline).mockRejectedValue(new Error("offline"));
    start({
      ...ANSWERED,
      country: "NG",
      system: "other",
      board: "WAEC",
      subjects: [{ name: "Literature", specId: null, examDate: null, confidence: 2 }],
      deeperSkipped: true,
    });
    expect(await screen.findByText(/Couldn't draft topics right now/)).toBeInTheDocument();
    const box = screen.getByRole("textbox", { name: "One topic per line" });
    await userEvent.type(box, "Poetry{enter}Drama");
    expect(box).toHaveValue("Poetry\nDrama");
    await waitFor(() =>
      expect(studyProfileApi.saveOutline).toHaveBeenLastCalledWith(
        "Literature",
        [expect.objectContaining({ title: "Poetry" }), expect.objectContaining({ title: "Drama" })],
        "student",
        expect.anything(),
      ),
    );
    const plan = await screen.findByRole("list", { name: "Plan for the next seven days" });
    expect(within(plan).getAllByRole("listitem")[0]).toHaveTextContent(/Literature: (Poetry|Drama)/);
  });
});
