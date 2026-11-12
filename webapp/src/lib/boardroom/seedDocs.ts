/* Starter knowledge-base documents.
 *
 * Every line below was taken from a file in this repository on 2026-11-08
 * (CLAUDE.md, webapp/DESIGN.md, webapp/package.json, WAITINGONLEDGER.md,
 * supabase/migrations/, git log). Where the repo says nothing, the document
 * says so instead of guessing: a founder should fill those gaps in the
 * Boardroom, which keeps every version. Nothing here claims a capability the
 * repo does not show.
 *
 * No credentials are copied. (PROJECT.md contains a test-account password;
 * it is deliberately not used as a source.) */

export interface SeedDoc {
  slug: string;
  title: string;
  category: string;
  content: string;
}

export const SEED_DOCS: SeedDoc[] = [
  {
    slug: "LEARNORA_OVERVIEW.md",
    title: "Learnora overview",
    category: "overview",
    content: `# Learnora overview

Source: repository state on 2026-11-08.

Learnora is a study app. The live app is the React project in \`webapp/\` (Vite, TypeScript, Vitest). The root \`*.html\` files are static marketing and policy pages only (landing, about, contact, privacy, developers, 404).

## What a student does (webapp/DESIGN.md §0.1)
- **Home** (\`/\`): one box to add something to study, where you left off, what to fix, your lessons.
- **Subject** (\`/subjects/:id\`): a course such as Biology; holds lessons, an exam date and its share of the week.
- **Lesson** (\`/lessons/:materialId\`): one thing being learned (an upload, a link, notes or a topic) with its notes, cards, quiz, tutor and mistakes.
- **Progress** (\`/analytics\`): History, Mistakes and Exam forecast.
- **Plan**: week plan, free time, tasks and exams, reached from Subjects.
- **Library**: everything saved.
- Study tools are modes of one session (\`/study/:id\`): Explain, Socratic, Practice, Teach, Recall.
- Guided focus-mode sessions exist for check-back, tell-apart and past-you (see routes in \`webapp/src/routes.tsx\`).

## Backend
Supabase (Postgres with row-level security, auth, edge functions). Hosting and CSP are configured in \`vercel.json\`.

## Not written down in the repo
Target users, pricing strategy and traction numbers are not recorded in the files used for this document. Founders: add them here.
`,
  },
  {
    slug: "ARCHITECTURE.md",
    title: "Architecture",
    category: "architecture",
    content: `# Architecture

Source: \`webapp/package.json\`, \`webapp/src/\`, \`supabase/\`, \`WAITINGONLEDGER.md\` (2026-11-08).

## Frontend (\`webapp/\`)
- React 19, React Router 8, TanStack Query 5, TypeScript 6, Vite 8; tests with Vitest, Testing Library and Playwright; lint with oxlint.
- Styling: CSS Modules over CSS custom properties (\`webapp/src/styles/tokens.css\`); no Tailwind or component library.
- Every signed-in screen is a lazy route in \`webapp/src/routes.tsx\`; the entry bundle carries only public and auth routes.
- One Supabase client in \`webapp/src/lib/supabase.ts\`; the publishable key is in source and Row Level Security is the access boundary. API modules live in \`webapp/src/api/\`, hooks in \`webapp/src/hooks/\`, pure logic in \`webapp/src/lib/\`.
- Markdown from AI output is rendered to React elements (\`lib/markdownToReact.tsx\`), never with \`dangerouslySetInnerHTML\`.

## Backend (\`supabase/\`)
- Postgres migrations in \`supabase/migrations/\`. They are applied by hand; production has drifted from the file timestamps, so \`supabase db push\` is not used (WAITINGONLEDGER.md).
- Edge functions: \`learnora-ai\`, \`web-research\`, \`delete-account\`, \`stripe-billing\`, \`stripe-webhook\`, \`send-email-reminders\`, \`send-push-reminders\`.
- AI provider routing and fallback live in \`supabase/functions/learnora-ai\` and \`supabase/functions/_shared\`.
- Realtime is used by study rooms (\`hooks/useStudyRoom.ts\`) and by the Boardroom.

## Integrations recorded in the ledger
Stripe (billing), Google and Apple sign-in, email reminders (no provider configured as of the last ledger check), web push reminders.

## Not written down in the repo
Scaling limits, backup policy and incident process.
`,
  },
  {
    slug: "PRODUCT_VISION.md",
    title: "Product vision",
    category: "product",
    content: `# Product vision

Source: \`webapp/DESIGN.md\` and the migration history. The repo has no vision statement; what follows is only what the code and design rules show.

- The identity is "the exercise book": the page where you put right what you got wrong. That is what the mistakes ledger is (DESIGN.md §0.8).
- A misconception ledger exists in the database (\`20260907000000_add_misconception_ledger.sql\`) and drives the mistake loop and check-backs.
- Copy rules (DESIGN.md §0.6): plain second person, no hype words, never claim something the data does not support.
- Dark-first, accent presets in Settings (DESIGN.md §0.7).
- An experimental class misconception map exists behind the \`classMap\` flag, held for a privacy review.

## For the founders to write
Who the product is for first, what "success" means in numbers, and what Learnora deliberately will not do. Add it here and every later prompt will include it.
`,
  },
  {
    slug: "DESIGN_SYSTEM.md",
    title: "Design system",
    category: "design",
    content: `# Design system

Source: \`webapp/DESIGN.md\` (the rulebook; read it for detail).

- CSS Modules plus custom properties. Use only the current scales: space \`--s-*\`, radius \`--r-*\`, type \`--fs-*\`, semantic colour tokens (no hex in a module).
- Top bar, no sidebar. A page that has parts uses \`Tabs\`.
- Every page starts with one \`PageHeader\`: a serif title, at most one sentence, actions on the right. No eyebrow above a title.
- One primary button per screen. Sentence case. Buttons start with a verb. No exclamation marks.
- Lists use \`ListRow\`; status uses \`Chip\`/\`Badge\`; progress uses \`ProgressRing\`; empty states use \`EmptyState\` with one next action.
- Flat by default (hairline borders); shadows only on menus, drawers and the sticker elements named in the rulebook.
- Motion uses \`--t-fast\`/\`--t\` inside \`prefers-reduced-motion: no-preference\`.
- Student-facing words: lesson (not file), subject (not folder), cards (not flashcards), mistakes (not misconceptions).
- Tests guard the system: contrast, touch targets, focus-visible and a style-drift baseline live in \`webapp/src/styles/\`.
`,
  },
  {
    slug: "ENGINEERING_STANDARDS.md",
    title: "Engineering standards",
    category: "engineering",
    content: `# Engineering standards

Source: \`CLAUDE.md\`, \`webapp/src/migrations.test.ts\`, \`webapp/src/routeIntegrity.test.ts\`, \`WAITINGONLEDGER.md\`.

- Features and fixes go in \`webapp/\`. Do not build features in the static root pages.
- \`archive/\` holds old planning documents whose work is merged; it is not a source of current status.
- **WAITINGONLEDGER.md** lists everything only a person can do (migrations to apply, functions to deploy, secrets, decisions). Update it in the same commit as any change that adds or completes such a dependency. Mark rows verified only with a date, after checking production.
- **Migrations** (checked by \`migrations.test.ts\`): a \`Revert:\` note, \`create ... if not exists\`, every policy dropped before it is created, named constraints dropped before added, RLS enabled on every new table, nothing that destroys data unguarded. Apply one migration at a time; never \`supabase db push\`.
- **Routes** (checked by \`routeIntegrity.test.ts\`): every link target must resolve to a declared route, and no link may point at a legacy alias.
- Run \`npm test\` (Vitest) in \`webapp/\`; lint with \`npm run lint\`; build with \`npm run build\`.
- Error messages shown to users pass through \`lib/friendlyError.ts\`.
`,
  },
  {
    slug: "KNOWN_ISSUES.md",
    title: "Known issues",
    category: "issues",
    content: `# Known issues and open dependencies

Source: \`WAITINGONLEDGER.md\` (rows marked UNVERIFIED have not been re-checked against production), 2026-11-08.

- Reminder email: the ledger records \`send-email-reminders\` answering 500 "No email provider configured" and an empty \`email_notification_log\`, so no reminder email had been sent as of its last check. It waits on a mail provider and domain.
- Class misconception map: migration \`20261028000000_class_misconception_map.sql\` is not applied and the feature is flagged off, pending a privacy review.
- \`learnora-ai\`: a later change (photo fallback to vision models) was merged but not deployed, by the owner's choice (ledger §3).
- Migration history in production differs from the repo's file timestamps (known drift).
- Secrets cannot be read by an agent; every secret row in the ledger is UNVERIFIED until someone runs \`supabase secrets list\`.

Full list and owners: \`WAITINGONLEDGER.md\`.
`,
  },
  {
    slug: "ROADMAP.md",
    title: "Roadmap",
    category: "roadmap",
    content: `# Roadmap

The repo contains no roadmap file, so none is invented here.

What the repo does show as pending work, from \`WAITINGONLEDGER.md\` (2026-11-08):
- Mail provider and domain for reminder emails.
- Privacy review, then applying the class-map migration.
- Optional Apple sign-in setup.
- Stripe configuration rows in ledger §4.1.

Founders: record real priorities here, then turn the ones you commit to into Boardroom proposals.
`,
  },
  {
    slug: "CURRENT_SPRINT.md",
    title: "Current sprint",
    category: "sprint",
    content: `# Current sprint

No sprint plan exists in the repo. This is what the history shows, as of 2026-11-08 (branch \`daily-return\`):

Recent commits:
- Record where new students leave the first run
- Count Learn lessons once in the AI usage meter
- Bring students back when a check or cards are due
- Merge of PR #164 (note visuals): put cards and a drawing in generated notes reliably

Founders: replace this with what you are actually committing to this week.
`,
  },
  {
    slug: "DECISIONS.md",
    title: "Decisions log",
    category: "decisions",
    content: `# Decisions log

Founder decisions are recorded in the Boardroom's Decisions section, where each needs every founder's vote. This document holds decisions that were already written into the repo before the Boardroom existed:

- The vanilla JS shell was deleted on 2026-09-16; \`/terms\`, \`/verify\` and \`/reset-password\` are routes in \`webapp/\` (CLAUDE.md).
- \`supabase db push\` is not used because migration history has drifted (WAITINGONLEDGER.md).
- Old planning documents live in \`archive/\` and are not treated as current status (CLAUDE.md).
- The app has a top bar and no sidebar (webapp/DESIGN.md §0.2).
`,
  },
];
