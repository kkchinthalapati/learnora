/* Row shapes mirrored from the `public` schema (see `supabase/migrations` and
 * the live schema — checked via the Supabase MCP `list_tables` tool, not
 * generated, since the project has no `supabase gen types` step yet). */

export interface Task {
  id: number;
  user_id: string;
  text: string;
  is_done: boolean;
  due_date: string | null;
}

export interface Exam {
  id: number;
  user_id: string;
  exam_name: string;
  exam_date: string;
  difficulty: string | null;
  status: string | null;
}

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export type MaterialType = "pdf" | "youtube" | "text" | "audio";

export interface Material {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  type: MaterialType;
  raw_content: string | null;
  storage_path: string | null;
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  material_id: string | null;
  markdown_content: string;
  html_content: string | null;
  created_at: string;
}

export interface FlashcardDeck {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  created_at: string;
}

export interface Flashcard {
  id: string;
  user_id: string;
  deck_id: string | null;
  front: string;
  back: string;
  next_review_date: string | null;
  srs_interval: number;
  ease_factor: number;
  created_at: string;
}

/** Shape returned by `Flashcards.fetchAllDue`'s join with the owning deck. */
export interface FlashcardDue extends Flashcard {
  flashcard_decks: { title: string } | null;
}

export interface StudySession {
  id: string;
  user_id: string;
  task: string | null;
  folder_id: string | null;
  minutes: number;
  timer_type: string | null;
  started_at: string;
  created_at: string;
}

export interface WeeklyPlan {
  id: string;
  user_id: string;
  week_start: string;
  plan_json: unknown;
  source: string;
  created_at: string;
}

export interface Quiz {
  id: string;
  user_id: string;
  material_id: string | null;
  folder_id: string | null;
  title: string;
  questions_json: unknown;
  created_at: string;
}

export interface QuizAttempt {
  id: string;
  user_id: string;
  quiz_id: string;
  score: number;
  total: number;
  answers_json: unknown;
  weak_topics: string[] | null;
  created_at: string;
}

export interface WeakTopic {
  topic: string;
  count: number;
}
