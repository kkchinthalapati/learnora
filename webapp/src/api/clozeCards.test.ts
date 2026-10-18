import { describe, expect, it } from "vitest";
import { CLOZE_BLANK, clozeFront } from "./aiInlineActions";

describe("clozeFront", () => {
  it("blanks the marked phrase inside its sentence, matching any case", () => {
    expect(
      clozeFront({ sentence: "Enzymes lower the Activation Energy of a reaction.", answer: "activation energy" }),
    ).toBe(`Enzymes lower the ${CLOZE_BLANK} of a reaction.`);
  });

  it("asks for the phrase after the sentence when it is not found in it", () => {
    expect(clozeFront({ sentence: "Rate rises with heat.", answer: "denature" })).toBe(
      `Rate rises with heat. (${CLOZE_BLANK})`,
    );
  });
});
