import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { Marking } from "../../lib/photoMarking";
import { ExplainBack, type ExplainBackProgress } from "./ExplainBack";

const check = vi.fn();
const recordEvent = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("../../api/explainBack", async (orig) => ({
  ...(await orig<typeof import("../../api/explainBack")>()),
  checkExplanation: (...a: unknown[]) => check(...a),
}));
vi.mock("../../api/learningEvents", () => ({
  learningEventsApi: { record: (...a: unknown[]) => recordEvent(...a) },
}));

const PARTS = [
  { key: "a", text: "Osmosis", notes: "Osmosis is the movement of water across a partially permeable membrane." },
  { key: "b", text: "Which way water moves", notes: "Water moves from a dilute solution to a more concentrated solution." },
];
const ANSWER =
  "Osmosis is when water crosses a membrane that only lets some things through, going from the weak solution to the strong one.";

const marking = (patch: Partial<Extract<Marking, { kind: "marked" }>> = {}): Marking => ({
  kind: "marked",
  points: [
    {
      point: { text: "Osmosis", marks: 1 },
      verdict: "awarded",
      evidence: "water crosses a membrane that only lets some things through",
      note: "",
    },
    { point: { text: "Which way water moves", marks: 1 }, verdict: "missed", evidence: "", note: "Why it moves that way" },
  ],
  awarded: 1,
  total: 2,
  unchecked: 0,
  beliefs: [],
  ...patch,
});

const revisit = vi.fn();

function Harness() {
  const [saved, setSaved] = useState<ExplainBackProgress | undefined>();
  return (
    <ExplainBack
      materialId="m1"
      lesson="Osmosis"
      subject="Biology"
      parts={PARTS}
      saved={saved}
      onSave={setSaved}
      onRevisit={revisit}
    />
  );
}

async function explain(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Your explanation"), text);
  await user.click(screen.getByRole("button", { name: "Check my explanation" }));
  return user;
}

describe("ExplainBack", () => {
  beforeEach(() => {
    check.mockReset();
    recordEvent.mockClear();
    revisit.mockClear();
  });

  it("invites an explanation, with no marks promised", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { name: "Can you explain this in your own words?" })).toBeInTheDocument();
    expect(screen.getByText(/No marks/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check my explanation" })).toBeDisabled();
  });

  it("shows what came across in the student's words, and what was left out", async () => {
    check.mockResolvedValueOnce(marking());
    render(<Harness />);
    await explain(ANSWER);

    expect(await screen.findByText("1 of 2 parts came across.")).toBeInTheDocument();
    const got = within(screen.getByRole("list", { name: "What came across" }));
    expect(got.getByText(/Your words: “water crosses a membrane/)).toBeInTheDocument();
    const left = within(screen.getByRole("list", { name: "What you left out" }));
    expect(left.getByText("Which way water moves")).toBeInTheDocument();
    expect(left.getByText("Why it moves that way")).toBeInTheDocument();
    /* Nothing reads as a score out of marks. */
    expect(document.body.textContent).not.toMatch(/marks?\b/i);

    await userEvent.setup().click(left.getByRole("button", { name: "Go over this part again" }));
    expect(revisit).toHaveBeenCalledWith("b");
  });

  it("records a left-out part as nothing, not as not knowing", async () => {
    check.mockResolvedValueOnce(marking());
    render(<Harness />);
    await explain(ANSWER);
    await waitFor(() => expect(recordEvent).toHaveBeenCalledTimes(1));
    const [event, candidates] = recordEvent.mock.calls[0] as [{ score: number | null; payload: unknown }, unknown[]];
    expect(event.score).toBeNull();
    expect(event.payload).toMatchObject({ mode: "learn-explain-back", parts: 2, covered: 1 });
    expect(candidates).toEqual([]);
  });

  it("records knowing the lesson when all of it came across", async () => {
    const full = marking();
    if (full.kind !== "marked") throw new Error("unreachable");
    full.points[1] = { ...full.points[1], verdict: "awarded", evidence: "going from the weak solution to the strong one", note: "" };
    full.awarded = 2;
    check.mockResolvedValueOnce(full);
    render(<Harness />);
    await explain(ANSWER);
    expect(await screen.findByText("All of it came across, in your own words.")).toBeInTheDocument();
    await waitFor(() => expect(recordEvent).toHaveBeenCalledTimes(1));
    expect((recordEvent.mock.calls[0] as [{ score: number | null }])[0].score).toBe(1);
  });

  it("sends a wrong idea the student wrote to the ledger and says it is saved", async () => {
    check.mockResolvedValueOnce(
      marking({
        beliefs: [
          { concept: "Osmosis", belief: "Water moves towards the dilute side", quote: "water goes to the dilute side" },
        ],
      }),
    );
    render(<Harness />);
    await explain(ANSWER);
    const again = within(await screen.findByRole("list", { name: "Worth another look" }));
    expect(again.getByText("Water moves towards the dilute side")).toBeInTheDocument();
    expect(again.getByText(/Saved, so it comes back/)).toBeInTheDocument();
    await waitFor(() => expect(recordEvent).toHaveBeenCalledTimes(1));
    const candidates = (recordEvent.mock.calls[0] as [unknown, Array<{ subject: string; kind: string }>])[1];
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: "evidence" });
  });

  it("turns away a phrase without calling the tutor", async () => {
    render(<Harness />);
    await explain("Water moves.");
    expect(await screen.findByRole("alert")).toHaveTextContent(/a few sentences/);
    expect(check).not.toHaveBeenCalled();
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("turns away text lifted from the notes without calling the tutor", async () => {
    render(<Harness />);
    await explain(
      "Osmosis is the movement of water across a partially permeable membrane. Water moves from a dilute solution to a more concentrated solution.",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/reads like the notes/);
    expect(check).not.toHaveBeenCalled();
  });

  it("when the tutor cannot be reached, says so and records nothing", async () => {
    check.mockRejectedValueOnce(new Error("The tutor didn't answer."));
    render(<Harness />);
    await explain(ANSWER);
    expect(await screen.findByRole("alert")).toHaveTextContent("The tutor didn't answer.");
    expect(recordEvent).not.toHaveBeenCalled();
    /* The explanation is still there to send again. */
    expect(screen.getByLabelText("Your explanation")).toHaveValue(ANSWER);
  });

  it("lets the student try again", async () => {
    check.mockResolvedValueOnce(marking());
    render(<Harness />);
    const user = await explain(ANSWER);
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(screen.getByLabelText("Your explanation")).toHaveValue(ANSWER);
  });
});
