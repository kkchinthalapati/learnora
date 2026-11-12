/* Dev harness — mounts the real signed-in app against fixture data.
 *
 * Why this exists: every view behind ProtectedRoute has only ever been
 * verified through jsdom unit tests, because looking at it in a browser
 * needs a real Supabase account. This entry fakes the two things a session
 * actually gates — an auth session and the REST responses behind it — so
 * the signed-in UI can be opened, clicked through and screenshotted.
 *
 * Dev-only by construction: Vite's build input is index.html, so nothing
 * here is reachable from a production bundle. Run `npm run dev` and open
 * /app/harness.html (add ?route=/library to land somewhere specific).
 *
 * It is a *look at the UI* tool, not a test double — the interceptor answers
 * the shape of each request, not its filters, so a fixture list comes back
 * whole regardless of the `.eq()` chain that asked for it. Assertions belong
 * in the vitest suite, which mocks at a level that respects them.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import * as fx from "./fixtures";

/* ---------------------------------------------------------------- session */

function fakeJwt(): string {
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  return [
    enc({ alg: "HS256", typ: "JWT" }),
    enc({ sub: fx.USER_ID, role: "authenticated", exp, aud: "authenticated" }),
    "harness-not-a-real-signature",
  ].join(".");
}

const USER = {
  id: fx.USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: fx.USER_EMAIL,
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  app_metadata: { provider: "email" },
  /* The harness account is freshly created on every load, which OnboardingGate
     would read as a brand new student and redirect to /welcome — so the
     fixtures would never be visible. Marking it onboarded keeps the harness
     landing where it always did; the wizard itself is still reachable at
     ?route=/welcome (or ?route=/welcome%3Freplay=1 to see it pre-filled). */
  user_metadata: {
    full_name: "Harness Student",
    onboarding: {
      version: 1,
      goal: "university",
      focusAreas: ["deadlines", "planning", "recall"],
      coachStyle: "tutor",
      detail: "medium",
      studyTime: "steady",
      weekdayCapacityMins: 120,
      completedAt: "2026-01-01T00:00:00.000Z",
      skipped: false,
    },
  },
  identities: [],
};

function session() {
  const token = fakeJwt();
  return {
    access_token: token,
    refresh_token: "harness-refresh",
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    user: USER,
  };
}

/* ------------------------------------------------------------ interceptor */

const HARNESS_PLAN = ((p) => (p === "plus" || p === "pro" ? p : "free"))(
  new URLSearchParams(location.search).get("plan"),
);

/* Table name -> rows. Anything not listed answers with an empty list, which
   is what an untouched feature legitimately looks like. */
const TABLES: Record<string, unknown[]> = {
  tasks: fx.tasks,
  exams: fx.exams,
  folders: fx.folders,
  materials: fx.materials,
  notes: fx.notes,
  flashcard_decks: fx.decks,
  flashcards: fx.flashcards,
  study_sessions: fx.sessions,
  learning_events: [],
  /* What the student did with earlier lessons (lib/learnerSignals.ts): three
     step-by-step picks, enough for Settings > Study > How you learn to
     suggest worked examples. */
  learner_signals: [
    { kind: "reteach_pick", surface: "learn", style: null, value: "steps", score: null, topic_key: null, ref: null, created_at: new Date(Date.now() - 86_400_000).toISOString() },
    { kind: "reteach_pick", surface: "learn", style: null, value: "steps", score: null, topic_key: null, ref: null, created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() },
    { kind: "reteach_pick", surface: "learn", style: null, value: "steps", score: null, topic_key: null, ref: null, created_at: new Date(Date.now() - 3 * 86_400_000).toISOString() },
  ],
  quizzes: fx.quizzes,
  quiz_attempts: fx.quizAttempts,
  weekly_plans: fx.plans,
  notebooks: fx.notebooks,
  misconceptions: fx.misconceptions,
  misconception_observations: fx.misconceptionObservations,
  /* Classes (lib/classMap.ts): one taught, one joined. */
  classes: [
    { id: "cls-taught", owner_id: fx.USER_ID, name: "10B Biology", join_code: "AB12CD34", created_at: "2026-10-20T09:00:00Z" },
  ],
  class_members: [
    { class_id: "cls-joined", user_id: fx.USER_ID, share_mistakes: false, joined_at: "2026-10-21T09:00:00Z", classes: { name: "Year 10 Physics" } },
  ],
  question_bank: fx.questionBank,
  profiles: [
    {
      id: fx.USER_ID,
      life_context: null,
      life_context_updated_at: null,
      full_name: "Karthik",
      friend_code: "HARNESS1",
      /* ?plan=plus or ?plan=pro to look at a paid account. */
      plan: HARNESS_PLAN,
      plan_status: HARNESS_PLAN === "free" ? "none" : "active",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
  ],
  /* Boardroom tables */
  boardroom_workspaces: [
    {
      id: "ws-1",
      name: "Learnora Executive Boardroom",
      created_at: "2026-11-09T00:00:00Z",
      governance_restricted: false,
    },
  ],
  boardroom_members: [
    {
      workspace_id: "ws-1",
      user_id: fx.USER_ID,
      display_name: "Karthik",
      role: "founder",
      muted_kinds: [],
    },
    {
      workspace_id: "ws-1",
      user_id: "00000000-0000-4000-8000-000000000002",
      display_name: "Nirav",
      role: "founder",
      muted_kinds: [],
    },
  ],
  boardroom_agents: [
    {
      id: "agent-k",
      workspace_id: "ws-1",
      provider: "claude",
      display_name: "K AI",
      owner_id: fx.USER_ID,
      native_url: "https://generativelanguage.googleapis.com",
      role: "Karthik's AI Strategy Advisor",
      instructions: "Be sharp, growth-oriented, and direct. Help Karthik analyze strategy, pricing, and product roadmap.",
      enabled: true,
      context_format: "markdown",
      allowed_modes: ["independent", "cross_examination"],
      may_review_proposals: true,
      allow_proxy_submit: false,
    },
    {
      id: "agent-n",
      workspace_id: "ws-1",
      provider: "chatgpt",
      display_name: "N AI",
      owner_id: "00000000-0000-4000-8000-000000000002",
      native_url: "https://api.groq.com",
      role: "Nirav's AI Operations & Risk Advisor",
      instructions: "Be critical, evaluate technical scalability, operational risks, and execution edge cases.",
      enabled: true,
      context_format: "markdown",
      allowed_modes: ["independent", "cross_examination"],
      may_review_proposals: true,
      allow_proxy_submit: false,
    },
  ],
  boardroom_threads: [
    {
      id: "t-pricing",
      workspace_id: "ws-1",
      title: "Pricing & Monetization Strategy",
      problem: "Reviewing our tier structure and pricing for Learnora v2.",
      category: "business",
      status: "open",
      pinned: true,
      created_by: fx.USER_ID,
      created_at: "2026-11-09T08:00:00Z",
      last_message_at: "2026-11-09T08:30:00Z",
    },
    {
      id: "t-launch",
      workspace_id: "ws-1",
      title: "Product Hunt & Launch Plan",
      problem: "Aligning on go-to-market schedule and initial outreach.",
      category: "strategy",
      status: "open",
      pinned: false,
      created_by: "00000000-0000-4000-8000-000000000002",
      created_at: "2026-11-09T07:00:00Z",
      last_message_at: "2026-11-09T07:45:00Z",
    },
  ],
  boardroom_messages: [
    {
      id: "m-1",
      workspace_id: "ws-1",
      thread_id: "t-pricing",
      author_type: "human",
      author_id: fx.USER_ID,
      agent_id: null,
      submitted_by: null,
      content: "Hey Nirav, let's lock in our pricing approach before the investor call. Should we launch with a free tier or a 14-day trial?",
      reply_to: null,
      attachments: [],
      status: "posted",
      source_task_id: null,
      created_at: "2026-11-09T08:10:00Z",
      edited_at: null,
      superseded_by: null,
    },
    {
      id: "m-2",
      workspace_id: "ws-1",
      thread_id: "t-pricing",
      author_type: "human",
      author_id: "00000000-0000-4000-8000-000000000002",
      agent_id: null,
      submitted_by: null,
      content: "I think a generous free tier with a usage cap converts better for students. Let's see what the AIs suggest. @K AI what do you think?",
      reply_to: null,
      attachments: [],
      status: "posted",
      source_task_id: null,
      created_at: "2026-11-09T08:15:00Z",
      edited_at: null,
      superseded_by: null,
    },
    {
      id: "m-3",
      workspace_id: "ws-1",
      thread_id: "t-pricing",
      author_type: "ai",
      author_id: fx.USER_ID,
      agent_id: "agent-k",
      submitted_by: fx.USER_ID,
      content: "A freemium model with a hard daily cap on AI tutoring turns gives you fast viral loop growth among GCSE/A-Level students while protecting your API costs. Combine that with an un-gated 7-day trial of 'Plus' features.",
      reply_to: "m-2",
      attachments: [],
      status: "posted",
      source_task_id: null,
      created_at: "2026-11-09T08:16:00Z",
      edited_at: null,
      superseded_by: null,
    },
  ],
  boardroom_documents: [
    {
      id: "doc-1",
      workspace_id: "ws-1",
      slug: "monetization-prd",
      title: "Learnora Monetization & Pricing PRD",
      category: "business",
      owner_id: fx.USER_ID,
      archived: false,
      current_version: 1,
      created_at: "2026-11-09T00:00:00Z",
      updated_at: "2026-11-09T00:00:00Z",
    },
    {
      id: "doc-2",
      workspace_id: "ws-1",
      slug: "product-roadmap-q4",
      title: "Q4 2026 Product Roadmap & Milestones",
      category: "product",
      owner_id: "00000000-0000-4000-8000-000000000002",
      archived: false,
      current_version: 1,
      created_at: "2026-11-09T00:00:00Z",
      updated_at: "2026-11-09T00:00:00Z",
    },
  ],
  boardroom_agent_tasks: [],
  boardroom_context_snapshots: [],
  boardroom_thread_documents: [],
  boardroom_proposals: [],
  boardroom_decisions: [],
  boardroom_notifications: [],
  boardroom_reactions: [],
  boardroom_audit_log: [],
  boardroom_message_edits: [],
};

/* Local-only keys for the harness's real-model calls, from a gitignored
   .env.local (VITE_GEMINI_API_KEY, VITE_GROQ_API_KEY). Never in the source:
   this repo is public. */
const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? "";
const GROQ_API_KEY = (import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? "";

async function runGeminiChat(prompt: string, sysPrompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${sysPrompt}\n\nUSER PROMPT / CONTEXT:\n${prompt}` }] }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini status ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function runGroqChat(prompt: string, sysPrompt: string): Promise<string> {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: sysPrompt },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq status ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function runBoardroomAI(agentId: string, prompt: string, context?: string): Promise<string> {
  const isK = agentId === "agent-k";
  const fullPrompt = context ? `RELEVANT WORKSPACE CONTEXT:\n${context}\n\nUSER MESSAGE:\n${prompt}` : prompt;
  const sysPrompt = isK
    ? "You are K AI, Karthik's AI co-founder and strategic advisor in the Learnora Boardroom. Provide direct, sharp, growth-minded strategic recommendations for Learnora."
    : "You are N AI, Nirav's AI co-founder and operations/risk advisor in the Learnora Boardroom. Provide rigorous, risk-evaluated, execution-focused recommendations for Learnora.";

  const chain = isK ? [runGeminiChat, runGroqChat] : [runGroqChat, runGeminiChat];
  for (const fn of chain) {
    try {
      const reply = await fn(fullPrompt, sysPrompt);
      if (reply?.trim()) return reply.trim();
    } catch (e) {
      console.warn("AI fallback triggered in Boardroom harness:", e);
    }
  }
  return "Both AI providers are temporarily unavailable. Please verify API quotas.";
}

const RPCS: Record<string, unknown> = {
  boardroom_my_workspaces: [
    {
      id: "ws-1",
      name: "Learnora Executive Boardroom",
      created_at: "2026-11-09T00:00:00Z",
      governance_restricted: false,
    },
  ],
  boardroom_get_workspace: {
    id: "ws-1",
    name: "Learnora Executive Boardroom",
    created_at: "2026-11-09T00:00:00Z",
    governance_restricted: false,
  },
  boardroom_documents_current: [
    {
      id: "doc-1",
      workspace_id: "ws-1",
      slug: "monetization-prd",
      title: "Learnora Monetization & Pricing PRD",
      category: "business",
      owner_id: fx.USER_ID,
      archived: false,
      current_version: 1,
      created_at: "2026-11-09T00:00:00Z",
      updated_at: "2026-11-09T00:00:00Z",
      content:
        "Learnora v2 Pricing Model:\n- Free Tier: 20 AI tutoring sessions/month, basic study planner.\n- Plus Tier (£9.99/mo): Unlimited AI sessions, custom misconception detection, voice viva sparring.\n- Pro Tier (£19.99/mo): Full exam mark scheme grading, peer benchmarking, parental dashboard.",
    },
    {
      id: "doc-2",
      workspace_id: "ws-1",
      slug: "product-roadmap-q4",
      title: "Q4 2026 Product Roadmap & Milestones",
      category: "product",
      owner_id: "00000000-0000-4000-8000-000000000002",
      archived: false,
      current_version: 1,
      created_at: "2026-11-09T00:00:00Z",
      updated_at: "2026-11-09T00:00:00Z",
      content:
        "Q4 2026 Roadmap:\n- Milestone 1: Fix Core Boardroom & Performance.\n- Milestone 2: Voice Viva audio integration.\n- Milestone 3: Public Beta launch on Product Hunt.",
    },
  ],
  class_member_counts: [{ joined: 24, sharing: 7 }],
  class_misconception_map: [
    { catalogue_id: "phys-heavier-falls-faster", students: 4 },
    { catalogue_id: "bio-respiration-is-breathing", students: 3 },
    { catalogue_id: "chem-strong-means-concentrated", students: 2 },
  ],
  join_class: [{ class_id: "cls-new", class_name: "Year 11 Chemistry" }],
  get_friends_leaderboard: fx.leaderboard,
  get_friend_requests: fx.friendRequests,
  regenerate_friend_code: "HARNESS2",
  resolve_friend_code: [{ user_id: "friend-9", full_name: "Jordan Blake" }],
  request_or_accept_friend: "pending",
  respond_to_friend_request: "accepted",
  remove_friend: null,
};

/** The reply as server-sent events, a few characters at a time, ending with
 *  the closing event — the same wire format learnora-ai streams. */
function sseReply(text: string): Response {
  const enc = new TextEncoder();
  const pieces = text.match(/[\s\S]{1,18}/g) ?? [];
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const piece of pieces) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: piece })}\n\n`));
        await new Promise((r) => setTimeout(r, 35));
      }
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, modelUsed: "harness" })}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

function install(supabaseUrl: string) {
  const real = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (!url.startsWith(supabaseUrl)) return real(input as RequestInfo, init);

    const path = new URL(url).pathname;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    /* auth */
    if (path.startsWith("/auth/v1/user")) return json(USER);
    if (path.startsWith("/auth/v1/token")) return json(session());
    if (path.startsWith("/auth/v1/logout"))
      return new Response(null, { status: 204 });
    if (path.startsWith("/auth/v1/")) return json({});

    /* edge function — the harness has no model behind it, so every mode
       answers with something shaped like a real reply. A diagram request
       gets a real drawing back, which is the only way to look at how one
       renders without a live key. */
    if (path.startsWith("/functions/v1/learnora-ai")) {
      let prompt = "";
      try {
        const raw =
          init?.body ??
          (input instanceof Request ? await input.clone().text() : "");
        prompt = typeof raw === "string" ? raw : "";
      } catch {
        /* an unreadable body just means the generic reply below */
      }
      /* Typing "openui demo" returns one of every card, so the Ask drawer's
         OpenUI rendering can be looked at without a live model. */
      /* A streamed request gets the reply as server-sent events, a few
         characters at a time, so the progressive display can be looked at. */
      if (/"stream":\s*true/.test(prompt) && /openui demo/i.test(prompt)) {
        return sseReply(fx.sampleOpenUiReply);
      }
      /* A chat turn that was given the student's own notes cites the first
         passage, so the "From your notes" list under the reply can be seen. */
      if (/"stream":\s*true/.test(prompt) && /\[N1\] /.test(prompt)) {
        return sseReply(
          "Your notes put it well: an enzyme lowers the activation energy, so more collisions have enough energy to react [N1]. Your notes don't cover why the rate falls at high temperature, but generally the active site changes shape and the substrate no longer fits.",
        );
      }
      /* Talk past you out of it: the next scripted line, by how many
         arguments the student has sent so far. */
      if (/Talk past you out of it/.test(prompt)) {
        const sent = Math.max(0, (prompt.match(/"role":"user"/g) ?? []).length - 1);
        const line = fx.pastYouScript[Math.min(sent, fx.pastYouScript.length - 1)];
        await new Promise((r) => setTimeout(r, 900));
        return json({ text: JSON.stringify(line) });
      }
      /* Explain-back at the end of a lesson: the first part comes across, on
         the opening words the student really typed (anything else would be
         thrown out by the app's quote check), and the second is left out. */
      if (/explained it in their own words/.test(prompt)) {
        const said = /THE STUDENT'S EXPLANATION:\\n\\"\\"\\"\\n(.*?)\\n\\"\\"\\"/.exec(prompt)?.[1] ?? "";
        const opening = said.split(/\s+/).slice(0, 8).join(" ").replace(/[.,;:]+$/, "");
        await new Promise((r) => setTimeout(r, 900));
        return json({
          text: JSON.stringify({
            legible: true,
            unreadable: "",
            points: [
              { index: 0, awarded: true, evidence: opening, note: "" },
              { index: 1, awarded: false, evidence: "", note: "How you'd work the rate out from a result" },
            ],
            beliefs: [],
          }),
        });
      }
      /* Mark my answer: a scripted marking of the first two scheme points,
         one earned with the student's words, one missed, and a belief. */
      if (/Mark my answer/.test(prompt)) {
        await new Promise((r) => setTimeout(r, 900));
        return json({
          text: JSON.stringify({
            legible: true,
            unreadable: "",
            points: [
              { index: 0, awarded: true, evidence: "the water moves into the cell by osmosis", note: "" },
              { index: 1, awarded: false, evidence: "", note: "Doesn't say which way the water moves" },
            ],
            beliefs: [{ concept: "Osmosis", belief: "Thinks the salt moves into the cell", quote: "the salt goes into the cell" }],
          }),
        });
      }
      /* Learn, exam questions (Plus): the question, then its marking. */
      if (/Write ONE exam question on an idea/.test(prompt)) {
        await new Promise((r) => setTimeout(r, 900));
        return json({
          text: JSON.stringify({
            question: "Explain why the angle at the centre is twice the angle at the circumference.",
            scheme: [
              { point: "draws or uses radii to make isosceles triangles", marks: 1 },
              { point: "base angles of an isosceles triangle are equal", marks: 1 },
              { point: "exterior angle equals the sum of the two opposite angles", marks: 1 },
            ],
          }),
        });
      }
      if (/You are an exam marker. Mark the student.s typed answer/.test(prompt)) {
        /* The body is JSON, so the prompt's newlines and quotes arrive escaped. */
        const answer = /THE STUDENT.S ANSWER:\\n\\"\\"\\"\\n(.*?)\\n\\"\\"\\"/.exec(prompt)?.[1] ?? "";
        const firstWords = answer.split(/\s+/).slice(0, 4).join(" ");
        await new Promise((r) => setTimeout(r, 900));
        return json({
          text: JSON.stringify({
            legible: true,
            unreadable: "",
            points: [
              { index: 0, awarded: true, evidence: firstWords, note: "" },
              { index: 1, awarded: false, evidence: "", note: "Doesn't say the base angles are equal" },
              { index: 2, awarded: true, evidence: "words the student never wrote", note: "" },
            ],
            beliefs: [],
          }),
        });
      }
      /* Listen: a short scripted podcast episode. */
      if (/Write a short educational podcast episode/.test(prompt)) {
        await new Promise((r) => setTimeout(r, 900));
        const lines = [
          ["host", "Why does milk go off faster on a hot day? That's what rates of reaction explain."],
          ["student", "So it's about how fast things react?"],
          ["host", "Exactly. A reaction only happens when particles collide with enough energy."],
          ["student", "So more collisions means a faster reaction?"],
          ["host", "More useful collisions, yes. Raising the temperature makes particles move faster and hit harder."],
          ["student", "And a catalyst gets used up, right?"],
          ["host", "Close, but no: a catalyst gives a lower-energy route and is still there at the end."],
          ["student", "Got it. Temperature, concentration, surface area and catalysts all speed it up."],
          ["host", "That's the whole idea. Remember: collisions, energy, and a catalyst is never used up."],
        ].map(([speaker, text]) => ({ speaker, text }));
        /* A recall break, when the student asked for them. */
        const withBreak = /RECALL BREAKS/.test(prompt)
          ? [
              ...lines.slice(0, 5),
              { speaker: "check", text: "What happens to particles when you heat them?", answer: "They move faster and hit each other harder, so more collisions work." },
              ...lines.slice(5),
            ]
          : lines;
        return json({ text: JSON.stringify({ title: "Why reactions speed up", lines: withBreak }) });
      }
      /* Learn, Explain it your way (Plus). */
      if (/Re-explain one idea from a student/.test(prompt)) {
        await new Promise((r) => setTimeout(r, 900));
        return json({
          text: "Think of a **torch** held at the centre of a circle, and another held on the edge. Both light up the same arc, but the one at the centre has to open its beam twice as wide to do it. That is why the angle at the centre is $2x$.",
        });
      }
      /* The first lesson on /welcome, so the whole first run (and its win
         screen) can be walked through without a model. */
      if (/Write a three-minute first lesson/.test(prompt)) {
        await new Promise((r) => setTimeout(r, 600));
        return json({
          text: JSON.stringify({
            concept: "Water moves towards more solute",
            hook: {
              question: "A raisin is left in a glass of water overnight. What happens to it?",
              choices: ["It swells up", "It shrinks further", "It dissolves", "Nothing changes"],
              correctIndex: 0,
              feedback: "Water moves into the raisin, where there is more dissolved sugar.",
            },
            explanation:
              "Osmosis is water moving across a membrane from where there is less dissolved stuff to where there is more. A raisin is full of sugar, so water moves in and it swells.",
            check: {
              question: "Which way does water move by osmosis?",
              choices: ["Towards the side with more solute", "Towards the side with less solute", "It stays still", "Only upwards"],
              correctIndex: 0,
              feedback: "Water follows the solute: it moves to where there is more dissolved stuff.",
            },
          }),
        });
      }
      /* Learn: one section, scripted on the section's own title. */
      if (/Teach one section of a student/.test(prompt)) {
        const title = /THIS SECTION: \\"\\"\\"(.+?)\\"\\"\\"/.exec(prompt)?.[1] ?? "this part";
        const q = (question: string, right: string, wrong: string[]) => ({
          question,
          choices: [right, ...wrong],
          correctIndex: 0,
          feedback: `${right} is right because that is what the notes on ${title} say.`,
        });
        await new Promise((r) => setTimeout(r, 900));
        return json({
          text: JSON.stringify({
            concept: title,
            hook: q(`Before we start: what do you think ${title} is mostly about?`, "How the parts relate", ["A list of dates", "A single formula", "Nothing testable"]),
            explanation: [
              `**${title}** is about how fast a reaction goes, and what you can change to speed it up. A reaction only happens when particles **collide** with enough energy.`,
              "```openui\nroot = Stack([d])\nd = Callout(\"definition\", \"The rate of reaction is how much product forms, or reactant is used up, per unit of time.\")\n```",
              "Anything that makes useful collisions happen more often makes the reaction faster. Four things do that:",
              "```openui\nroot = Stack([s, t])\ns = Steps(\"Four ways to speed a reaction up\", [\"Raise the temperature: particles move faster and hit harder.\", \"Raise the concentration: more particles in the same space.\", \"Increase the surface area: more particles exposed to collide.\", \"Add a catalyst: a lower-energy route for the reaction.\"])\nt = CompareTable([\"\", \"Collides more often\", \"Collides harder\"], [[\"Temperature\", \"Yes\", \"Yes\"], [\"Concentration\", \"Yes\", \"No\"], [\"Surface area\", \"Yes\", \"No\"]])\n```",
              "Rates can be worked out from results. For example, if 30 cm³ of gas is made in 60 s:",
              "```openui\nroot = Stack([w])\nw = WorkedExample(\"30 cm³ of gas is made in 60 s. What is the mean rate?\", [\"Mean rate = amount of product ÷ time.\", \"Put the numbers in: 30 ÷ 60.\"], \"0.5 cm³/s\")\n```",
            ].join("\n\n"),
            check: q(`Why does raising the temperature speed up a reaction?`, "Particles collide more often and with more energy", ["Particles get bigger", "The activation energy rises", "There are more particles"]),
            reteach: `Picture a room of people walking around. If everyone speeds up, they bump into each other more often, and harder. Heating a reaction does the same to its particles.\n\n\`\`\`openui\nroot = Stack([k])\nk = Callout("key", "Hotter means faster particles: more collisions, and more of them with enough energy.")\n\`\`\``,
            recheck: q(`A reaction is moved from 20 °C to 40 °C. What happens?`, "It goes faster", ["It goes slower", "Nothing changes", "It stops"]),
          }),
        });
      }
      /* Learn: the overview before part 1 and the recap at the end. */
      if (/Frame a lesson for a student who is about to learn it/.test(prompt)) {
        await new Promise((r) => setTimeout(r, 700));
        return json({
          text: JSON.stringify({
            overview: [
              "**Rates of reaction** is about how quickly a chemical reaction happens, and why some go in a flash while others take years.",
              "It matters because it is how chemists control reactions: making medicines quickly, stopping food going off, keeping factories safe.",
              "1. **Rate factors**: the four things that change how fast a reaction goes.\n2. **Calculating a rate**: turning experiment results into a number.",
              "```openui\nroot = Stack([k])\nk = KeyTerms(\"Words you'll meet\", [[\"Rate\", \"How fast a reactant is used up or a product is made.\"], [\"Collision\", \"Two particles hitting each other.\"], [\"Catalyst\", \"Speeds a reaction up without being used up.\"]])\n```",
            ].join("\n\n"),
            recap: [
              "Both parts are one idea seen two ways: a reaction goes as fast as its particles collide with enough energy, and the rate is how you measure that.",
              "```openui\nroot = Stack([a, b, m])\na = Callout(\"key\", \"More frequent or more energetic collisions mean a faster reaction.\")\nb = Callout(\"key\", \"Mean rate = amount of product ÷ time.\")\nm = Callout(\"mistake\", \"A catalyst is not used up, and it does not change how much product you get.\")\n```",
            ].join("\n\n"),
          }),
        });
      }
      if (/openui demo|Build the study guide/i.test(prompt)) {
        return json({ text: fx.sampleOpenUiReply });
      }
      if (/diagram|draw|sketch|\bsvg\b/i.test(prompt)) {
        return json({
          text: `Here is the whole set on one circle.\n\n\`\`\`svg\n${fx.sampleDiagramSvg}\n\`\`\`\n\nNotice that the angle at the centre (2x) is always double the angle at the circumference (x) standing on the same arc.`,
        });
      }
      return json({
        text: "This is the harness talking — there is no model behind it. Ask for a diagram to see one drawn.",
      });
    }

    /* rpc */
    if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.slice("/rest/v1/rpc/".length);

      if (name.startsWith("boardroom_")) {
        let payload: Record<string, any> = {};
        try {
          const raw =
            init?.body ??
            (input instanceof Request ? await input.clone().text() : null);
          payload = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
        } catch {
          /* fallback */
        }

        if (name === "boardroom_my_workspaces") {
          return json(TABLES.boardroom_workspaces);
        }
        if (name === "boardroom_get_workspace") {
          return json(TABLES.boardroom_workspaces[0]);
        }
        if (name === "boardroom_documents_current") {
          return json(RPCS.boardroom_documents_current);
        }
        if (name === "boardroom_attach_document") {
          return json(null);
        }
        if (
          name === "boardroom_post_with_tasks" ||
          name === "boardroom_post_message"
        ) {
          const threadId = payload.p_thread ?? "t-pricing";
          const content = payload.p_content ?? "";
          const agents: string[] = payload.p_agents ?? [];
          const msgId = `m-${Date.now()}`;

          (TABLES.boardroom_messages as any[]).push({
            id: msgId,
            workspace_id: "ws-1",
            thread_id: threadId,
            author_type: "human",
            author_id: fx.USER_ID,
            agent_id: null,
            submitted_by: null,
            content,
            reply_to: payload.p_reply_to ?? null,
            attachments: payload.p_attachments ?? [],
            status: "posted",
            source_task_id: null,
            created_at: new Date().toISOString(),
            edited_at: null,
            superseded_by: null,
          });

          const taskIds: string[] = [];
          if (agents.length > 0) {
            for (const agId of agents) {
              const taskId = `task-${Date.now()}-${agId}`;
              taskIds.push(taskId);

              // Trigger AI response in background
              setTimeout(async () => {
                try {
                  const aiReply = await runBoardroomAI(
                    agId,
                    content,
                    payload.p_context,
                  );
                  (TABLES.boardroom_messages as any[]).push({
                    id: `m-ai-${Date.now()}-${agId}`,
                    workspace_id: "ws-1",
                    thread_id: threadId,
                    author_type: "ai",
                    author_id:
                      agId === "agent-k"
                        ? fx.USER_ID
                        : "00000000-0000-4000-8000-000000000002",
                    agent_id: agId,
                    submitted_by: fx.USER_ID,
                    content: aiReply,
                    reply_to: msgId,
                    attachments: [],
                    status: "posted",
                    source_task_id: taskId,
                    created_at: new Date().toISOString(),
                    edited_at: null,
                    superseded_by: null,
                  });
                } catch (err) {
                  console.error("AI response error:", err);
                }
              }, 400);
            }
          }
          return json({ message_id: msgId, task_ids: taskIds });
        }
        if (name === "boardroom_submit_response") {
          const taskId = payload.p_task;
          const respContent = payload.p_content;
          const newMsgId = `m-ai-${Date.now()}`;
          (TABLES.boardroom_messages as any[]).push({
            id: newMsgId,
            workspace_id: "ws-1",
            thread_id: "t-pricing",
            author_type: "ai",
            author_id: fx.USER_ID,
            agent_id: "agent-k",
            submitted_by: fx.USER_ID,
            content: respContent,
            reply_to: null,
            attachments: [],
            status: "posted",
            source_task_id: taskId,
            created_at: new Date().toISOString(),
            edited_at: null,
            superseded_by: null,
          });
          return json(newMsgId);
        }
      }

      return json(RPCS[name] ?? null);
    }

    /* tables */
    if (path.startsWith("/rest/v1/")) {
      const table = path.slice("/rest/v1/".length);
      const allRows = TABLES[table] ?? [];
      /* Simple `col=eq.value` filters on reads, so a page that looks one row
         up by id (`.eq("id", x).maybeSingle()`) gets that row and not the
         whole table — supabase-js rejects a list of several there. user_id
         is skipped: fixtures don't always carry it. Writes still echo. */
      const eqFilters = [...new URL(url).searchParams.entries()].filter(
        ([col, value]) => col !== "user_id" && value.startsWith("eq."),
      );
      const rows =
        method === "GET" || method === "HEAD"
          ? allRows.filter((row) =>
              eqFilters.every(
                ([col, value]) =>
                  !(col in (row as object)) ||
                  String((row as Record<string, unknown>)[col]) === decodeURIComponent(value.slice(3)),
              ),
            )
          : allRows;

      /* Writes: echo the payload back so optimistic UI settles instead of
         rolling back with an error toast. */
      if (method !== "GET" && method !== "HEAD") {
        let body: unknown = null;
        try {
          const raw =
            init?.body ??
            (input instanceof Request ? await input.clone().text() : null);
          body = typeof raw === "string" ? JSON.parse(raw) : null;
        } catch {
          /* a write with no JSON body is fine — nothing to echo */
        }
        const echoed = Array.isArray(body) ? body : body ? [body] : [];
        if (table === "learning_events" && method === "POST") {
          for (const row of echoed) {
            if (
              !rows.some(
                (existing) =>
                  (existing as { client_id?: string }).client_id ===
                  row.client_id,
              )
            ) {
              rows.push({ id: `harness-event-${rows.length}`, ...row });
            }
          }
        }
        const written = echoed.map((row, i) => ({
          id: `harness-${Date.now()}-${i}`,
          user_id: fx.USER_ID,
          created_at: new Date().toISOString(),
          ...(row as object),
        }));
        /* `.insert().select().single()` asks for one object back, as reads
           do below; a list there left a new material with no id. */
        const wantsObject = (
          new Headers(init?.headers).get("accept") ??
          (input instanceof Request ? (input.headers.get("accept") ?? "") : "")
        ).includes("vnd.pgrst.object+json");
        return json(wantsObject ? (written[0] ?? null) : written);
      }

      /* `.single()`/`.maybeSingle()` ask PostgREST for an object rather than
         a list, via the Accept header. Answering with the array anyway is
         what left the notebook studio on "Notebook not found". */
      /* supabase-js passes a Headers instance, not a plain object, so the
         header is read through Headers either way. */
      const accept =
        new Headers(init?.headers).get("accept") ??
        (input instanceof Request ? (input.headers.get("accept") ?? "") : "");
      if (accept.includes("vnd.pgrst.object+json")) {
        return json(rows[0] ?? null);
      }

      /* `count: "exact", head: true` reads the count out of content-range. */
      const wantsCount = /count=exact/.test(
        (init?.headers as Record<string, string>)?.Prefer ??
          (input instanceof Request ? (input.headers.get("prefer") ?? "") : ""),
      );
      const headers: Record<string, string> = wantsCount
        ? {
            "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
          }
        : {};

      if (method === "HEAD")
        return new Response(null, { status: 200, headers });
      return json(rows, { headers });
    }

    /* storage: an upload is accepted and named, so the create flow can be
       walked through; there are no files to download. */
    if (path.startsWith("/storage/v1/object/")) {
      if (method === "POST" || method === "PUT") {
        const key = path.slice("/storage/v1/object/".length);
        return json({ Key: key, Id: `harness-${Date.now()}` });
      }
      return json({ error: "No files in the harness" }, { status: 404 });
    }

    /* web research: no results, so the tutor answers without it. */
    if (path.startsWith("/functions/v1/web-research")) {
      return json({ query: "", results: [] });
    }

    /* Anything else on the project's URL is refused here rather than passed
       to the real project: the harness is fixtures only, and its fake
       session must never send study data to production. */
    return json({ error: `Not faked in the harness: ${method} ${path}` }, { status: 503 });
  };
}

/* ------------------------------------------------------------------- boot */

async function boot() {
  const { SUPABASE_URL, supabase } = await import("../lib/supabase");
  install(SUPABASE_URL);

  const s = session();
  await supabase.auth.setSession({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
  });

  /* The document itself is /app/harness.html, which is not a route — without
     rewriting it the router renders its 404 no matter what. */
  const route = new URLSearchParams(location.search).get("route") ?? "/";
  window.history.replaceState({}, "", `/app${route}`);

  const { default: App } = await import("../App");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
