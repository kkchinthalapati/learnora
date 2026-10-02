import { describe, expect, it, vi } from "vitest";
import { runOakImport } from "./oakClient";

function fakeOak(routes: Record<string, unknown>) {
  return vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
    expect(init?.headers?.Authorization).toBe("Bearer KEY");
    const path = url.replace("https://oak.test", "");
    if (!(path in routes)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => routes[path] };
  });
}

const quiz = (title: string, question: string, right: string, wrong: string) => ({
  lessonSlug: title.toLowerCase().replace(/\W+/g, "-"),
  lessonTitle: title,
  starterQuiz: [],
  exitQuiz: [
    {
      question,
      questionType: "multiple-choice",
      answers: [
        { type: "text", content: right, distractor: false },
        { type: "text", content: wrong, distractor: true },
      ],
    },
  ],
});

describe("runOakImport", () => {
  it("walks programmes, keeps the ones we have specs for, and pages questions", async () => {
    const fetchImpl = fakeOak({
      "/subjects/science/programmes": ["biology-secondary-ks4-higher-aqa", "biology-secondary-ks4-higher-edexcel"],
      "/programmes/biology-secondary-ks4-higher-aqa": { keystageSlug: "ks4", subjectSlug: "biology", examboardSlug: "aqa", tierSlug: "higher" },
      "/programmes/biology-secondary-ks4-higher-edexcel": { keystageSlug: "ks4", subjectSlug: "biology", examboardSlug: "edexcel", tierSlug: "higher" },
      "/programmes/biology-secondary-ks4-higher-aqa/questions?limit=100&offset=0": [
        quiz("Osmosis in cells", "Which substance moves in osmosis?", "Water", "Salt"),
      ],
    });
    const result = await runOakImport({ apiKey: "KEY", fetchImpl, base: "https://oak.test", subjects: ["science"] });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ topic_ref: "4.1.3", source: "oak" });
    expect(result.programmes).toEqual([
      { slug: "biology-secondary-ks4-higher-aqa", spec: "aqa-gcse-biology-8461", rows: 1 },
      { slug: "biology-secondary-ks4-higher-edexcel", spec: null, rows: 0 },
    ]);
  });

  it("fails loudly on an API error rather than importing half a bank", async () => {
    const fetchImpl = fakeOak({});
    await expect(runOakImport({ apiKey: "KEY", fetchImpl, base: "https://oak.test", subjects: ["science"] })).rejects.toThrow(/404/);
  });
});
