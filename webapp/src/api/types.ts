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

/* Friends. Unlike everything above, most of these are not table rows — they
 * are the return shapes of the SECURITY DEFINER RPCs added in
 * 20260803000000_add_friends_feature.sql. `profiles` and `study_sessions`
 * stay owner-only in RLS, so a friend's name and stats can only ever arrive
 * pre-aggregated from one of those functions, never as a row this client
 * selected for itself. */

export type FriendshipStatus = "pending" | "accepted" | "declined";

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  responded_at: string | null;
}

/** How the signed-in user already relates to the owner of an invite code. */
export type FriendRelationship = "none" | "outgoing" | "incoming" | "accepted";

/** `resolve_friend_code(code)` — the card behind "Add Alex as a friend?". */
export interface ResolvedFriendCode {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_self: boolean;
  relationship: FriendRelationship;
}

/** `get_friend_requests()` — pending in both directions, name attached. */
export interface FriendRequest {
  friendship_id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  direction: "incoming" | "outgoing";
  created_at: string;
}

/** `get_friends_leaderboard(tz)`. `friendship_id` is null on the caller's own
 *  row — there is no friendship with yourself to remove. */
export interface LeaderboardEntry {
  friendship_id: string | null;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  weekly_minutes: number;
  streak: number;
  is_self: boolean;
  rank: number;
}
