import { beforeEach, describe, expect, it } from "vitest";
import { clearGuide, fingerprint, loadGuide, saveGuide } from "./guideCache";

describe("guideCache", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a guide and notices when the note has changed", () => {
    saveGuide("m1", "Mitosis has four phases.", "root = Stack([])");
    const stored = loadGuide("m1");
    expect(stored?.code).toBe("root = Stack([])");
    expect(stored?.fingerprint).toBe(fingerprint("Mitosis has four phases."));
    expect(stored?.fingerprint).not.toBe(fingerprint("Mitosis has five phases."));
  });

  it("keeps guides per material and can clear one", () => {
    saveGuide("m1", "a", "one");
    saveGuide("m2", "b", "two");
    clearGuide("m1");
    expect(loadGuide("m1")).toBeNull();
    expect(loadGuide("m2")?.code).toBe("two");
  });
});
