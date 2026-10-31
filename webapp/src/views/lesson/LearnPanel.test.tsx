import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../test/render";
import type { LearnStep } from "../../api/learn";
import { LearnPanel } from "./LearnPanel";

const generate = vi.fn();
const restyle = vi.fn();
const recordEvent = vi.fn(async () => undefined);
vi.mock("../../api/learn", async (orig) => ({
  ...(await orig<typeof import("../../api/learn")>()),
  generateLearnStep: (...a: unknown[]) => generate(...a),
  explainAnotherWay: (...a: unknown[]) => restyle(...a),
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

describe("LearnPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    plan = "free";
    restyle.mockReset();
    restyle.mockImplementation(async ({ style }: { style: string }) => `Explained as ${style}.`);
    generate.mockReset();
    recordEvent.mockClear();
    generate.mockImplementation(async ({ section }: { section: { title: string } }) => step(section.title));
  });

  it("teaches each part from the notes: guess, idea, check, and another way after a miss", async () => {
    const user = userEvent.setup();
    const onOpenTab = renderPanel();

    /* The outline is the notes' own sections, and nothing is asked for
       until the student starts. */
    expect(screen.getByRole("button", { name: /Osmosis/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Diffusion/ })).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Start learning" }));

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
    await user.click(screen.getByRole("button", { name: "Lock it in with cards" }));
    expect(onOpenTab).toHaveBeenCalledWith("cards");
    /* Diffusion was written while Osmosis was being read, once. */
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("keeps the student's place and the written parts across a reload", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Start learning" }));
    await user.click(await screen.findByRole("button", { name: /Hook answer/ }));
    await user.click(screen.getByRole("button", { name: "Show me why" }));
    await user.click(screen.getByRole("button", { name: "Got it, check me" }));
    await user.click(screen.getByRole("button", { name: /Check answer/ }));
    await user.click(screen.getByRole("button", { name: "Next part" }));
    await screen.findByText("Guess about Diffusion?");
    cleanup();

    renderPanel();
    expect(screen.getByText("Guess about Diffusion?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Outline/ }));
    expect(screen.getByText("Got it first time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carry on: Diffusion" })).toBeInTheDocument();
    /* Nothing already written is asked for again. */
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("offers a retry when the tutor doesn't answer, without losing the place", async () => {
    const user = userEvent.setup();
    generate.mockRejectedValueOnce(new Error("The AI service is busy."));
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Start learning" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The AI service is busy.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Guess about Osmosis?")).toBeInTheDocument());
  });

  async function toTeachStep(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Start learning" }));
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

  it("explains that Learn needs notes when there are none", () => {
    renderWithProviders(
      <LearnPanel materialId="m" lesson="Cells" subject={null} markdown="" loading={false} onOpenTab={vi.fn()} />,
      undefined,
      { withRouter: true },
    );
    expect(screen.getByText("Nothing to learn from yet")).toBeInTheDocument();
  });
});
