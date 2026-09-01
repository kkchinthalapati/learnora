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

/* ------------------------------------------------------------- notebooks */

/** A diagram exactly as the tutor is told to draw one (see
 *  `lib/diagramPrompt.ts`): a viewBox, a title, `currentColor` construction
 *  lines so it follows the theme, and every element the prose refers to
 *  labelled. It doubles as the reference for what "good" looks like. */
export const sampleDiagramSvg = `<svg viewBox="0 0 640 420" xmlns="http://www.w3.org/2000/svg">
  <title>Circle theorems on one circle</title>
  <circle cx="320" cy="210" r="160" fill="none" stroke="currentColor" stroke-width="2" />
  <circle cx="320" cy="210" r="4" fill="currentColor" />
  <text x="320" y="234" text-anchor="middle" font-size="15" fill="currentColor">O</text>

  <!-- Angle at the centre is twice the angle at the circumference -->
  <line x1="180" y1="130" x2="320" y2="210" stroke="#2563EB" stroke-width="2" />
  <line x1="460" y1="130" x2="320" y2="210" stroke="#2563EB" stroke-width="2" />
  <line x1="180" y1="130" x2="320" y2="370" stroke="#2E9E6B" stroke-width="2" />
  <line x1="460" y1="130" x2="320" y2="370" stroke="#2E9E6B" stroke-width="2" />

  <text x="180" y="118" text-anchor="middle" font-size="15" fill="currentColor">A</text>
  <text x="460" y="118" text-anchor="middle" font-size="15" fill="currentColor">B</text>
  <text x="320" y="392" text-anchor="middle" font-size="15" fill="currentColor">P</text>

  <text x="320" y="180" text-anchor="middle" font-size="15" fill="#2563EB">2x</text>
  <text x="320" y="352" text-anchor="middle" font-size="15" fill="#2E9E6B">x</text>

  <!-- Angle in a semicircle -->
  <line x1="160" y1="210" x2="480" y2="210" stroke="currentColor" stroke-width="2" stroke-dasharray="6 6" />
  <text x="120" y="215" text-anchor="middle" font-size="15" fill="currentColor">C</text>
  <text x="520" y="215" text-anchor="middle" font-size="15" fill="currentColor">D</text>
  <text x="320" y="410" text-anchor="middle" font-size="15" fill="currentColor">CD is a diameter</text>
</svg>`;

export const notebooks = [
  {
    id: "nb-1",
    user_id: USER_ID,
    title: "Grade 9 Mathematics: Circle Theorems",
    subject: "Mathematics",
    color: "#4A90E2",
    description: "Core theorems and proof strategies.",
    notes: "Angle at the centre = 2 x angle at the circumference.\n",
    created_at: daysAgo(6),
    updated_at: daysAgo(1),
    notebook_sources: [
      {
        id: "nb-src-1",
        title: "Chapter 10: Circles & Proofs.pdf",
        type: "pdf",
        content:
          "Equal chords of a circle subtend equal angles at the centre. The angle subtended by an arc at the centre is twice the angle it subtends at any point on the remaining part of the circle.",
        url: null,
        selected: true,
        created_at: daysAgo(6),
      },
    ],
    notebook_artifacts: [
      {
        id: "nb-art-1",
        type: "diagram",
        title: "Diagram: circle theorems on one big circle",
        content: `### Circle theorems on one circle\n\n\`\`\`svg\n${sampleDiagramSvg}\n\`\`\`\n\n- **O** is the centre, so OA and OB are radii.\n- The blue angle **2x** at the centre is twice the green angle **x** at P.\n- **CD** is a diameter, so any angle drawn from C to D on the circle is 90°.`,
        summary: "Labelled diagram drawn from your notebook sources.",
        created_at: daysAgo(1),
      },
    ],
    notebook_messages: [
      {
        id: "nb-msg-1",
        role: "user",
        content:
          "a diagram showing the different circle theorems on one big circle",
        citations: null,
        created_at: daysAgo(1),
      },
      {
        id: "nb-msg-2",
        role: "assistant",
        content: `Here is the whole set on one circle.\n\n\`\`\`svg\n${sampleDiagramSvg}\n\`\`\`\n\nNotice that the angle at the centre (2x) is always double the angle at the circumference (x) standing on the same arc AB.`,
        citations: null,
        created_at: daysAgo(1),
      },
    ],
  },
];
