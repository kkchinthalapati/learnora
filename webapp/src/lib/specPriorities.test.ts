import { describe, expect, it } from "vitest";
import { getSpec } from "./syllabus";
import { nextSpecTopics, prioritiseSpecTopics, specCoverage } from "./specPriorities";
import type { TopicEvidence } from "./studentEvidence";

const bio = getSpec("aqa-gcse-biology-8461")!;

function ev(topic: string, answered: number, correct: number): TopicEvidence {
  return {
    topic,
    answered,
    correct,
    accuracy: Math.round((correct / answered) * 100),
    provisional: answered < 4,
  };
}

describe("prioritiseSpecTopics", () => {
  it("maps quiz topics onto spec sections and pools their answers", () => {
    const rows = prioritiseSpecTopics(bio, "Higher", [
      ev("Photosynthesis", 6, 2),
      ev("Limiting factors", 4, 2),
    ]);
    const photo = rows.find((r) => r.topic.ref === "4.4.1")!;
    expect(photo.answered).toBe(10);
    expect(photo.accuracy).toBe(40);
    expect(photo.status).toBe("weak");
    expect(photo.evidence.map((e) => e.topic)).toEqual(["Photosynthesis", "Limiting factors"]);
  });

  it("ranks a measured weakness above untested and secure topics", () => {
    const rows = prioritiseSpecTopics(bio, "Higher", [
      ev("Respiration", 10, 3),
      ev("Osmosis", 10, 10),
    ]);
    expect(rows[0].topic.ref).toBe("4.4.2");
    const osmosis = rows.find((r) => r.topic.ref === "4.1.3")!;
    expect(osmosis.status).toBe("secure");
    expect(rows.indexOf(osmosis)).toBe(rows.length - 1);
  });

  it("keeps untested topics untested rather than scoring them", () => {
    const rows = prioritiseSpecTopics(bio, "Higher", []);
    expect(rows.every((r) => r.status === "untested" && r.accuracy === null)).toBe(true);
    // ties fall back to spec order
    expect(rows[0].topic.ref).toBe("4.1.1");
  });

  it("treats a few answers as provisional", () => {
    const [top] = prioritiseSpecTopics(bio, "Higher", [ev("Ecosystems food chains", 2, 0)]);
    const row = prioritiseSpecTopics(bio, "Higher", [ev("Ecosystems food chains", 2, 0)]).find(
      (r) => r.topic.ref === "4.7.2",
    )!;
    expect(row.provisional).toBe(true);
    expect(row.status).toBe("developing");
    expect(row.need).toBeLessThan(1);
    expect(top.topic.ref).toBe("4.7.2");
  });

  it("raises a topic with an open misconception, but not a resolved one", () => {
    const open = prioritiseSpecTopics(bio, "Higher", [], [
      { concept: "Photosynthesis", status: "open" },
    ]);
    expect(open[0].topic.ref).toBe("4.4.1");
    expect(open[0].openMisconceptions).toBe(1);
    const resolved = prioritiseSpecTopics(bio, "Higher", [], [
      { concept: "Photosynthesis", status: "resolved" },
    ]);
    expect(resolved.find((r) => r.topic.ref === "4.4.1")!.openMisconceptions).toBe(0);
  });

  it("weights by the exam: a heavier topic outranks an equally weak lighter one", () => {
    const maths = getSpec("aqa-gcse-maths-8300")!;
    // Higher: Algebra 30% over 4 topics (7.5 each); Probability 7.5% (one of two ProbStats topics)
    const rows = prioritiseSpecTopics(maths, "Higher", [
      ev("Tree diagrams", 10, 3),
      ev("Simultaneous equations", 10, 3),
    ]);
    const solving = rows.findIndex((r) => r.topic.ref === "A17-A22");
    const prob = rows.findIndex((r) => r.topic.ref === "P1-P9");
    expect(rows[solving].priority).toBeCloseTo(rows[prob].priority);
    const foundation = prioritiseSpecTopics(maths, "Foundation", [
      ev("Compound interest", 10, 3),
      ev("Simultaneous equations", 10, 3),
    ]);
    // Foundation: Ratio 25% / 2 topics = 12.5 beats Algebra 20% / 4 = 5
    expect(foundation[0].topic.ref).toBe("R9-R16");
  });
});

describe("nextSpecTopics and specCoverage", () => {
  it("skips secure topics and reports how much of the spec evidence touches", () => {
    const rows = prioritiseSpecTopics(bio, "Foundation", [ev("Osmosis", 10, 10), ev("Respiration", 10, 2)]);
    const next = nextSpecTopics(rows, 3);
    expect(next.map((r) => r.topic.ref)).not.toContain("4.1.3");
    expect(next[0].topic.ref).toBe("4.4.2");
    expect(specCoverage(rows)).toBe(Math.round((2 / rows.length) * 100));
  });
});
