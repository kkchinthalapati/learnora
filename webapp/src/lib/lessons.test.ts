import { describe, expect, it } from "vitest";
import {
  isPractised,
  lessonIcon,
  lessonTitle,
  lessonTopic,
  progressByLesson,
  progressLabel,
  progressValue,
} from "./lessons";

const card = (over: Partial<{
  material_id: string | null;
  source_material_id: string | null;
  last_reviewed_at: string | null;
  srs_interval: number;
}> = {}) => ({
  material_id: null,
  source_material_id: null,
  last_reviewed_at: null,
  srs_interval: 0,
  ...over,
});

describe("lesson progress", () => {
  it("counts a card as practised once it has a review time or an interval", () => {
    expect(isPractised(card())).toBe(false);
    expect(isPractised(card({ last_reviewed_at: "2026-10-01T00:00:00Z" }))).toBe(true);
    expect(isPractised(card({ srs_interval: 3 }))).toBe(true);
  });

  it("groups cards by lesson, from either link", () => {
    const map = progressByLesson([
      card({ material_id: "a", srs_interval: 1 }),
      card({ material_id: "a" }),
      card({ source_material_id: "b", last_reviewed_at: "x" }),
      card(),
    ]);
    expect(map.get("a")).toEqual({ total: 2, practised: 1 });
    expect(map.get("b")).toEqual({ total: 1, practised: 1 });
    expect(map.size).toBe(2);
  });

  it("says what it counts, and has no value without cards", () => {
    expect(progressValue(undefined)).toBeNull();
    expect(progressLabel(undefined)).toBe("No cards yet");
    expect(progressValue({ total: 4, practised: 1 })).toBe(0.25);
    expect(progressLabel({ total: 4, practised: 1 })).toBe("1 of 4 cards practised");
  });
});

describe("lesson naming", () => {
  it("drops a file extension from an upload's title", () => {
    expect(lessonTitle({ title: "Week 3 slides.pdf" })).toBe("Week 3 slides");
    expect(lessonTitle({ title: "Photosynthesis" })).toBe("Photosynthesis");
    expect(lessonTitle({ title: ".pdf" })).toBe(".pdf");
  });

  it("picks an icon per kind of lesson", () => {
    expect(lessonIcon("audio")).toBe("mic");
    expect(lessonIcon("unknown")).toBe("book-open");
  });
});

describe("lessonTopic", () => {
  it("takes the topic from the notes' title, without the greeting or emoji", () => {
    expect(lessonTopic({ title: "IMG_4412.jpg" }, "## 🌱 Your guide to Photosynthesis\nBody")).toBe("Photosynthesis");
    expect(lessonTopic({ title: "x.pdf" }, "## Let's break down **Newton's laws**!\n### Inertia")).toBe("Newton's laws");
    expect(lessonTopic({ title: "x.pdf" }, "## The Cold War, 1945–1991\n")).toBe("The Cold War, 1945–1991");
  });

  it("falls back to the lesson title when there are no notes or no title in them", () => {
    expect(lessonTopic({ title: "Week 3 slides.pdf" })).toBe("Week 3 slides");
    expect(lessonTopic({ title: "Week 3 slides.pdf" }, "Just a paragraph of notes.")).toBe("Week 3 slides");
    expect(lessonTopic({ title: "Cells" }, "## 🧬\nBody")).toBe("Cells");
  });
});
