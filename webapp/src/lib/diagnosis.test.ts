import { describe, expect, it } from "vitest";
import { diagnoseWrongAnswer, SLIP_MAX_SECONDS, type WrongAnswerSignals } from "./diagnosis";

const base: WrongAnswerSignals = {
  namedBelief: false,
  confidence: null,
  secondsSpent: 40,
  topicSecure: false,
  earlierMissesThisSitting: 0,
  hasPrerequisites: true,
};

describe("diagnoseWrongAnswer", () => {
  it("ranks a confidently held belief highest, and a guessed one lowest", () => {
    expect(diagnoseWrongAnswer({ ...base, namedBelief: true, confidence: "certain" })).toEqual({
      reading: "misconception",
      severity: "critical",
      checkPrerequisite: false,
    });
    expect(diagnoseWrongAnswer({ ...base, namedBelief: true, confidence: "guess" }).severity).toBe("minor");
    expect(diagnoseWrongAnswer({ ...base, namedBelief: true }).severity).toBe("moderate");
  });

  it("writes nothing for a quick miss on a secure topic — a likely slip", () => {
    const d = diagnoseWrongAnswer({ ...base, topicSecure: true, secondsSpent: SLIP_MAX_SECONDS - 5 });
    expect(d.reading).toBe("possible-slip");
    expect(d.severity).toBeNull();
  });

  it("never calls it a slip when the student guessed, took long, or missed before", () => {
    expect(diagnoseWrongAnswer({ ...base, topicSecure: true, secondsSpent: 10, confidence: "guess" }).reading).not.toBe("possible-slip");
    expect(diagnoseWrongAnswer({ ...base, topicSecure: true, secondsSpent: 120 }).reading).not.toBe("possible-slip");
    expect(diagnoseWrongAnswer({ ...base, topicSecure: true, secondsSpent: 10, earlierMissesThisSitting: 1 }).reading).not.toBe("possible-slip");
    expect(diagnoseWrongAnswer({ ...base, topicSecure: true, secondsSpent: 10, workedSolution: true }).reading).not.toBe("possible-slip");
  });

  it("points at the prerequisite after a second miss on the same topic", () => {
    const d = diagnoseWrongAnswer({ ...base, earlierMissesThisSitting: 1 });
    expect(d).toEqual({ reading: "prerequisite-gap", severity: "moderate", checkPrerequisite: true });
    expect(diagnoseWrongAnswer({ ...base, earlierMissesThisSitting: 1, hasPrerequisites: false }).reading).toBe("gap");
  });
});
