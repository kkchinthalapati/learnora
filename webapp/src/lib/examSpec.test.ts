import { describe, expect, it } from "vitest";
import type { Exam } from "../api/types";
import { pickExamSpec, upcomingSpecExams } from "./examSpec";

const TODAY = "2026-10-02";

function exam(overrides: Partial<Exam>): Exam {
  return {
    id: Math.floor(Math.random() * 1e6),
    user_id: "u",
    exam_name: "Exam",
    exam_date: "2026-12-01",
    difficulty: "Medium",
    status: "Scheduled",
    ...overrides,
  };
}

describe("upcomingSpecExams", () => {
  it("keeps only future, unfinished exams with a known spec, soonest first", () => {
    const list = upcomingSpecExams(
      [
        exam({ syllabus_id: "aqa-gcse-biology-8461", exam_date: "2026-12-10" }),
        exam({ syllabus_id: "aqa-gcse-physics-8463", exam_date: "2026-11-10" }),
        exam({ syllabus_id: "aqa-gcse-chemistry-8462", exam_date: "2026-01-01" }),
        exam({ syllabus_id: "aqa-gcse-maths-8300", status: "Completed" }),
        exam({ syllabus_id: "unknown-spec" }),
        exam({}),
      ],
      TODAY,
    );
    expect(list.map((m) => m.spec.id)).toEqual(["aqa-gcse-physics-8463", "aqa-gcse-biology-8461"]);
  });

  it("drops a tier the spec does not have", () => {
    const [m] = upcomingSpecExams([exam({ syllabus_id: "ib-biology-2025", syllabus_tier: "Higher" })], TODAY);
    expect(m.tier).toBeNull();
  });
});

describe("pickExamSpec", () => {
  const bio = exam({ syllabus_id: "aqa-gcse-biology-8461", syllabus_tier: "Higher", exam_date: "2026-12-10" });
  const maths = exam({ syllabus_id: "aqa-gcse-maths-8300", syllabus_tier: "Higher", exam_date: "2026-11-10" });

  it("routes a topic to the exam whose spec covers it", () => {
    expect(pickExamSpec([bio, maths], TODAY, "Osmosis")?.spec.id).toBe("aqa-gcse-biology-8461");
    expect(pickExamSpec([bio, maths], TODAY, "Simultaneous equations")?.spec.id).toBe("aqa-gcse-maths-8300");
    expect(pickExamSpec([bio, maths], TODAY, "Osmosis")?.topic?.ref).toBe("4.1.3");
  });

  it("does not pin a topic no spec covers", () => {
    expect(pickExamSpec([bio, maths], TODAY, "The Cold War")).toBeNull();
  });

  it("without a topic, speaks only when there is a single spec exam", () => {
    expect(pickExamSpec([bio], TODAY)?.spec.id).toBe("aqa-gcse-biology-8461");
    expect(pickExamSpec([bio, maths], TODAY)).toBeNull();
    expect(pickExamSpec([], TODAY, "Osmosis")).toBeNull();
  });

  it("prefers the exam the label names when a topic is in two specs", () => {
    const chem = exam({ syllabus_id: "aqa-gcse-chemistry-8462", exam_date: "2026-11-01" });
    const phys = exam({ syllabus_id: "aqa-gcse-physics-8463", exam_date: "2026-11-02" });
    expect(pickExamSpec([chem, phys], TODAY, "Physics: isotopes")?.spec.id).toBe("aqa-gcse-physics-8463");
    expect(pickExamSpec([chem, phys], TODAY, "Chemistry: isotopes")?.spec.id).toBe("aqa-gcse-chemistry-8462");
  });
});
