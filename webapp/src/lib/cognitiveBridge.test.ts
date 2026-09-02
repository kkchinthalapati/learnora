import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CognitiveBridge,
  setPayload,
  getPayload,
  clear,
  COGNITIVE_BRIDGE_STORAGE_KEY,
  type CognitiveContextPayload,
} from "./cognitiveBridge";

describe("CognitiveBridge", () => {
  beforeEach(() => {
    CognitiveBridge.clear();
    sessionStorage.clear();
    localStorage.clear();
  });

  const samplePayload: CognitiveContextPayload = {
    subject: "Calculus",
    topic: "Chain Rule",
    concept: "Inner Function Derivative",
    sourceTool: "debugger",
    sourceId: "trace-123",
    evidencePrompt: "Forgot to multiply by inner derivative g'(x)",
    misconceptions: ["Treated inner expression as constant"],
    severity: "critical",
    suggestedAction: "teach_apprentice",
  };

  it("stores and retrieves cognitive payload via CognitiveBridge helper methods", () => {
    expect(CognitiveBridge.getPayload()).toBeNull();
    expect(CognitiveBridge.hasPayload()).toBe(false);

    CognitiveBridge.setPayload(samplePayload);

    const retrieved = CognitiveBridge.getPayload();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.subject).toBe("Calculus");
    expect(retrieved?.topic).toBe("Chain Rule");
    expect(retrieved?.concept).toBe("Inner Function Derivative");
    expect(retrieved?.sourceTool).toBe("debugger");
    expect(retrieved?.severity).toBe("critical");
    expect(retrieved?.suggestedAction).toBe("teach_apprentice");
    expect(CognitiveBridge.hasPayload()).toBe(true);
  });

  it("clears payload and resets hasPayload", () => {
    CognitiveBridge.setPayload(samplePayload);
    expect(CognitiveBridge.hasPayload()).toBe(true);

    CognitiveBridge.clear();

    expect(CognitiveBridge.getPayload()).toBeNull();
    expect(CognitiveBridge.hasPayload()).toBe(false);
  });

  it("exports standalone setPayload, getPayload, and clear functions", () => {
    expect(getPayload()).toBeNull();

    setPayload(samplePayload);
    expect(getPayload()?.topic).toBe("Chain Rule");

    clear();
    expect(getPayload()).toBeNull();
  });

  it("notifies subscribers when payload is updated or cleared", () => {
    const listener = vi.fn();
    const unsubscribe = CognitiveBridge.subscribe(listener);

    CognitiveBridge.setPayload(samplePayload);
    expect(listener).toHaveBeenCalledTimes(1);

    CognitiveBridge.clear();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    CognitiveBridge.setPayload(samplePayload);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("maps AI tools to correct target routes", () => {
    expect(CognitiveBridge.getTargetRoute("debugger")).toBe("/debugger");
    expect(CognitiveBridge.getTargetRoute("feynman")).toBe("/feynman");
    expect(CognitiveBridge.getTargetRoute("premortem")).toBe("/premortem");
  });

  it("handles storage persistence gracefully", () => {
    CognitiveBridge.setPayload(samplePayload);

    const raw = sessionStorage.getItem(COGNITIVE_BRIDGE_STORAGE_KEY) ||
      localStorage.getItem(COGNITIVE_BRIDGE_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toMatchObject({
      subject: "Calculus",
      topic: "Chain Rule",
      concept: "Inner Function Derivative",
    });
  });

  it("gracefully recovers from invalid storage JSON", () => {
    sessionStorage.setItem(COGNITIVE_BRIDGE_STORAGE_KEY, "invalid-json-{}");
    const retrieved = CognitiveBridge.getPayload();
    // Memory payload or null
    expect(retrieved === null || typeof retrieved === "object").toBe(true);
  });
});
