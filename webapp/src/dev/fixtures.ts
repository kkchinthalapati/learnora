/* Fixture data for the dev harness (src/dev/harness.tsx).
 *
 * Shapes mirror api/types.ts. Dates are generated relative to "now" so the
 * dashboard's day-boundary logic (streaks, sparkline, "due today") has
 * something realistic to chew on however long after writing this it runs. */

export const USER_ID = "00000000-0000-4000-8000-000000000001";
export const USER_EMAIL = "harness@learnora.dev";

function daysAgo(n: number, hour = 18): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export const folders = [
  {
    id: "f-bio",
    user_id: USER_ID,
    name: "Biology",
    color: "#4ade80",
    created_at: daysAgo(40),
  },
  {
    id: "f-chem",
    user_id: USER_ID,
    name: "Chemistry",
    color: "#60a5fa",
    created_at: daysAgo(38),
  },
  {
    id: "f-hist",
    user_id: USER_ID,
    name: "History",
    color: "#f472b6",
    created_at: daysAgo(21),
  },
];

export const tasks = [
  {
    id: 1,
    user_id: USER_ID,
    text: "Finish the enzymes past paper",
    is_done: false,
    due_date: daysAhead(0),
  },
  {
    id: 2,
    user_id: USER_ID,
    text: "Re-read titration notes",
    is_done: false,
    due_date: daysAhead(1),
  },
  {
    id: 3,
    user_id: USER_ID,
    text: "Summarise the Weimar chapter",
    is_done: false,
    due_date: daysAhead(3),
  },
  {
    id: 4,
    user_id: USER_ID,
    text: "Email Mr Hart about the resit",
    is_done: true,
    due_date: daysAhead(-1),
  },
];

export const exams = [
  {
    id: 1,
    user_id: USER_ID,
    exam_name: "Biology Paper 2",
    exam_date: daysAhead(6),
    difficulty: "hard",
    status: "upcoming",
  },
  {
    id: 2,
    user_id: USER_ID,
    exam_name: "Chemistry Mock",
    exam_date: daysAhead(19),
    difficulty: "medium",
    status: "upcoming",
  },
];

export const materials = [
  {
    id: "m-1",
    user_id: USER_ID,
    folder_id: "f-bio",
    title: "Enzymes and rates of reaction",
    type: "pdf" as const,
    raw_content: "Enzymes are biological catalysts…",
    storage_path: null,
    created_at: daysAgo(9),
  },
  {
    id: "m-2",
    user_id: USER_ID,
    folder_id: "f-chem",
    title: "Titration walkthrough",
    type: "youtube" as const,
    raw_content: "Transcript of the titration walkthrough…",
    storage_path: null,
    created_at: daysAgo(5),
  },
];

export const notes = [
  {
    id: "n-1",
    user_id: USER_ID,
    material_id: "m-1",
    markdown_content:
      "## Enzymes\n\nEnzymes lower the **activation energy** of a reaction.\n\n- Active site is specific to the substrate\n- Denature above their optimum temperature\n- pH shifts change the shape of the active site\n\n### Rate factors\n\n1. Temperature\n2. pH\n3. Substrate concentration",
    html_content: null,
    created_at: daysAgo(9),
  },
];

export const decks = [
  {
    id: "d-bio",
    user_id: USER_ID,
    folder_id: "f-bio",
    title: "Enzymes",
    created_at: daysAgo(9),
  },
  {
    id: "d-chem",
    user_id: USER_ID,
    folder_id: "f-chem",
    title: "Titration key terms",
    created_at: daysAgo(5),
  },
];

export const flashcards = [
  {
    id: "c-1",
    user_id: USER_ID,
    deck_id: "d-bio",
    front: "What does an enzyme do to activation energy?",
    back: "Lowers it, so the reaction proceeds faster at a given temperature.",
    next_review_date: null,
    srs_interval: 0,
    ease_factor: 2.5,
    created_at: daysAgo(9),
    flashcard_decks: { title: "Enzymes" },
  },
  {
    id: "c-2",
    user_id: USER_ID,
    deck_id: "d-bio",
    front: "Why does a denatured enzyme stop working?",
    back: "Its active site changes shape, so the substrate no longer fits.",
    next_review_date: daysAgo(1),
    srs_interval: 1,
    ease_factor: 2.4,
    created_at: daysAgo(9),
    flashcard_decks: { title: "Enzymes" },
  },
  {
    id: "c-3",
    user_id: USER_ID,
    deck_id: "d-chem",
    front: "What is the end point of a titration?",
    back: "The moment the indicator changes colour permanently.",
    next_review_date: daysAgo(0),
    srs_interval: 3,
    ease_factor: 2.2,
    created_at: daysAgo(5),
    flashcard_decks: { title: "Titration key terms" },
  },
];

export const sessions = [
  { day: 0, mins: 45, folder: "f-bio", task: "Enzymes past paper" },
  { day: 0, mins: 25, folder: "f-chem", task: "Titration notes" },
  { day: 1, mins: 50, folder: "f-bio", task: "Flashcard review" },
  { day: 2, mins: 30, folder: "f-hist", task: "Weimar reading" },
  { day: 3, mins: 65, folder: "f-chem", task: "Moles practice" },
  { day: 4, mins: 20, folder: "f-bio", task: "Diagram labelling" },
  { day: 5, mins: 40, folder: "f-hist", task: "Essay plan" },
  { day: 6, mins: 35, folder: "f-bio", task: "Respiration recap" },
  { day: 8, mins: 55, folder: "f-chem", task: "Bonding" },
].map((s, i) => ({
  id: `s-${i}`,
  user_id: USER_ID,
  task: s.task,
  folder_id: s.folder,
  minutes: s.mins,
  timer_type: "pomodoro",
  started_at: daysAgo(s.day, 17),
  created_at: daysAgo(s.day, 17),
}));

export const quizzes = [
  {
    id: "q-1",
    user_id: USER_ID,
    material_id: "m-1",
    folder_id: "f-bio",
    title: "Enzymes quick check",
    questions_json: [
      {
        question: "Enzymes are best described as…",
        options: ["Catalysts", "Substrates", "Hormones", "Lipids"],
        answer: 0,
        topic: "Enzymes",
      },
      {
        question: "Raising temperature past the optimum will…",
        options: [
          "Speed it up forever",
          "Denature the enzyme",
          "Change the substrate",
          "Do nothing",
        ],
        answer: 1,
        topic: "Rates",
      },
    ],
    created_at: daysAgo(7),
  },
];

export const quizAttempts = [
  {
    id: "qa-1",
    user_id: USER_ID,
    quiz_id: "q-1",
    score: 1,
    total: 2,
    answers_json: [{ selected: 0 }, { selected: 0 }],
    weak_topics: ["Rates"],
    created_at: daysAgo(7),
  },
];

export const plans = [
  {
    id: "p-1",
    user_id: USER_ID,
    week_start: daysAhead(-2),
    source: "ai",
    created_at: daysAgo(2),
    plan_json: {
      days: [
        {
          day: "Monday",
          blocks: [
            { time: "17:00", subject: "Biology", focus: "Enzymes recap" },
            { time: "19:00", subject: "Chemistry", focus: "Titration" },
          ],
        },
        {
          day: "Tuesday",
          blocks: [
            { time: "18:00", subject: "History", focus: "Weimar essay plan" },
          ],
        },
      ],
    },
  },
];

/** `get_friends_leaderboard(tz)` — friendship_id is null on your own row. */
export const leaderboard = [
  {
    friendship_id: "fs-1",
    user_id: "friend-1",
    full_name: "Priya Raman",
    avatar_url: null,
    weekly_minutes: 240,
    streak: 12,
    is_self: false,
    rank: 1,
  },
  {
    friendship_id: null,
    user_id: USER_ID,
    full_name: "Harness Student",
    avatar_url: null,
    weekly_minutes: 195,
    streak: 7,
    is_self: true,
    rank: 2,
  },
  {
    friendship_id: "fs-2",
    user_id: "friend-2",
    full_name: "Sam Okafor",
    avatar_url: null,
    weekly_minutes: 120,
    streak: 3,
    is_self: false,
    rank: 3,
  },
];

/** `get_friend_requests()` — both directions come back from one call. */
export const friendRequests = [
  {
    friendship_id: "fs-3",
    user_id: "friend-3",
    full_name: "Alex Mercer",
    avatar_url: null,
    direction: "incoming" as const,
    created_at: daysAgo(1),
  },
  {
    friendship_id: "fs-4",
    user_id: "friend-4",
    full_name: "Jordan Blake",
    avatar_url: null,
    direction: "outgoing" as const,
    created_at: daysAgo(2),
  },
];
