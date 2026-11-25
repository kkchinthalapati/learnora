import { describe, expect, it } from "vitest";
import { homeSubjects, nextLessonOf, todayView, type TodayInput } from "./homeToday";
import type { LessonProgress } from "./lessons";

const base: TodayInput = {
  dueCards: 0,
  dueIdeas: 0,
  sessionTopic: null,
  pairHref: null,
  hasResume: false,
  nextLesson: null,
  hasLessons: false,
};

describe("todayView", () => {
  it("a new student is pointed at the box, with nothing to start", () => {
    const v = todayView(base);
    expect(v.state).toBe("first");
    expect(v.message).toMatch(/your first lesson starts here/);
    expect(v.action).toBeNull();
  });

  it("counts what is due, and only what is due", () => {
    expect(todayView({ ...base, dueCards: 12, dueIdeas: 2 }).message).toBe(
      "12 cards and 2 ideas are worth another look today.",
    );
    expect(todayView({ ...base, dueCards: 1 }).message).toBe("1 card is worth another look today.");
    expect(todayView({ ...base, dueIdeas: 1 }).message).toBe("1 idea is worth another look today.");
    expect(todayView({ ...base, dueIdeas: 3 }).message).toBe("3 ideas are worth another look today.");
  });

  it("never promises a duration", () => {
    const v = todayView({ ...base, dueCards: 30, dueIdeas: 4, sessionTopic: "Osmosis" });
    expect(v.message).not.toMatch(/minute|min\b|hour/i);
  });

  it("starts the adaptive session when it has a topic to go on", () => {
    const v = todayView({ ...base, dueCards: 3, dueIdeas: 1, sessionTopic: "Osmosis" });
    expect(v.state).toBe("revisit");
    expect(v.action).toEqual({ kind: "session", label: "Start session" });
  });

  it("with only cards due and no session topic, Start opens the card review", () => {
    expect(todayView({ ...base, dueCards: 5 }).action).toEqual({
      kind: "link",
      label: "Review cards",
      to: "/review/daily-drill",
    });
  });

  it("with only a pair due, Start opens that pair", () => {
    expect(todayView({ ...base, dueIdeas: 1, pairHref: "/tell-apart/mass-weight" }).action).toEqual({
      kind: "link",
      label: "Tell them apart",
      to: "/tell-apart/mass-weight",
    });
  });

  it("nothing due but a session is possible: offers it without urgency", () => {
    const v = todayView({ ...base, sessionTopic: "Biology", hasResume: true, hasLessons: true });
    expect(v.state).toBe("session");
    expect(v.message).toBe("Nothing is due today. A short session on Biology is ready when you are.");
    expect(v.action).toEqual({ kind: "session", label: "Start session" });
  });

  it("nothing due and a lesson in progress: points at the continue row", () => {
    const v = todayView({ ...base, hasResume: true, hasLessons: true });
    expect(v.state).toBe("continue");
    expect(v.message).toBe("Nothing urgent today. Continue where you left off.");
    expect(v.action).toBeNull();
  });

  it("nothing due and nothing in progress: suggests the next lesson", () => {
    const v = todayView({
      ...base,
      hasLessons: true,
      nextLesson: { title: "Photosynthesis", href: "/lessons/m1" },
    });
    expect(v.state).toBe("lesson");
    expect(v.message).toBe("Nothing urgent today. Photosynthesis is ready when you are.");
    expect(v.action).toEqual({ kind: "link", label: "Open lesson", to: "/lessons/m1" });
  });

  it("every lesson practised and nothing due still leaves something to do", () => {
    const v = todayView({ ...base, hasLessons: true });
    expect(v.message).toMatch(/Pick a lesson below, or add something new/);
  });
});

const lesson = (id: string, folder: string | null, created: string, title = id) => ({
  id,
  title,
  folder_id: folder,
  created_at: created,
});
const progress = (entries: Record<string, LessonProgress>) => new Map(Object.entries(entries));

describe("nextLessonOf", () => {
  it("is the earliest-added lesson not practised through", () => {
    const lessons = [lesson("c", "f", "2026-03-01"), lesson("b", "f", "2026-02-01"), lesson("a", "f", "2026-01-01")];
    expect(nextLessonOf(lessons, progress({ a: { total: 4, practised: 4 } }))?.id).toBe("b");
  });

  it("counts a lesson with no cards as not started, not done", () => {
    expect(nextLessonOf([lesson("a", "f", "2026-01-01")], progress({ a: { total: 0, practised: 0 } }))?.id).toBe("a");
  });

  it("is null when everything is practised through", () => {
    expect(nextLessonOf([lesson("a", "f", "2026-01-01")], progress({ a: { total: 2, practised: 2 } }))).toBeNull();
  });
});

describe("homeSubjects", () => {
  const folders = [
    { id: "bio", name: "Biology", color: "#0f766e", created_at: "2026-01-01" },
    { id: "chem", name: "Chemistry", color: "#b45309", created_at: "2026-01-02" },
    { id: "hist", name: "History", color: "#334155", created_at: "2026-01-03" },
  ];

  it("lists real subjects with their next lesson, most recently worked on first", () => {
    const out = homeSubjects({
      folders,
      lessons: [
        lesson("l2", "bio", "2026-05-02", "Respiration"),
        lesson("l1", "bio", "2026-05-01", "Photosynthesis"),
        lesson("l3", "chem", "2026-04-01", "Bonding"),
      ],
      progress: progress({ l1: { total: 3, practised: 3 }, l3: { total: 2, practised: 2 } }),
      exams: [{ exam_name: "Biology paper 1", exam_date: "2026-06-13", folder_id: "bio" }],
      today: "2026-06-01",
    });
    expect(out.map((s) => s.name)).toEqual(["Biology", "Chemistry", "History"]);
    expect(out[0].meta).toBe("Next: Respiration · exam in 12 days");
    expect(out[1].meta).toBe("1 lesson, all practised");
    expect(out[2].meta).toBe("No lessons yet");
  });

  it("shows no percentages and keeps to the limit", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `f${i}`,
      name: `Subject ${i}`,
      color: "#000000",
      created_at: `2026-01-0${i + 1}`,
    }));
    const out = homeSubjects({ folders: many, lessons: [], progress: new Map(), exams: [], today: "2026-06-01" });
    expect(out).toHaveLength(4);
    expect(out.every((s) => !s.meta.includes("%"))).toBe(true);
  });

  it("ignores past exams", () => {
    const out = homeSubjects({
      folders: folders.slice(0, 1),
      lessons: [],
      progress: new Map(),
      exams: [{ exam_name: "Old paper", exam_date: "2026-01-01", folder_id: "bio" }],
      today: "2026-06-01",
    });
    expect(out[0].meta).toBe("No lessons yet");
  });
});
