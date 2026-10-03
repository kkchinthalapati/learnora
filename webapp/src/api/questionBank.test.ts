import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { SUPABASE_URL } from "../lib/supabase";
import { mockAuthSession } from "../test/mockSession";
import { queryClient } from "../lib/queryClient";
import { getSpec } from "../lib/syllabus";
import { bankPracticeFor, createBankQuiz, fetchBankQuestions } from "./questionBank";

const REST = `${SUPABASE_URL}/rest/v1`;

function bankRow(id: string, spec: string, ref: string, source = "learnora") {
  return {
    id,
    source,
    source_ref: null,
    licence: source === "oak" ? "OGL-3.0" : "learnora",
    attribution: source === "oak" ? "From the Oak National Academy lesson \"Osmosis\". OGL v3.0." : null,
    spec_key: spec,
    topic_ref: ref,
    tier: null,
    question: `Question ${id}?`,
    choices: ["One", "Two", "Three"],
    correct_index: 0,
    explanation: "Because.",
  };
}

describe("question bank api", () => {
  let lastUrl: URL | null = null;
  beforeEach(() => {
    mockAuthSession("user-1");
    lastUrl = null;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  function serveBank(rows: ReturnType<typeof bankRow>[]) {
    server.use(
      http.get(`${REST}/question_bank`, ({ request }) => {
        lastUrl = new URL(request.url);
        const refs = (lastUrl.searchParams.get("topic_ref") ?? "").replace(/^in\.\(|\)$/g, "").split(",").map((r) => r.replace(/"/g, ""));
        return HttpResponse.json(rows.filter((r) => refs.includes(r.topic_ref)));
      }),
    );
  }

  it("filters by the spec's bank key, the topics and the tier", async () => {
    serveBank([bankRow("1", "gcse-maths", "A17-A22")]);
    const rows = await fetchBankQuestions(getSpec("edexcel-gcse-maths-1ma1")!, ["A17-A22"], "Higher");
    expect(rows).toHaveLength(1);
    expect(lastUrl!.searchParams.get("spec_key")).toBe("eq.gcse-maths");
    expect(lastUrl!.searchParams.get("or")).toBe("(tier.is.null,tier.eq.Higher)");
  });

  it("saves a selection as a quiz with attribution on Oak questions", async () => {
    serveBank([bankRow("1", "aqa-gcse-biology-8461", "4.1.3", "oak"), bankRow("2", "aqa-gcse-biology-8461", "4.1.3")]);
    let posted: Record<string, unknown>[] | undefined;
    server.use(
      http.post(`${REST}/quizzes`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>[];
        return HttpResponse.json({ id: "quiz-9", ...posted[0] });
      }),
    );
    const made = await createBankQuiz({
      spec: getSpec("aqa-gcse-biology-8461")!,
      tier: null,
      topicOrder: ["4.1.3"],
      count: 5,
      title: "Osmosis practice",
    });
    expect(made).toEqual({ quizId: "quiz-9", questions: 2 });
    const questions = posted![0].questions_json as { topic: string; attribution?: string }[];
    expect(questions.every((q) => q.topic === "Transport in cells")).toBe(true);
    expect(questions.filter((q) => q.attribution).length).toBe(1);
  });

  it("returns null and saves nothing when the bank has no questions", async () => {
    serveBank([]);
    expect(
      await createBankQuiz({ spec: getSpec("aqa-gcse-biology-8461")!, tier: null, topicOrder: ["4.1.3"], count: 5, title: "x" }),
    ).toBeNull();
  });

  it("finds fallback practice for a topic with no exam, topping up from the same unit", async () => {
    serveBank([
      bankRow("1", "aqa-gcse-biology-8461", "4.4.1"),
      bankRow("2", "aqa-gcse-biology-8461", "4.4.2"),
      bankRow("3", "aqa-gcse-biology-8461", "4.4.2"),
    ]);
    const qs = await bankPracticeFor("Photosynthesis", 3);
    expect(qs).toHaveLength(3);
    expect(qs![0].topic).toBe("Photosynthesis");
  });

  it("has nothing for a topic outside every banked spec", async () => {
    serveBank([]);
    expect(await bankPracticeFor("The Tudors", 6)).toBeNull();
  });
});
