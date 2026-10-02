# Production by December 2026 — status

Tracks the "Learnora production by December 2026" plan against the code. Branch:
`ccr-21911d53-k2odo3`. Production project: `mlvgqwqiynpwpwzqufdf`. Last updated
2026-10-02.

## Section 0: deployment blockers

| Item | State |
|------|-------|
| A1–A3 migrations | ✅ Applied 2026-10-02 (see `unmergedsupabase.md`) |
| B1a, B1b, B2a migrations (already on `main`) | ✅ Applied 2026-10-02 |
| `learnora-ai` v65 | ✅ Deployed 2026-10-02, byte-identical to `main` |
| Remove `CEREBRAS_API_KEY` secret | ❌ Needs CLI or dashboard: `supabase secrets unset CEREBRAS_API_KEY` |
| Smoke test (one Explain session, check `ai_request_log.provider/model/latency_ms`) | ❌ No AI traffic since 2026-09-26 |
| Legal sign-off (provider text, retention, GDPR/COPPA) | ❌ Not engineering |

## Tier 1

### 1.1 Exam-board ledger: done on the branch

- `webapp/src/lib/syllabus/` holds the catalogue: AQA GCSE Biology 8461, Chemistry 8462 and
  Physics 8463; GCSE Maths for AQA 8300, Edexcel 1MA1 and OCR J560; IB Biology, Chemistry
  and Physics (first assessment 2025). Each has papers, units, spec-referenced topics,
  tier-only topics and prerequisites.
- It is reference data shipped with the app, not tables. Exams store `syllabus_id` and
  `syllabus_tier` (migration `20261002000000`, already applied).
- Weights: GCSE Maths uses the DfE content weightings. The sciences are estimated (each
  paper's share spread over its topics) and the UI says so.
- Wired in:
  - Exam dialog picker
  - Onboarding exam-board step
  - Every AI prompt that uses the student's level (`studentStandard`)
  - Exam-prep plan blocks, which name the highest-value topic
  - The chat and weekly-plan exam list
- Not done:
  - AP/SAT
  - Other GCSE boards for the sciences
  - The past-paper question bank. It needs licensed sources: exam board past papers are
    copyrighted.

### 1.2 Misconception repair: done on the branch

- `webapp/src/lib/misconceptionCatalogue.ts` has 45 named misconceptions across Biology,
  Chemistry, Physics and Maths. Each has a category, why it's wrong, a re-teach and a check
  question.
- Detection fires only when the student's own wrong pick (or Teach explanation) states the
  belief. Negated statements are ignored.
- `MisconceptionRepair` appears in three places:
  - Under a matching wrong quiz answer
  - In Teach mode
  - As "Quick fix" on the dashboard's Mistakes to Review
- Outcomes are written to the existing ledger: evidence when shown, a correction only when
  the check is passed.
- Not done: the teacher interviews the plan calls for. The catalogue is a first set to
  validate with teachers.

### 1.3 Analytics: done on the branch

`/exams/:examId` shows, all scoped to quizzes on this exam's topics:

- Topics ranked by share of the exam × need
- The forecast taken apart into its steps
- Confidence calibration, from the ratings students already give
- Misconceptions on this exam
- Scores over time

### 1.4 Material grounding: done on the branch, lexical not vector

- Explain plans and in-session answers retrieve the top matching passages from the
  student's notes and pasted text (BM25, in the browser). Each step shows "From your notes"
  with links.
- Deliberately no embeddings yet, so no new provider receives study data.
  `loadGroundingPassages` is the seam for a pgvector version.

## Tier 2

| Item | State |
|------|-------|
| 2.1 Onboarding | ✅ First run already set topic, exam date and plan; it now asks for the exam board too |
| 2.2 Progress export | ✅ "Save as PDF" on the exam page (print stylesheet, no new dependency) |
| 2.3 Session recovery | ✅ Live now that A3 is applied (client shipped in PR #122) |
| 2.4 Push notifications | Already exists (`send-push-reminders`); lapsed-topic wording not reviewed |
| 2.5 Fallback question bank | ❌ Needs licensed content |
| 2.6 Peer benchmarking | ❌ Not started (needs a privacy review) |

## Before merging the branch

1. Review and merge `ccr-21911d53-k2odo3`. Vercel deploys the webapp.
2. No further Supabase step: C1 is already applied.
