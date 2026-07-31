import { http, HttpResponse } from "msw";
import { SUPABASE_URL } from "../../lib/supabase";

const rest = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`;

export const taskFixtures = [
  {
    id: 1,
    user_id: "user-1",
    text: "Read chapter 4",
    is_done: false,
    due_date: null,
  },
  {
    id: 2,
    user_id: "user-1",
    text: "Finish essay",
    is_done: true,
    due_date: "2026-08-01",
  },
];

export const folderFixtures = [
  {
    id: "folder-1",
    user_id: "user-1",
    name: "Biology",
    color: "#4A90E2",
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

export const examFixtures = [
  {
    id: 1,
    user_id: "user-1",
    exam_name: "Midterm",
    exam_date: "2026-08-15",
    difficulty: "hard",
    status: "upcoming",
  },
];

/* Default handlers cover the happy-path shape every entity module shares:
 * GET returns fixtures scoped by the test's mocked user, mutating verbs
 * succeed with a representative body. Individual tests override with
 * `server.use(...)` for error cases or assertions on the outgoing request. */
export const handlers = [
  http.get(rest("tasks"), () => HttpResponse.json(taskFixtures)),
  http.post(rest("tasks"), () => HttpResponse.json(null, { status: 201 })),
  http.patch(rest("tasks"), () => new HttpResponse(null, { status: 204 })),
  http.delete(rest("tasks"), () => new HttpResponse(null, { status: 204 })),

  http.get(rest("folders"), () => HttpResponse.json(folderFixtures)),
  http.post(rest("folders"), async ({ request }) => {
    const [body] = (await request.json()) as Record<string, unknown>[];
    return HttpResponse.json(
      { id: "folder-new", created_at: "2026-01-01T00:00:00.000Z", ...body },
      { status: 201 },
    );
  }),
  http.patch(rest("folders"), () => new HttpResponse(null, { status: 204 })),
  http.delete(rest("folders"), () => new HttpResponse(null, { status: 204 })),

  http.get(rest("materials"), () => HttpResponse.json([])),

  http.get(rest("exams"), () => HttpResponse.json(examFixtures)),
  http.post(rest("exams"), () => new HttpResponse(null, { status: 201 })),
  http.patch(rest("exams"), () => new HttpResponse(null, { status: 204 })),
  http.delete(rest("exams"), () => new HttpResponse(null, { status: 204 })),

  http.get(rest("flashcard_decks"), () => HttpResponse.json([])),
  http.post(
    rest("flashcard_decks"),
    () => new HttpResponse(null, { status: 201 }),
  ),
  http.delete(
    rest("flashcard_decks"),
    () => new HttpResponse(null, { status: 204 }),
  ),

  http.get(rest("flashcards"), () => HttpResponse.json([])),
  http.head(rest("flashcards"), () => new HttpResponse(null, { status: 200 })),
  http.patch(rest("flashcards"), () => new HttpResponse(null, { status: 204 })),

  http.get(rest("quizzes"), () => HttpResponse.json([])),
  http.post(rest("quizzes"), () => new HttpResponse(null, { status: 201 })),
  http.delete(rest("quizzes"), () => new HttpResponse(null, { status: 204 })),
  http.get(rest("quiz_attempts"), () => HttpResponse.json([])),

  http.get(rest("study_sessions"), () => HttpResponse.json([])),
  http.delete(
    rest("study_sessions"),
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.get(rest("weekly_plans"), () => HttpResponse.json([])),
  http.post(
    rest("weekly_plans"),
    () => new HttpResponse(null, { status: 201 }),
  ),
  http.delete(
    rest("weekly_plans"),
    () => new HttpResponse(null, { status: 204 }),
  ),
];
