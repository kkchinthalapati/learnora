import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Renderer } from "@openuidev/react-lang";
import { openUiPromptSection } from "./blocks";
import { hasOpenUiBlock, splitOpenUiBlocks } from "./fence";
import { askLibrary } from "./library";
import { AskContext } from "./askContext";
import { buildSystemContext } from "../chatPrompt";

const CARD = `root = Stack([k, q])
k = Callout("mistake", "Assuming a catalyst shifts equilibrium.")
q = MiniQuiz("What does a catalyst change?", ["The equilibrium", "The rate"], 1, "It only speeds things up.")`;

describe("splitOpenUiBlocks", () => {
  it("keeps Markdown runs and openui blocks in order", () => {
    const text = `Intro.\n\n\`\`\`openui\n${CARD}\n\`\`\`\n\nOutro.`;
    const segments = splitOpenUiBlocks(text);
    expect(segments.map((s) => s.kind)).toEqual(["text", "openui", "text"]);
    expect(segments[1]).toEqual({ kind: "openui", code: CARD });
  });

  it("leaves an unterminated fence as text", () => {
    const text = "Look:\n```openui\nroot = Stack([";
    expect(splitOpenUiBlocks(text)).toEqual([{ kind: "text", text }]);
    expect(hasOpenUiBlock(text)).toBe(true);
  });

  it("does not touch mermaid or svg fences", () => {
    const text = "```mermaid\nflowchart TD\n```";
    expect(hasOpenUiBlock(text)).toBe(false);
  });
});

describe("prompt", () => {
  it("teaches every component and is omitted from the system context by default", () => {
    const section = openUiPromptSection();
    for (const name of ["Stack", "Callout", "Steps", "WorkedExample", "KeyTerms", "Timeline", "Accordion", "CompareTable", "BarChart", "Flashcards", "MiniQuiz", "FollowUps"]) {
      expect(section).toContain(name);
    }
    const base = { pendingTasks: "None", upcomingExams: "None", activeContext: "x", query: "q" };
    expect(buildSystemContext(base)).not.toContain("OPENUI CARDS");
    expect(buildSystemContext({ ...base, openUiSection: section })).toContain("OPENUI CARDS");
  });
});

describe("library rendering", () => {
  beforeEach(() => document.body.replaceChildren());
  afterEach(() => document.body.replaceChildren());

  it("draws a callout and a check question that answers locally", () => {
    render(<Renderer library={askLibrary} response={CARD} isStreaming={false} />);
    expect(screen.getByText("Common mistake")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "The rate" }));
    expect(screen.getByRole("status").textContent).toContain("Right.");
    expect(screen.getByText(/not saved to your progress/i)).toBeTruthy();
  });

  it("reports unknown components instead of drawing them", () => {
    const errors: unknown[][] = [];
    render(
      <Renderer
        library={askLibrary}
        response={'root = Stack([x])\nx = Nonsense("a")'}
        isStreaming={false}
        onError={(e) => errors.push(e)}
      />,
    );
    expect(errors.flat().length).toBeGreaterThan(0);
  });
});

describe("richer components", () => {
  const FULL = `root = Stack([w, t, c, tl, a, b, f, fu])
w = WorkedExample("Solve 2x = 6.", ["Divide both sides by 2."], "x = 3")
t = KeyTerms("Words", [["Term", "Meaning"], ["Broken"]])
c = CompareTable(["A", "B"], [["a1", "b1"], ["a2"]])
tl = Timeline("Order", [["1900", "Start"], ["1950", "Middle"]])
a = Accordion([["Go deeper", "More detail."]])
b = BarChart("Scores", ["Mon", "Tue"], [40, 80], "%")
f = Flashcards([["Front one", "Back one"], ["Front two", "Back two"]])
fu = FollowUps(["Quiz me on this"])`;

  it("draws every card, dropping malformed pairs instead of half-drawing them", () => {
    render(<Renderer library={askLibrary} response={FULL} isStreaming={false} />);
    expect(screen.getByText("Worked example")).toBeTruthy();
    expect(screen.getByText("Meaning")).toBeTruthy();
    expect(screen.queryByText("Broken")).toBeNull();
    expect(screen.getByText("Start")).toBeTruthy();
    expect(screen.getByText("Go deeper")).toBeTruthy();
    expect(screen.getByText("80 %")).toBeTruthy();
  });

  it("flips and steps through flashcards", () => {
    render(<Renderer library={askLibrary} response={FULL} isStreaming={false} />);
    expect(screen.getByText("Front one")).toBeTruthy();
    fireEvent.click(screen.getByText("Front one"));
    expect(screen.getByText("Back one")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Front two")).toBeTruthy();
  });

  it("hides follow-up chips unless the surface can send, and sends the chip text", () => {
    const { unmount } = render(
      <Renderer library={askLibrary} response={FULL} isStreaming={false} />,
    );
    expect(screen.queryByRole("button", { name: "Quiz me on this" })).toBeNull();
    unmount();

    const asked: string[] = [];
    render(
      <AskContext.Provider value={(t) => asked.push(t)}>
        <Renderer library={askLibrary} response={FULL} isStreaming={false} />
      </AskContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Quiz me on this" }));
    expect(asked).toEqual(["Quiz me on this"]);
  });

  it("draws no chart when there is nothing to chart", () => {
    render(
      <Renderer
        library={askLibrary}
        response={'root = Stack([b])\nb = BarChart("Empty", ["a"], [0], "")'}
        isStreaming={false}
      />,
    );
    expect(screen.queryByText("Empty")).toBeNull();
  });
});
