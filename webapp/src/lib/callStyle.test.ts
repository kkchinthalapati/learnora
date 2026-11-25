import { beforeEach, describe, expect, it } from "vitest";
import {
  CALL_MODES,
  CALL_PERSONAS,
  DEFAULT_CALL_STYLE,
  callOpener,
  callSettingsPersona,
  loadCallStyle,
  saveCallStyle,
  spokenCallRules,
} from "./callStyle";

beforeEach(() => window.localStorage.clear());

describe("spokenCallRules", () => {
  it("carries the chosen personality and call type, and keeps the facts fixed", () => {
    const rules = spokenCallRules({ persona: "strict", mode: "discuss" });
    expect(rules).toContain("PERSONALITY (Strict coach)");
    expect(rules).toContain("WHAT THIS CALL IS (Discuss it)");
    expect(rules).toMatch(/conversation ABOUT the topic/);
    expect(rules).toMatch(/never what is true/);
  });

  it("has a rule and an opener for every combination", () => {
    for (const persona of CALL_PERSONAS) {
      for (const mode of CALL_MODES) {
        expect(spokenCallRules({ persona, mode }).length).toBeGreaterThan(200);
        expect(callOpener({ persona, mode }, "osmosis")).toContain("osmosis");
      }
    }
  });

  it("maps each personality onto an app persona the server knows", () => {
    expect(callSettingsPersona("strict")).toBe("coach");
    expect(callSettingsPersona("chatty")).toBe("buddy");
    expect(callSettingsPersona("professor")).toBe("professor");
  });
});

describe("call style storage", () => {
  it("defaults to a chatty discussion and remembers a choice", () => {
    expect(loadCallStyle()).toEqual(DEFAULT_CALL_STYLE);
    saveCallStyle({ persona: "calm", mode: "quiz" });
    expect(loadCallStyle()).toEqual({ persona: "calm", mode: "quiz" });
  });

  it("ignores values it doesn't know", () => {
    window.localStorage.setItem(
      "learnora:call-style:v1",
      JSON.stringify({ persona: "evil", mode: "quiz" }),
    );
    expect(loadCallStyle()).toEqual({ persona: "chatty", mode: "quiz" });
  });
});
