import { beforeEach, describe, expect, it } from "vitest";
import { importLegacySession, sessionFromParams } from "./useStudySession";
import { CognitiveBridge } from "../lib/cognitiveBridge";
import { saveFeynmanSession } from "../api/aiFeynman";
import type { Misconception } from "../lib/misconceptions";

const ledgerRow = {
  id: "m1",
  subject: "Biology",
  concept: "Where ATP synthase sits",
  summary: "ATP synthase placed in the outer membrane.",
  lastSeenAt: "2026-09-12T10:00:00Z",
} as Misconception;

beforeEach(() => {
  localStorage.clear();
  CognitiveBridge.clear();
});

describe("sessionFromParams", () => {
  it("needs an objective, except for mixed recall", () => {
    expect(sessionFromParams(new URLSearchParams("mode=explain"), [])).toBeNull();
    expect(sessionFromParams(new URLSearchParams("mode=recall&minutes=10"), [])).toMatchObject({
      objective: "Mixed recall",
      minutes: 10,
    });
  });

  it("reads mode, topic and the exam-traps / voice / time-box options", () => {
    const s = sessionFromParams(
      new URLSearchParams("mode=practice&topic=Osmosis&preset=traps&minutes=10"),
      [],
    )!;
    expect(s).toMatchObject({ mode: "practice", objective: "Osmosis", preset: "traps", minutes: 10, status: "active" });
    expect(sessionFromParams(new URLSearchParams("mode=socratic&topic=x&voice=1"), [])!.voice).toBe(true);
  });

  it("falls back to Explain for an unknown mode", () => {
    expect(sessionFromParams(new URLSearchParams("mode=nope&topic=x"), [])!.mode).toBe("explain");
  });

  it("watches for the ledger's misconception when one is named", () => {
    const s = sessionFromParams(new URLSearchParams("mode=socratic&misconception=m1"), [ledgerRow])!;
    expect(s.objective).toBe("Where ATP synthase sits");
    expect(s.subject).toBe("Biology");
    expect(s.watchingFor).toEqual({
      id: "m1",
      text: "ATP synthase placed in the outer membrane.",
      seenAt: "2026-09-12T10:00:00Z",
    });
  });

  it("takes the topic from a CognitiveBridge handoff (Open as session)", () => {
    CognitiveBridge.setPayload({ subject: "Chemistry", topic: "Buffers", sourceTool: "notes" });
    const s = sessionFromParams(new URLSearchParams("mode=explain"), [])!;
    expect(s).toMatchObject({ objective: "Buffers", subject: "Chemistry" });
  });
});

describe("importLegacySession", () => {
  it("opens an old Feynman studio session in Teach with its transcript", () => {
    saveFeynmanSession({
      id: "f1",
      subject: "Biology",
      topic: "Osmosis",
      persona: "eli10",
      difficulty: "intermediate",
      draft: { learningObjectives: ["Water moves", "Down a gradient"] } as never,
      turns: [],
      currentScore: 40,
      status: "active",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
    });
    const s = importLegacySession("f1")!;
    expect(s).toMatchObject({ id: "f1", mode: "teach", objective: "Osmosis", status: "active" });
    expect(s.plan.map((p) => p.label)).toEqual(["Water moves", "Down a gradient"]);
    expect(importLegacySession("nope")).toBeNull();
  });
});
