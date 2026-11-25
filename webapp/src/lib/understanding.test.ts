import { describe, expect, it } from "vitest";
import type { LearningEvent, QuizAttempt } from "../api/types";
import { buildUnderstanding, understandingState, understandingSummary } from "./understanding";
import type { TopicKnowledge } from "./knowledgeModel";

const NOW = new Date("2026-11-10T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

/* One stored answer, in the shape the quiz runner writes. */
const answer = (topic: string, correct: boolean, ref: string) => ({
  questionId: ref,
  chosenIndex: correct ? 0 : 1,
  correct,
  topic,
  ref,
  options: 4,
  kind: "recall",
  verified: true,
});

const attempt = (id: string, quizId: string, daysAgo: number, answers: unknown[]): QuizAttempt => ({
  id,
  user_id: "u",
  quiz_id: quizId,
  score: 0,
  total: answers.length,
  answers_json: answers,
  weak_topics: null,
  created_at: day(daysAgo),
});

const folders = [
  { id: "bio", name: "Biology" },
  { id: "chem", name: "Chemistry" },
];
const quizzes = [
  { id: "q-bio", folder_id: "bio", material_id: null },
  { id: "q-lesson", folder_id: null, material_id: "m-chem" },
  { id: "q-loose", folder_id: null, material_id: null },
];
const materials = [{ id: "m-chem", folder_id: "chem" }];

const k = (patch: Partial<TopicKnowledge>): TopicKnowledge => ({
  key: "t",
  p: 0.5,
  pInWeek: 0.5,
  status: "learning",
  fading: false,
  rung: 1,
  stabilityDays: 1,
  counted: 3,
  rightItems: 1,
  rightDays: 1,
  rightApply: 0,
  lastAt: null,
  ...patch,
});

describe("understandingState", () => {
  it("says nothing about a topic with no answered questions", () => {
    expect(understandingState(k({ status: "unmeasured", counted: 0 }))).toBeNull();
  });

  it("puts slipping ahead of secure: it is the thing to act on", () => {
    expect(understandingState(k({ status: "secure", fading: true }))).toBe("slipping");
    expect(understandingState(k({ status: "secure" }))).toBe("secure");
    expect(understandingState(k({ status: "fragile" }))).toBe("sofar");
    expect(understandingState(k({ status: "learning" }))).toBe("learning");
  });
});

describe("understandingSummary", () => {
  const t = (state: "secure" | "sofar" | "learning" | "slipping") => ({
    key: state,
    label: state,
    state,
    stateLabel: "",
    evidence: "",
  });

  it("is counts in words, never a percentage", () => {
    const s = understandingSummary([t("secure"), t("secure"), t("slipping"), t("learning")]);
    expect(s).toBe("2 secure, 1 still learning, 1 starting to slip.");
    expect(s).not.toContain("%");
  });

  it("is empty for no topics", () => {
    expect(understandingSummary([])).toBe("");
  });
});

describe("buildUnderstanding", () => {
  it("lists nothing when nothing has been answered", () => {
    expect(buildUnderstanding({ quizAttempts: [], quizzes, events: [], materials, folders, now: NOW })).toEqual([]);
  });

  it("files a topic under the subject its answers came from", () => {
    const out = buildUnderstanding({
      quizAttempts: [
        attempt("a1", "q-bio", 3, [answer("Osmosis", true, "r1"), answer("Osmosis", false, "r2")]),
        /* A quiz with no subject of its own takes its lesson's. */
        attempt("a2", "q-lesson", 2, [answer("Covalent bonding", true, "r3")]),
      ],
      quizzes,
      events: [],
      materials,
      folders,
      now: NOW,
    });
    expect(out.map((s) => s.subject)).toEqual(["Biology", "Chemistry"]);
    expect(out[0].topics.map((t) => t.label)).toEqual(["Osmosis"]);
    expect(out[1].topics.map((t) => t.label)).toEqual(["Covalent bonding"]);
    expect(out[0].subjectId).toBe("bio");
  });

  it("keeps the topic as the student saw it written, and says what the status rests on", () => {
    const [bio] = buildUnderstanding({
      quizAttempts: [attempt("a1", "q-bio", 1, [answer("Rates of Reaction", true, "r1")])],
      quizzes,
      events: [],
      materials,
      folders,
      now: NOW,
    });
    const topic = bio.topics[0];
    expect(topic.label).toBe("Rates of Reaction");
    expect(topic.evidence).toBe("1 question right over 1 day");
    expect(["Secure", "Right so far", "Still learning", "Starting to slip"]).toContain(topic.stateLabel);
    expect(JSON.stringify(bio)).not.toContain("%");
  });

  it("lists topics it cannot place last, on their own", () => {
    const out = buildUnderstanding({
      quizAttempts: [
        attempt("a1", "q-loose", 1, [answer("Vectors", true, "r1")]),
        attempt("a2", "q-bio", 1, [answer("Osmosis", true, "r2")]),
      ],
      quizzes,
      events: [],
      materials,
      folders,
      now: NOW,
    });
    expect(out.map((s) => s.subject)).toEqual(["Biology", "Other topics"]);
    expect(out[1].subjectId).toBeNull();
  });

  it("does not file a topic under a subject that has been deleted", () => {
    const out = buildUnderstanding({
      quizAttempts: [attempt("a1", "q-bio", 1, [answer("Osmosis", true, "r1")])],
      quizzes,
      events: [],
      materials,
      folders: [{ id: "chem", name: "Chemistry" }],
      now: NOW,
    });
    expect(out.map((s) => s.subject)).toEqual(["Other topics"]);
  });

  it("counts answers given in a lesson or a practice session too", () => {
    const event: LearningEvent = {
      id: "e1",
      user_id: "u",
      topic_key: "enzymes",
      deck_id: null,
      folder_id: "bio",
      source: "quick_check",
      score: 1,
      minutes: 0,
      occurred_at: day(1),
      payload: { items: [answer("Enzymes", true, "r9")] },
      client_id: "c1",
    };
    const out = buildUnderstanding({ quizAttempts: [], quizzes, events: [event], materials, folders, now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].subject).toBe("Biology");
    expect(out[0].topics[0].label).toBe("Enzymes");
  });

  it("puts what needs attention first within a subject", () => {
    const wrongTwice = [answer("Diffusion", false, "d1"), answer("Diffusion", false, "d2")];
    const rightOften = [0, 1, 2, 3].map((i) => attempt(`s${i}`, "q-bio", 12 - i * 3, [answer("Cells", true, `c${i}`)]));
    const out = buildUnderstanding({
      quizAttempts: [...rightOften, attempt("w", "q-bio", 1, wrongTwice)],
      quizzes,
      events: [],
      materials,
      folders,
      now: NOW,
    });
    const order = out[0].topics.map((t) => t.state);
    const rank = ["slipping", "learning", "sofar", "secure"];
    expect([...order].sort((a, b) => rank.indexOf(a) - rank.indexOf(b))).toEqual(order);
    const diffusion = out[0].topics.find((t) => t.label === "Diffusion");
    expect(diffusion?.state).toBe("learning");
    /* Answered only wrong so far: said plainly, not as "0 questions right". */
    expect(diffusion?.evidence).toBe("None right yet");
  });
});
