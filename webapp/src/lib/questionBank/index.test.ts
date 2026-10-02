import { describe, expect, it } from "vitest";
import { attributionLines, pickPractice, toQuizQuestions, type BankQuestion } from ".";

function row(id: string, topic: string, source: "learnora" | "oak" = "learnora"): BankQuestion {
  return {
    id,
    source,
    source_ref: null,
    licence: source === "oak" ? "OGL-3.0" : "learnora",
    attribution: source === "oak" ? "From Oak. OGL v3.0." : null,
    spec_key: "gcse-maths",
    topic_ref: topic,
    tier: null,
    question: `Q ${id}`,
    choices: ["a", "b", "c"],
    correct_index: 1,
    explanation: `Because ${id}`,
  };
}

describe("pickPractice", () => {
  const rows = [row("a1", "A"), row("a2", "A"), row("a3", "A"), row("b1", "B"), row("c1", "C")];

  it("round-robins across topics in priority order", () => {
    const picked = pickPractice(rows, ["B", "A"], 4, () => 0);
    expect(picked.map((r) => r.topic_ref)).toEqual(["B", "A", "C", "A"]);
  });

  it("stops when it runs out", () => {
    expect(pickPractice(rows, ["A"], 50)).toHaveLength(5);
    expect(pickPractice([], ["A"], 5)).toEqual([]);
  });
});

describe("toQuizQuestions and attributionLines", () => {
  it("names the spec section as the topic and keeps the explanation as feedback", () => {
    const [q] = toQuizQuestions([row("x", "A17-A22")], (ref) => (ref === "A17-A22" ? "Solving equations" : ref));
    expect(q).toMatchObject({ id: "x", topic: "Solving equations", correctIndex: 1, feedback: "Because x" });
  });

  it("credits Oak once, and Learnora's own questions not at all", () => {
    expect(attributionLines([row("1", "A", "oak"), row("2", "A", "oak"), row("3", "A")])).toEqual(["From Oak. OGL v3.0."]);
    expect(attributionLines([row("3", "A")])).toEqual([]);
  });
});
