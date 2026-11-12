import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import type { LearnStep } from "../../api/learn";
import { LearnPanel } from "./LearnPanel";

const generate = vi.fn();
const restyle = vi.fn();
const writeExam = vi.fn();
const markAnswer = vi.fn();
const frame = vi.fn();
const recordEvent = vi.fn(async () => undefined);
vi.mock("../../api/learn", async (orig) => ({
  ...(await orig<typeof import("../../api/learn")>()),
  generateLearnStep: (...a: unknown[]) => generate(...a),
  explainAnotherWay: (...a: unknown[]) => restyle(...a),
  writeExamQuestion: (...a: unknown[]) => writeExam(...a),
  markTypedAnswer: (...a: unknown[]) => markAnswer(...a),
  writeLessonFrame: (...a: unknown[]) => frame(...a),
}));
let plan: "free" | "plus" = "free";
vi.mock("../../hooks/useSubscription", async (orig) => {
  const real = await orig<typeof import("../../hooks/useSubscription")>();
  const { canUse } = await import("../../lib/entitlements");
  return {
    ...real,
    useEntitlements: () => ({
      plan,
      isPending: false,
      can: (feature: Parameters<typeof canUse>[1]) => canUse(plan, feature),
    }),
  };
});
/* What the student said under "How you learn" (onboarding, Settings). The
   start screen only shows it; it never asks. */
let savedStyle: string | null = "visual";
const saveStyle = vi.fn(async (_patch: unknown) => undefined);
vi.mock("../../api/learnerStyle", () => ({
  loadLearnerProfile: async () => ({ style: savedStyle, prefs: [], notes: "", interests: "" }),
  saveLearnerProfile: (patch: unknown) => saveStyle(patch),
}));

vi.mock("../../api/learningEvents", () => ({
  learningEventsApi: { record: (...a: unknown[]) => recordEvent(...(a as [])) },
}));

const q = (question: string, right: string) => ({
  question,
  choices: [right, "Wrong one", "Wrong two", "Wrong three"],
  correctIndex: 0,
  feedback: `Because ${right}.`,
});

const step = (concept: string): LearnStep => ({
  concept,
  hook: q(`Guess about ${concept}?`, "Hook answer"),
  explanation: `How ${concept} works.`,
  check: q(`Check on ${concept}?`, "Check answer"),
  reteach: `${concept}, another way.`,
  recheck: q(`New check on ${concept}?`, "Recheck answer"),
});

const notes = `## Your guide to cells

### Osmosis
Water moves across a membrane towards the more concentrated side.

### Diffusion
Particles spread from where there are more of them to where there are fewer.`;

function renderPanel(onOpenTab = vi.fn()) {
  renderWithProviders(
    <LearnPanel
      materialId="lesson-1"
      title="Cells and transport"
      lesson="Cells"
      subject="Biology"
      markdown={notes}
      loading={false}
      onOpenTab={onOpenTab}
    />,
    undefined,
    { withRouter: true },
  );
  return onOpenTab;
}

/* Start learning, read the big picture, then on to part 1. */
async function start(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Start learning" }));
  await screen.findByText("Cells move things in and out without spending energy.");
  await user.click(screen.getByRole("button", { name: "Start part 1: Osmosis" }));
}

describe("LearnPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    savedStyle = "visual";
    saveStyle.mockClear();
    plan = "free";
    restyle.mockReset();
    writeExam.mockReset();
    writeExam.mockResolvedValue({
      question: "Explain why a plant cell in pure water does not burst.",
      scheme: [{ text: "water enters by osmosis", marks: 1 }, { text: "the cell wall resists", marks: 1 }],
      total: 2,
    });
    markAnswer.mockReset();
    markAnswer.mockResolvedValue({
      kind: "marked",
      points: [
        { point: { text: "water enters by osmosis", marks: 1 }, verdict: "awarded", evidence: "water goes in by osmosis", note: "" },
        { point: { text: "the cell wall resists", marks: 1 }, verdict: "missed", evidence: "", note: "Doesn't mention the cell wall" },
      ],
      awarded: 1,
      total: 2,
      unchecked: 0,
      beliefs: [{ concept: "Osmosis", belief: "Thinks salt moves into the cell", quote: "salt goes in" }],
    });
    restyle.mockImplementation(async ({ style }: { style: string }) => `Explained as ${style}.`);
    generate.mockReset();
    frame.mockReset();
    frame.mockResolvedValue({
      overview: "Cells move things in and out without spending energy.",
      recap: "Osmosis is diffusion of water.",
    });
    recordEvent.mockClear();
    generate.mockImplementation(async ({ section }: { section: { title: string } }) => step(section.title));
  });

  it("shows what lessons are shaped for, and points to Settings to change it", async () => {
    renderPanel();
    expect(await screen.findByText(/Shaped for/)).toHaveTextContent("Shaped for pictures and diagrams");
    expect(screen.getByRole("link", { name: "Change in Settings" })).toHaveAttribute(
      "href",
      "/settings?tab=study#how-you-learn",
    );
    expect(screen.getByRole("button", { name: "Start learning" })).toBeInTheDocument();
  });

  it("never asks how they learn inside a lesson, even when nothing is set", async () => {
    savedStyle = null;
    renderPanel();
    expect(await screen.findByRole("button", { name: "Start learning" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("link", { name: "How you learn" })).toHaveAttribute("href", "/settings?tab=study#how-you-learn");
    expect(saveStyle).not.toHaveBeenCalled();
  });

  it("offers the podcast and the tutor call from the start screen", async () => {
    renderPanel();
    expect(await screen.findByRole("button", { name: /Listen/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Talk it through/ })).toBeInTheDocument();
  });

  it("teaches each part from the notes: guess, idea, check, and another way after a miss", async () => {
    const user = userEvent.setup();
    const onOpenTab = renderPanel();

    /* The outline is the notes' own sections, and nothing is asked for
       until the student starts. */
    expect(screen.getByRole("button", { name: /Osmosis/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Diffusion/ })).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
    expect(frame).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Start learning" }));

    /* The big picture first, while part 1 is written alongside it. */
    expect(await screen.findByText("Cells move things in and out without spending energy.")).toBeInTheDocument();
    expect(frame.mock.calls[0][0]).toMatchObject({ materialId: "lesson-1", lesson: "Cells" });
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Start part 1: Osmosis" }));

    /* A wrong guess is not evidence. */
    await user.click(await screen.findByRole("button", { name: /Wrong one/ }));
    expect(recordEvent).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Show me why" }));
    expect(screen.getByText("How Osmosis works.")).toBeInTheDocument();
    expect(generate.mock.calls[0][0]).toMatchObject({
      materialId: "lesson-1",
      lesson: "Cells",
      section: { title: "Osmosis" },
      otherSections: ["Diffusion"],
    });

    /* A missed check goes to the ledger as evidence. */
    await user.click(screen.getByRole("button", { name: "Got it, check me" }));
    await user.click(screen.getByRole("button", { name: /Wrong one/ }));
    expect(recordEvent).toHaveBeenCalledTimes(1);
    expect(recordEvent.mock.calls[0]).toMatchObject([
      { source: "quick_check", score: 0, payload: { mode: "learn", concept: "Osmosis" } },
      [{ kind: "evidence", subject: "Biology", concept: "Osmosis", tool: "notes" }],
    ]);

    /* Then the same idea another way, and a new question; getting that one
       right is the correction. */
    await user.click(screen.getByRole("button", { name: "Explain it another way" }));
    expect(screen.getByText("Osmosis, another way.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try a new question" }));
    expect(screen.getByText("New check on Osmosis?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Recheck answer/ }));
    expect(recordEvent.mock.calls[1]).toMatchObject([
      { score: 1 },
      [{ kind: "correction", concept: "Osmosis" }],
    ]);
    await user.click(screen.getByRole("button", { name: "Next part" }));

    /* A right answer first time is a pass and leaves the ledger alone. */
    await user.click(await screen.findByRole("button", { name: /Hook answer/ }));
    await user.click(screen.getByRole("button", { name: "Show me why" }));
    await user.click(screen.getByRole("button", { name: "Got it, check me" }));
    await user.click(screen.getByRole("button", { name: /Check answer/ }));
    expect(recordEvent.mock.calls[2]).toMatchObject([{ score: 1 }, []]);
    await user.click(screen.getByRole("button", { name: "Finish the lesson" }));

    expect(screen.getByRole("heading", { name: "You've learned this lesson." })).toBeInTheDocument();
    /* The last step: say it back (views/lesson/ExplainBack). Free, no gate. */
    expect(screen.getByRole("heading", { name: "Can you explain this in your own words?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Your explanation")).toBeInTheDocument();
    /* And how it fits together, from the same overview call. */
    expect(screen.getByText("Osmosis is diffusion of water.")).toBeInTheDocument();
    expect(frame).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Lock it in with cards" }));
    expect(onOpenTab).toHaveBeenCalledWith("cards");
    /* Diffusion was written while Osmosis was being read, once. */
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("keeps the student's place and the written parts across a reload", async () => {
    const user = userEvent.setup();
    renderPanel();
    await start(user);
    await user.click(await screen.findByRole("button", { name: /Hook answer/ }));
    await user.click(screen.getByRole("button", { name: "Show me why" }));
    await user.click(screen.getByRole("button", { name: "Got it, check me" }));
    await user.click(screen.getByRole("button", { name: /Check answer/ }));
    await user.click(screen.getByRole("button", { name: "Next part" }));
    await screen.findByText("Guess about Diffusion?");
    cleanup();

    renderPanel();
    expect(screen.getByText("Guess about Diffusion?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Leave and go back to the lesson" }));
    expect(screen.getByText("Got it first time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carry on: Diffusion" })).toBeInTheDocument();
    /* Nothing already written is asked for again. */
    expect(generate).toHaveBeenCalledTimes(2);
    expect(frame).toHaveBeenCalledTimes(1);
  });

  it("offers a retry when the tutor doesn't answer, without losing the place", async () => {
    const user = userEvent.setup();
    generate.mockRejectedValueOnce(new Error("The AI service is busy."));
    renderPanel();
    await start(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("The AI service is busy.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Guess about Osmosis?")).toBeInTheDocument());
  });

  it("lets the student start without the overview when it can't be written", async () => {
    const user = userEvent.setup();
    frame.mockRejectedValueOnce(new Error("The AI service is busy."));
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Start learning" }));
    expect(await screen.findByText(/You can start without the overview/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start part 1: Osmosis" }));
    expect(await screen.findByText("Guess about Osmosis?")).toBeInTheDocument();
  });

  it("teaches with cards, uncovering a worked example a step at a time", async () => {
    const user = userEvent.setup();
    generate.mockImplementation(async ({ section }: { section: { title: string } }) => ({
      ...step(section.title),
      explanation: [
        "Water moves by **osmosis**.",
        [
          "```openui",
          "root = Stack([w])",
          'w = WorkedExample("A cell is put in pure water. Which way does water move?", ["Pure water is the more dilute side.", "Water moves towards the more concentrated side."], "Into the cell")',
          "```",
        ].join("\n"),
      ].join("\n\n"),
    }));
    renderPanel();
    await start(user);
    await user.click(await screen.findByRole("button", { name: /Hook answer/ }));
    await user.click(screen.getByRole("button", { name: "Show me why" }));

    /* The card library is loaded on demand, and its first load in a test run
       can take more than findBy's default second. */
    expect(
      await screen.findByText("A cell is put in pure water. Which way does water move?", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Pure water is the more dilute side.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show the first step" }));
    expect(screen.getByText("Pure water is the more dilute side.")).toBeInTheDocument();
    expect(screen.queryByText("Into the cell")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next step" }));
    await user.click(screen.getByRole("button", { name: "Show the answer" }));
    expect(screen.getByText("Into the cell")).toBeInTheDocument();
  });

  async function toTeachStep(user: ReturnType<typeof userEvent.setup>) {
    await start(user);
    await user.click(await screen.findByRole("button", { name: /Hook answer/ }));
    await user.click(screen.getByRole("button", { name: "Show me why" }));
  }

  it("re-explains a part in the style a Plus student picks, once per style", async () => {
    plan = "plus";
    const user = userEvent.setup();
    renderPanel();
    await toTeachStep(user);
    expect(screen.queryByText("Plus")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "An analogy" }));
    expect(await screen.findByText("Explained as analogy.")).toBeInTheDocument();
    expect(restyle.mock.calls[0][0]).toMatchObject({
      materialId: "lesson-1",
      style: "analogy",
      concept: "Osmosis",
      explanation: "How Osmosis works.",
    });

    await user.click(screen.getByRole("button", { name: "Step by step" }));
    expect(await screen.findByText("Explained as steps.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "An analogy" }));
    expect(screen.getByText("Explained as analogy.")).toBeInTheDocument();
    expect(restyle).toHaveBeenCalledTimes(2);
  });

  it("shows a free student the option, and the plans instead of a request", async () => {
    const user = userEvent.setup();
    renderPanel();
    await toTeachStep(user);
    expect(screen.getByText("Plus")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "An analogy" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(restyle).not.toHaveBeenCalled();
  });

  async function toCheckPassed(user: ReturnType<typeof userEvent.setup>) {
    await toTeachStep(user);
    await user.click(screen.getByRole("button", { name: "Got it, check me" }));
    await user.click(screen.getByRole("button", { name: /Check answer/ }));
  }

  it("gives a Plus student an exam question on the part, and marks the typed answer", async () => {
    plan = "plus";
    const user = userEvent.setup();
    renderPanel();
    await toCheckPassed(user);
    await user.click(screen.getByRole("button", { name: "Try an exam question" }));

    expect(await screen.findByText(/does not burst/)).toBeInTheDocument();
    expect(screen.getByText("[2 marks]")).toBeInTheDocument();
    expect(writeExam.mock.calls[0][0]).toMatchObject({ materialId: "lesson-1", concept: "Osmosis" });
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "The water goes in by osmosis but salt goes in too.");
    await user.click(screen.getByRole("button", { name: "Mark my answer" }));

    expect(await screen.findByText("1 of 2 marks.")).toBeInTheDocument();
    expect(screen.getByText("Your words: “water goes in by osmosis”")).toBeInTheDocument();
    expect(screen.getByText("Doesn't mention the cell wall")).toBeInTheDocument();
    expect(markAnswer.mock.calls[0][0]).toMatchObject({ answer: "The water goes in by osmosis but salt goes in too.", subject: "Biology" });

    /* The belief the answer stated goes to the ledger; the score is evidence. */
    const examEvent = recordEvent.mock.calls.find((c) => (c as unknown[])[0] && ((c as unknown[])[0] as { payload: { mode: string } }).payload.mode === "learn-exam");
    expect(examEvent).toMatchObject([
      { score: 0.5 },
      [{ kind: "evidence", summary: "Thinks salt moves into the cell", provisional: true }],
    ]);

    await user.click(screen.getByRole("button", { name: "Next part" }));
    expect(await screen.findByText("Guess about Diffusion?")).toBeInTheDocument();
  });

  it("offers a free student the exam question as a Plus feature, without writing one", async () => {
    const user = userEvent.setup();
    renderPanel();
    await toCheckPassed(user);
    await user.click(screen.getByRole("button", { name: /Try an exam question/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(writeExam).not.toHaveBeenCalled();
  });

  it("explains that Learn needs notes when there are none", () => {
    renderWithProviders(
      <LearnPanel materialId="m" title="Cells" lesson="Cells" subject={null} markdown="" loading={false} onOpenTab={vi.fn()} />,
      undefined,
      { withRouter: true },
    );
    expect(screen.getByText("Nothing to learn from yet")).toBeInTheDocument();
  });
});
