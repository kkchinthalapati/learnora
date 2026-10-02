import { describe, expect, it } from "vitest";
import { getSpec } from "../syllabus";
import {
  contentHash,
  convertOakLessons,
  convertOakQuestion,
  seedRows,
  specForOakProgramme,
  toSqlInsert,
  type OakQuestion,
} from "./build";
import { LEARNORA_SEED } from "./seed";

const bio = getSpec("aqa-gcse-biology-8461")!;

function mcq(question: string, answers: [string, boolean][]): OakQuestion {
  return {
    question,
    questionType: "multiple-choice",
    answers: answers.map(([content, correct]) => ({ type: "text", content, distractor: !correct })),
  };
}

const lesson = { lessonSlug: "photosynthesis-and-limiting-factors", lessonTitle: "Photosynthesis and limiting factors" };

describe("contentHash", () => {
  it("is stable, case- and order-insensitive", async () => {
    const a = await contentHash("What is X?", ["One", "Two"]);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await contentHash("  what is x? ", ["two", "ONE"])).toBe(a);
    expect(await contentHash("What is Y?", ["One", "Two"])).not.toBe(a);
  });
});

describe("seedRows", () => {
  it("turns the seed into rows with hashes and the Learnora licence", async () => {
    const rows = await seedRows(LEARNORA_SEED);
    expect(rows.length).toBe(Object.values(LEARNORA_SEED).flat().length);
    expect(new Set(rows.map((r) => r.content_hash)).size).toBe(rows.length);
    expect(rows.every((r) => r.source === "learnora" && r.licence === "learnora")).toBe(true);
    expect(rows.find((r) => r.spec_key === "gcse-maths")).toBeDefined();
  });
});

describe("specForOakProgramme", () => {
  it("maps KS4 AQA sciences and every board's maths", () => {
    expect(specForOakProgramme({ keystageSlug: "ks4", subjectSlug: "biology", examboardSlug: "aqa", tierSlug: "higher" })?.id).toBe(
      "aqa-gcse-biology-8461",
    );
    expect(specForOakProgramme({ keystageSlug: "ks4", subjectSlug: "maths", examboardSlug: null, tierSlug: "foundation" })?.questionBankKey).toBe(
      "gcse-maths",
    );
  });

  it("skips other boards, combined science and other key stages", () => {
    expect(specForOakProgramme({ keystageSlug: "ks4", subjectSlug: "biology", examboardSlug: "edexcel", tierSlug: null })).toBeNull();
    expect(specForOakProgramme({ keystageSlug: "ks4", subjectSlug: "combined-science", examboardSlug: "aqa", tierSlug: null })).toBeNull();
    expect(specForOakProgramme({ keystageSlug: "ks3", subjectSlug: "maths", examboardSlug: null, tierSlug: null })).toBeNull();
  });
});

describe("convertOakQuestion", () => {
  it("keeps a clean single-answer MCQ, mapped to the lesson's spec topic, with attribution", async () => {
    const result = await convertOakQuestion(
      mcq("Which gas is produced by photosynthesis?", [["Oxygen", true], ["Carbon dioxide", false], ["Nitrogen", false]]),
      lesson,
      bio,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toMatchObject({
      source: "oak",
      source_ref: lesson.lessonSlug,
      licence: "OGL-3.0",
      spec_key: "aqa-gcse-biology-8461",
      topic_ref: "4.4.1",
      correct_index: 0,
      tier: null,
    });
    expect(result.row.attribution).toContain("Open Government Licence v3.0");
    expect(result.row.attribution).toContain(lesson.lessonTitle);
  });

  it.each([
    [{ ...mcq("Q?", [["A", true], ["B", false]]), questionType: "short-answer" }, "not multiple choice"],
    [mcq("Pick two?", [["A", true], ["B", true], ["C", false]]), "not exactly one correct answer"],
    [mcq("None right?", [["A", false], ["B", false]]), "not exactly one correct answer"],
    [mcq("Only one?", [["A", true]]), "too few or too many answers"],
    [mcq("Look at the diagram below. Which part is the nucleus?", [["A", true], ["B", false]]), "refers to a visual"],
    [{ ...mcq("Which?", [["A", true], ["B", false]]), questionImage: { url: "x" } }, "uses an image"],
    [mcq("Which {{blank}} fits?", [["A", true], ["B", false]]), "contains markup"],
  ] as [OakQuestion, string][])("skips %#: %s", async (q, reason) => {
    expect(await convertOakQuestion(q, lesson, bio)).toEqual({ ok: false, reason });
  });

  it("does not treat 'periodic table' as a visual", async () => {
    const chem = getSpec("aqa-gcse-chemistry-8462")!;
    const result = await convertOakQuestion(
      mcq("Where are the alkali metals in the periodic table?", [["Group 1", true], ["Group 7", false]]),
      { lessonSlug: "x", lessonTitle: "The periodic table" },
      chem,
    );
    expect(result.ok).toBe(true);
  });

  it("falls back to the question text when the lesson title matches nothing, and skips when neither does", async () => {
    const byText = await convertOakQuestion(
      mcq("What does osmosis move across a membrane?", [["Water", true], ["Salt", false]]),
      { lessonSlug: "x", lessonTitle: "Review lesson 3" },
      bio,
    );
    expect(byText.ok && byText.row.topic_ref).toBe("4.1.3");
    expect(
      await convertOakQuestion(mcq("Who wrote Macbeth?", [["Shakespeare", true], ["Dickens", false]]), { lessonSlug: "x", lessonTitle: "Review" }, bio),
    ).toEqual({ ok: false, reason: "no matching spec topic" });
  });

  it("pins a question on a tier-only topic to that tier", async () => {
    const result = await convertOakQuestion(
      mcq("What is a hybridoma?", [["A fused lymphocyte and tumour cell", true], ["A virus", false]]),
      { lessonSlug: "x", lessonTitle: "Monoclonal antibodies" },
      bio,
    );
    expect(result.ok && result.row.tier).toBe("Higher");
  });
});

describe("convertOakLessons", () => {
  it("de-duplicates across lessons and counts what it skipped", async () => {
    const q = mcq("Which gas is produced by photosynthesis?", [["Oxygen", true], ["Carbon dioxide", false]]);
    const report = await convertOakLessons(
      [
        { ...lesson, exitQuiz: [q], starterQuiz: [mcq("Pick two?", [["A", true], ["B", true]])] },
        { ...lesson, lessonSlug: "again", exitQuiz: [q], starterQuiz: [] },
      ],
      bio,
    );
    expect(report.rows).toHaveLength(1);
    expect(report.skipped).toEqual({ duplicate: 1, "not exactly one correct answer": 1 });
  });
});

describe("toSqlInsert", () => {
  it("escapes quotes and is idempotent on (source, content_hash)", async () => {
    const [row] = await seedRows({ "gcse-maths": [{ ref: "S1-S6", q: "What's the mode?", c: ["It's 3", "4"], a: 0, why: "Most common value." }] });
    const sql = toSqlInsert([row]);
    expect(sql).toContain("'What''s the mode?'");
    expect(sql).toContain(`'["It''s 3","4"]'::jsonb`);
    expect(sql).toContain("on conflict (source, content_hash) do nothing");
    expect(toSqlInsert([])).toBe("");
  });
});
