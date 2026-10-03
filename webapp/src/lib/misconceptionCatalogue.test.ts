import { describe, expect, it } from "vitest";
import {
  MISCONCEPTION_CATALOGUE,
  detectFromDiagnosis,
  detectFromExplanation,
  detectFromWrongAnswer,
  getKnownMisconception,
} from "./misconceptionCatalogue";

describe("catalogue integrity", () => {
  it("has unique ids and at least 40 entries across four subjects", () => {
    const ids = MISCONCEPTION_CATALOGUE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(40);
    expect(new Set(MISCONCEPTION_CATALOGUE.map((e) => e.subject))).toEqual(
      new Set(["Biology", "Chemistry", "Physics", "Mathematics"]),
    );
  });

  for (const entry of MISCONCEPTION_CATALOGUE) {
    it(`${entry.id} has a well-formed check and cues`, () => {
      const { check } = entry;
      expect(check.choices.length).toBeGreaterThanOrEqual(3);
      expect(check.correctIndex).toBeGreaterThanOrEqual(0);
      expect(check.correctIndex).toBeLessThan(check.choices.length);
      expect(new Set(check.choices).size).toBe(check.choices.length);
      expect(entry.context.length).toBeGreaterThan(0);
      expect(entry.cues.length).toBeGreaterThan(0);
      for (const phrase of [...entry.context, ...entry.cues]) expect(phrase).toBe(phrase.toLowerCase());
      // The check's own right answer must not read as the belief.
      expect(
        detectFromWrongAnswer({
          question: check.question,
          chosen: check.choices[check.correctIndex],
          correct: check.choices[check.correctIndex],
        }),
      ).toBeNull();
    });
  }
});

describe("detectFromWrongAnswer", () => {
  it.each([
    [
      "In osmosis, which particles move across the membrane?",
      "Salt moves from the concentrated side",
      "Water molecules",
      "bio-osmosis-solute-moves",
    ],
    [
      "Why are antibiotics not prescribed for flu?",
      "Antibiotics kill the flu virus quickly",
      "Flu is caused by a virus",
      "bio-antibiotics-viruses",
    ],
    [
      "How should a doctor treat measles, a viral infection?",
      "Prescribe antibiotics",
      "Treat the symptoms; antibiotics do not work on viruses",
      null,
    ],
    [
      "How should a doctor treat measles, a viral infection?",
      "Prescribe antibiotics",
      "Rest and painkillers to treat symptoms",
      "bio-antibiotics-viruses",
    ],
    [
      "What happens to an enzyme at 80°C?",
      "The enzyme is killed",
      "It is denatured",
      "bio-enzymes-killed",
    ],
    [
      "Ignoring air resistance, which hits the ground first when dropped?",
      "The heavier ball",
      "Both at the same time",
      "phys-heavier-falls-faster",
    ],
    [
      "A fair dice has not shown a six in 10 rolls. The probability of a six next is…",
      "More likely than 1/6",
      "1/6",
      "maths-gamblers-fallacy",
    ],
  ])("%s / picked %s", (question, chosen, correct, expected) => {
    expect(detectFromWrongAnswer({ question, chosen, correct })?.id ?? null).toBe(expected);
  });

  it("needs the question to be in the entry's territory", () => {
    // "killed" in a history question is not about enzymes
    expect(
      detectFromWrongAnswer({
        question: "Which king was killed at Bosworth?",
        chosen: "Henry was killed",
        correct: "Richard III",
      }),
    ).toBeNull();
  });

  it("does not fire on a wrong answer that does not state the belief", () => {
    expect(
      detectFromWrongAnswer({
        question: "In osmosis, which particles move across the membrane?",
        chosen: "Protein molecules",
        correct: "Water molecules",
      }),
    ).toBeNull();
  });

  it("uses the topic as territory", () => {
    expect(
      detectFromWrongAnswer({
        question: "Which statement is correct?",
        topic: "Catalysts",
        chosen: "The catalyst is used up",
        correct: "It lowers the activation energy",
      })?.id,
    ).toBe("chem-catalyst-used-up");
  });
});

describe("detectFromDiagnosis", () => {
  it("matches a model's diagnosis to the catalogue", () => {
    expect(
      detectFromDiagnosis("Plant respiration", "Thinks plants only respire at night")?.id,
    ).toBe("bio-plants-dont-respire");
    expect(detectFromDiagnosis("Isotopes", "Believes isotopes have a different number of protons")?.id).toBe(
      "chem-isotopes-protons",
    );
  });

  it("returns null for a diagnosis outside the catalogue", () => {
    expect(detectFromDiagnosis("Quadratic formula", "Forgets the minus sign on b")).toBeNull();
  });

  it("looks entries up by id", () => {
    expect(getKnownMisconception("phys-mass-weight")?.subject).toBe("Physics");
    expect(getKnownMisconception("nope")).toBeNull();
  });
});

describe("detectFromExplanation", () => {
  it("finds a belief the student states while teaching", () => {
    expect(
      detectFromExplanation("Respiration is basically breathing, you breathe in oxygen", "Respiration")?.id,
    ).toBe("bio-respiration-is-breathing");
    expect(
      detectFromExplanation("In osmosis the salt moves to where there is less of it", "Osmosis")?.id,
    ).toBe("bio-osmosis-solute-moves");
  });

  it("ignores a cue the student negates", () => {
    expect(detectFromExplanation("Respiration is not breathing, it's a reaction in cells", "Respiration")).toBeNull();
    expect(detectFromExplanation("Respiration isn't breathing", "Respiration")).toBeNull();
    expect(detectFromExplanation("Enzymes can't be killed because they aren't alive", "Enzymes")).toBeNull();
  });

  it("needs the topic or text to be in the entry's territory", () => {
    expect(detectFromExplanation("The king was killed in battle", "The Wars of the Roses")).toBeNull();
  });
});
