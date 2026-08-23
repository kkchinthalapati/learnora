import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Exam,
  Flashcard,
  FlashcardDeck,
  Folder,
  Material,
  Quiz,
  QuizAttempt,
  StudySession,
} from "../api/types";

vi.mock("./useMaterials", () => ({ useMaterials: vi.fn() }));
vi.mock("./useFolders", () => ({ useFolders: vi.fn() }));
vi.mock("./useDecks", () => ({ useAllDecks: vi.fn() }));
vi.mock("./useFlashcards", () => ({ useFlashcards: vi.fn() }));
vi.mock("./useQuizzes", () => ({
  useQuizzes: vi.fn(),
  useQuizAttempts: vi.fn(),
}));
vi.mock("./useSessions", () => ({ useSessionsSince: vi.fn() }));

import * as decksHook from "./useDecks";
import * as flashcardsHook from "./useFlashcards";
import * as foldersHook from "./useFolders";
import * as materialsHook from "./useMaterials";
import { useExamReadiness } from "./useExamReadiness";
import * as quizzesHook from "./useQuizzes";
import * as sessionsHook from "./useSessions";

const now = new Date("2026-08-23T12:00:00");

const folders: Folder[] = [
  {
    id: "math-folder",
    user_id: "user-1",
    name: "Mathematics",
    color: "#3b82f6",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "history-folder",
    user_id: "user-1",
    name: "History",
    color: "#ef4444",
    created_at: "2026-01-01T00:00:00Z",
  },
];

const materials: Material[] = [
  {
    id: "math-material",
    user_id: "user-1",
    folder_id: "math-folder",
    title: "Algebra notes",
    type: "text",
    raw_content:
      "Detailed algebra notes with enough content to earn the bonus.",
    storage_path: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "history-material",
    user_id: "user-1",
    folder_id: "history-folder",
    title: "History notes",
    type: "text",
    raw_content:
      "Detailed history notes with enough content to earn the bonus.",
    storage_path: null,
    created_at: "2026-01-01T00:00:00Z",
  },
];

const decks: FlashcardDeck[] = [
  {
    id: "math-deck",
    user_id: "user-1",
    folder_id: "math-folder",
    title: "Algebra cards",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "history-deck",
    user_id: "user-1",
    folder_id: "history-folder",
    title: "History cards",
    created_at: "2026-01-01T00:00:00Z",
  },
];

const flashcards: Flashcard[] = [
  {
    id: "math-card",
    user_id: "user-1",
    deck_id: "math-deck",
    front: "Quadratic formula",
    back: "Formula",
    next_review_date: null,
    srs_interval: 4,
    ease_factor: 2.5,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "history-card",
    user_id: "user-1",
    deck_id: "history-deck",
    front: "Magna Carta",
    back: "1215",
    next_review_date: null,
    srs_interval: 0,
    ease_factor: 1.5,
    created_at: "2026-01-01T00:00:00Z",
  },
];

const quizzes: Quiz[] = [
  {
    id: "math-quiz",
    user_id: "user-1",
    material_id: null,
    folder_id: "math-folder",
    title: "Algebra quiz",
    questions_json: [],
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "math-material-quiz",
    user_id: "user-1",
    material_id: "math-material",
    folder_id: null,
    title: "Algebra material quiz",
    questions_json: [],
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "history-quiz",
    user_id: "user-1",
    material_id: null,
    folder_id: "history-folder",
    title: "History quiz",
    questions_json: [],
    created_at: "2026-01-01T00:00:00Z",
  },
];

const quizAttempts: QuizAttempt[] = [
  {
    id: "math-attempt",
    user_id: "user-1",
    quiz_id: "math-quiz",
    score: 8,
    total: 10,
    answers_json: [],
    weak_topics: ["Linear equations"],
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "math-material-attempt",
    user_id: "user-1",
    quiz_id: "math-material-quiz",
    score: 10,
    total: 10,
    answers_json: [],
    weak_topics: ["Factoring"],
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "history-attempt",
    user_id: "user-1",
    quiz_id: "history-quiz",
    score: 0,
    total: 10,
    answers_json: [],
    weak_topics: ["Magna Carta"],
    created_at: "2026-01-01T00:00:00Z",
  },
];

const sessions: StudySession[] = [
  {
    id: "math-session",
    user_id: "user-1",
    task: null,
    folder_id: "math-folder",
    minutes: 600,
    timer_type: "focus",
    started_at: "2026-08-20T10:00:00Z",
    created_at: "2026-08-20T10:00:00Z",
  },
  {
    id: "history-session",
    user_id: "user-1",
    task: null,
    folder_id: "history-folder",
    minutes: 1200,
    timer_type: "focus",
    started_at: "2026-08-20T10:00:00Z",
    created_at: "2026-08-20T10:00:00Z",
  },
];

function queryResult<T>(data: T) {
  return { data, isPending: false };
}

function mockReadinessData() {
  vi.mocked(materialsHook.useMaterials).mockReturnValue(
    queryResult(materials) as never,
  );
  vi.mocked(foldersHook.useFolders).mockReturnValue(
    queryResult(folders) as never,
  );
  vi.mocked(decksHook.useAllDecks).mockReturnValue(queryResult(decks) as never);
  vi.mocked(flashcardsHook.useFlashcards).mockReturnValue(
    queryResult(flashcards) as never,
  );
  vi.mocked(quizzesHook.useQuizzes).mockReturnValue(
    queryResult(quizzes) as never,
  );
  vi.mocked(quizzesHook.useQuizAttempts).mockReturnValue(
    queryResult(quizAttempts) as never,
  );
  vi.mocked(sessionsHook.useSessionsSince).mockReturnValue(
    queryResult(sessions) as never,
  );
}

describe("useExamReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadinessData();
  });

  it("uses the matched folder's decks and quizzes, never another subject's activity", () => {
    const exam: Exam = {
      id: 1,
      user_id: "user-1",
      exam_name: "Mathematics final",
      exam_date: "2026-09-15",
      difficulty: "Medium",
      status: null,
    };

    const { result } = renderHook(() => useExamReadiness(exam, now));

    expect(result.current.readiness).toMatchObject({
      breakdown: { coverage: 55, mastery: 95, studyTime: 50 },
      totalStudyMinutes: 600,
      weakTopics: ["Linear equations", "Factoring"],
    });
  });

  it("does not use account-wide learning data when the exam has no folder match", () => {
    const exam: Exam = {
      id: 2,
      user_id: "user-1",
      exam_name: "Physics final",
      exam_date: "2026-09-15",
      difficulty: "Medium",
      status: null,
    };

    const { result } = renderHook(() => useExamReadiness(exam, now));

    expect(result.current.readiness).toMatchObject({
      score: 0,
      breakdown: { coverage: 0, mastery: 0, studyTime: 0 },
      totalStudyMinutes: 0,
      weakTopics: [],
    });
  });
});
