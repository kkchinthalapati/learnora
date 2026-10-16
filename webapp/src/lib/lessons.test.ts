import { describe, expect, it } from "vitest";
import {
  isPractised,
  lessonIcon,
  lessonTitle,
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
