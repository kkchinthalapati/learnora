import { describe, expect, it } from "vitest";
import { asSentence } from "./sentence";

describe("asSentence", () => {
  it("adds a full stop only when the text has none", () => {
    expect(asSentence("ATP")).toBe("ATP.");
    expect(asSentence("It is stored in the bonds of glucose.")).toBe(
      "It is stored in the bonds of glucose.",
    );
    expect(asSentence("Is it light?")).toBe("Is it light?");
    expect(asSentence('He said "stop."')).toBe('He said "stop."');
    expect(asSentence("  spaced  ")).toBe("spaced.");
  });
});
