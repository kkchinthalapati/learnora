import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Renderer } from "@openuidev/react-lang";
import { learnCardSection, openUiPromptSection, openUiReference } from "./blocks";
import { hasOpenUiBlock, splitOpenUiBlocks } from "./fence";
import { addTermCards } from "./cardify";
import { askLibrary, guideLibrary } from "./library";
import { AskContext } from "./askContext";
import { buildSystemContext } from "../chatPrompt";
import { buildNotesSystemContext } from "../notesChatPrompt";

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

  it("still surfaces a card whose fence was cut off before it closed", () => {
    const text = 'Look:\n```openui\nroot = Stack([k])\nk = Callout("key", "Cut off.")';
    const segments = splitOpenUiBlocks(text);
    expect(segments.map((s) => s.kind)).toEqual(["text", "openui"]);
    expect(hasOpenUiBlock(text)).toBe(true);
  });

  it("accepts openui-lang fences and a bare program with no fence", () => {
    expect(hasOpenUiBlock("```openui-lang\nroot = Stack([])\n```")).toBe(true);
    const bare = 'Intro.\nroot = Stack([k])\nk = Callout("key", "Bare.")\nOutro.';
    expect(splitOpenUiBlocks(bare).map((s) => s.kind)).toEqual(["text", "openui", "text"]);
  });

  it("does not mistake ordinary prose or code for a card", () => {
    expect(hasOpenUiBlock("x = 5 is a fact.\nroot = the base of a tree")).toBe(false);
  });

  /* Audit F-02: a tutor reply showed a literal <openui> before its cards. */
  it("reads <openui> tags as a fence and leaves no tag in the text", () => {
    const text = `Here you go.\n<openui>\n${CARD}\n</openui>\nAnything else?`;
    const segments = splitOpenUiBlocks(text);
    expect(segments.map((s) => s.kind)).toEqual(["text", "openui", "text"]);
    expect(segments[1]).toEqual({ kind: "openui", code: CARD });
    const prose = segments.flatMap((s) => (s.kind === "text" ? [s.text] : [])).join("");
    expect(prose).not.toMatch(/openui/i);
  });

  /* Audit F-03: generated notes put each card in its own fence and the root
     in another, so no block could be drawn on its own. */
  it("gives each split-out card a root and drops the separate root block", () => {
    const text = [
      "Intro.",
      "```openui",
      'intro = Callout("definition", "Osmosis is water moving.")',
      "```",
      "Terms.",
      "```openui",
      'terms = KeyTerms("Key terms", [',
      '  ["Osmosis", "Water moving"]',
      "])",
      "```",
      "End.",
      "```openui",
      "root = Stack([intro, terms])",
      "```",
    ].join("\n");
    const cards = splitOpenUiBlocks(text).filter((s) => s.kind === "openui");
    expect(cards.map((c) => c.code.split("\n")[0])).toEqual([
      "root = Stack([intro])",
      "root = Stack([terms])",
    ]);
  });

  it("roots a split-out block only over cards nothing else in it holds", () => {
    const text = '```openui\ns = Stack([k])\nk = Callout("key", "One.")\n```\n```openui\nroot = Stack([s])\n```';
    const cards = splitOpenUiBlocks(text).filter((s) => s.kind === "openui");
    expect(cards).toHaveLength(1);
    expect(cards[0].code.split("\n")[0]).toBe("root = Stack([s])");
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
    expect(openUiReference()).not.toContain("ANSWER STYLE");
    expect(section).toContain(openUiReference());
    const base = { pendingTasks: "None", upcomingExams: "None", activeContext: "x", query: "q" };
    expect(buildSystemContext(base)).not.toContain("ANSWER STYLE");
    expect(buildSystemContext({ ...base, openUiSection: section })).toContain("ANSWER STYLE");
  });
});

describe("notes chat prompt", () => {
  it("carries the card section only when given one", () => {
    const base = { documentContext: "Mitosis.", query: "explain" };
    expect(buildNotesSystemContext(base)).not.toContain("ANSWER STYLE");
    expect(buildNotesSystemContext({ ...base, openUiSection: openUiPromptSection() })).toContain("ANSWER STYLE");
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

describe("study guide library", () => {
  it("cannot draw a quiz, flashcards or follow-ups, and reports them", () => {
    const errors: { code: string }[][] = [];
    render(
      <Renderer
        library={guideLibrary}
        response={'root = Stack([k, q])\nk = Callout("key", "Kept.")\nq = MiniQuiz("Q?", ["a", "b"], 0, "why")'}
        isStreaming={false}
        onError={(e) => errors.push(e)}
      />,
    );
    expect(screen.getByText("Kept.")).toBeTruthy();
    expect(screen.queryByText("Q?")).toBeNull();
    expect(errors.flat().length).toBeGreaterThan(0);
  });
});

describe("the vocabulary card built from a note", () => {
  it("parses and draws in the notes library, terms and definitions intact", () => {
    const note = [
      "### Cell transport",
      "**Osmosis** is the diffusion of water across a partially permeable membrane.",
      "- **Solute**: the substance that dissolves",
      "- **Solvent**: the liquid it dissolves in",
    ].join("\n");
    const block = splitOpenUiBlocks(addTermCards(note)).find((b) => b.kind === "openui");
    const card = block?.kind === "openui" ? block.code : "";
    expect(card).toContain("KeyTerms");
    render(<Renderer library={guideLibrary} response={card} isStreaming={false} />);
    expect(screen.getByText("Words to know")).toBeInTheDocument();
    expect(screen.getByText("Osmosis")).toBeInTheDocument();
    expect(screen.getByText("The liquid it dissolves in")).toBeInTheDocument();
  });
});

describe("lesson card section", () => {
  /* Audit F-15: Learn stated each definition and common mistake twice, once
     in prose and again in a card, because the prompt asked for both. */
  it("asks for each point once while keeping the check answerable from prose", () => {
    const section = learnCardSection();
    expect(section).toContain("Say each thing once");
    expect(section).toContain("Everything the check asks about must still be in the prose");
    expect(section).not.toContain("never put a fact only in a card");
  });
});
