import { describe, expect, it } from "vitest";
import {
  EMPTY_PERSONA_DRIFT,
  getPersonaDriftNudge,
  observePersonaDrift,
} from "./personaDrift";

describe("persona drift", () => {
  it("tracks re-asks and follow-up questions without retaining raw text", () => {
    const next = observePersonaDrift(
      observePersonaDrift(EMPTY_PERSONA_DRIFT, "Explain photosynthesis"),
      "Can you explain photosynthesis?",
    );
    expect(next.reasks).toBe(0);
    expect(next.followUps).toBe(1);
    expect(next.queries[0]).toBe("explain photosynthesis");
    expect(next.queries).not.toContain("Explain photosynthesis");
  });

  it("nudges toward a simpler answer after repeated confusion", () => {
    let state = EMPTY_PERSONA_DRIFT;
    for (const query of ["Explain this", "again", "I still don't understand"]) {
      state = observePersonaDrift(state, query);
    }
    const nudge = getPersonaDriftNudge(state);
    expect(nudge?.conciseness).toBe("short");
    expect(nudge?.instruction).toContain("one small next step");
  });

  it("nudges toward depth for engaged follow-ups", () => {
    let state = EMPTY_PERSONA_DRIFT;
    for (const query of [
      "How does cellular respiration connect to the mitochondria in this process?",
      "Why does that change the energy output of the cell?",
      "Can you compare that with photosynthesis and explain the tradeoff?",
    ]) {
      state = observePersonaDrift(state, query);
    }
    expect(getPersonaDriftNudge(state)?.conciseness).toBe("detailed");
  });
});
