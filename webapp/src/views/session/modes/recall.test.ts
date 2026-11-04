import { describe, expect, it } from "vitest";
import { checkRecall, isOverrated } from "./recall";

describe("checkRecall", () => {
  const back = "The diffusion of water across a partially permeable membrane";

  it("finds every key word in a full answer, with word-form slack", () => {
    const check = checkRecall("water diffuses across a partially permeable membrane", back);
    expect(check?.missed).toEqual([]);
    expect(check?.suggested).toBe(3);
  });

  it("names what a partial answer left out", () => {
    const check = checkRecall("water moving through a membrane", back);
    expect(check?.missed).toEqual(["diffusion", "partially", "permeable"]);
    expect(check?.suggested).toBe(2);
  });

  it("suggests Forgot when the answer shares almost nothing with the card", () => {
    expect(checkRecall("something about cells", back)?.suggested).toBe(1);
  });

  it("matches short answers and numbers exactly", () => {
    expect(checkRecall("mitochondria", "Mitochondria")?.suggested).toBe(3);
    expect(checkRecall("12", "120")?.suggested).toBe(1);
    expect(checkRecall("evaporation", "Evaporate")?.suggested).toBe(3);
  });

  it("checks nothing without a typed answer or key words", () => {
    expect(checkRecall(undefined, back)).toBeNull();
    expect(checkRecall("   ", back)).toBeNull();
    expect(checkRecall("yes", "Yes")).toBeNull();
  });
});

describe("isOverrated", () => {
  it("flags only a Got it the answer doesn't support", () => {
    const weak = checkRecall("cells", "The diffusion of water across a partially permeable membrane");
    expect(isOverrated(weak, 3)).toBe(true);
    expect(isOverrated(weak, 2)).toBe(false);
    expect(isOverrated(null, 3)).toBe(false);
  });
});
