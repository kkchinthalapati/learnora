import { describe, expect, it } from "vitest";
import {
  WORKED_RUNG,
  askForAnswerReply,
  buildHintPrompt,
  hintOutcome,
  leaksAnswer,
  nextRung,
  parseHintLadder,
  rungText,
  type LadderQuestion,
} from "./tutorPolicy";

const Q: LadderQuestion = {
  question: "What is the gradient of y = 3x + 2?",
  choices: ["2", "3", "5", "x"],
  correctIndex: 1,
  topic: "Straight-line graphs",
};

describe("hint ladder never gives the answer early", () => {
  it.each([
    "The answer is 3.",
    "It's B.",
    "Pick option B.",
    "The gradient here is 3, the number in front of x.",
    "The correct option is the second one.",
  ])("flags %j as a leak", (hint) => {
    expect(leaksAnswer(hint, Q)).toBe(true);
  });

  it.each([
    "In y = mx + c, which letter is the gradient?",
    "Look at the number multiplying x.",
    "",
  ])("lets %j through", (hint) => {
    expect(leaksAnswer(hint, Q)).toBe(false);
  });

  it("doesn't call it a leak when the answer text is already in the question", () => {
    const q = { ...Q, question: "Is 2 the y-intercept of y = 3x + 2?", choices: ["Yes", "No"], correctIndex: 0 };
    expect(leaksAnswer("Think about what c means in y = mx + c, it is 2 here.", { ...q, choices: ["2", "3"] })).toBe(false);
  });

  it("drops a leaking rung but keeps the worked solution", () => {
    const { ladder, dropped } = parseHintLadder(
      JSON.stringify({ nudge: "The answer is 3.", step: "Compare with y = mx + c.", worked: "m is the gradient, so it is 3." }),
      Q,
    );
    expect(dropped).toEqual(["nudge"]);
    expect(ladder).toEqual({ nudge: "", step: "Compare with y = mx + c.", worked: "m is the gradient, so it is 3." });
  });

  it("is unusable without a worked solution, or when the reply isn't JSON", () => {
    expect(parseHintLadder('{"nudge":"x","step":"y"}', Q).ladder).toBeNull();
    expect(parseHintLadder("Sorry, I can't help with that.", Q).ladder).toBeNull();
  });
});

describe("ladder order", () => {
  const ladder = { nudge: "Nudge.", step: "Step.", worked: "Worked, answer 3." };

  it("goes nudge → step → worked, and skips a dropped rung", () => {
    expect(nextRung(ladder, 0)).toBe(1);
    expect(nextRung(ladder, 1)).toBe(2);
    expect(nextRung(ladder, 2)).toBe(WORKED_RUNG);
    expect(nextRung({ ...ladder, nudge: "" }, 0)).toBe(2);
    expect(nextRung({ ...ladder, nudge: "", step: "" }, 0)).toBe(WORKED_RUNG);
    expect(rungText(ladder, 3)).toContain("answer 3");
  });

  it("only the worked rung contains the answer in a good ladder", () => {
    for (const r of [1, 2] as const) expect(leaksAnswer(rungText(ladder, r), Q)).toBe(false);
  });
});

describe("asking for the answer is never refused", () => {
  it.each([1, 2, 3] as const)("offers the next rung (%i)", (next) => {
    const reply = askForAnswerReply(next);
    expect(reply).not.toMatch(/\b(can't|cannot|won't|not allowed|unable)\b/i);
    expect(reply.length).toBeGreaterThan(20);
  });

  it("the prompt tells the model not to quote the answer before the worked step", () => {
    const prompt = buildHintPrompt(Q, "Year 9");
    expect(prompt).toMatch(/"nudge".*do not say which choice is right/i);
    expect(prompt).toContain("Year 9");
  });
});

describe("hints and scoring", () => {
  it("a clean right answer counts and earns a correction", () => {
    expect(hintOutcome(0, true)).toEqual({ countsCorrect: true, correctionCredit: true });
  });
  it("a hinted right answer counts in the score but earns no correction", () => {
    expect(hintOutcome(2, true)).toEqual({ countsCorrect: true, correctionCredit: false });
  });
  it("the full ladder counts as wrong", () => {
    expect(hintOutcome(3, true)).toEqual({ countsCorrect: false, correctionCredit: false });
  });
});
