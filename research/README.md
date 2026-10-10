# Learnora: competitor research and learning-engine strategy

Research and planning only. No application code, configuration or database was changed. Produced 2026-10-09 from the repo on branch `tutor-hints-verification` (`a5ac4dd`), read-only aggregate queries against production, and web research. Source IDs (`[C#]`, `[L#]`, `[R#]`) resolve in [sources.md](sources.md).

## Navigation

| File | What it answers |
|---|---|
| [current-state-audit.md](current-state-audit.md) | What Learnora actually does, what's broken or missing, what's distinctive |
| [competitor-matrix.md](competitor-matrix.md) | 20 products compared; table stakes vs rare capabilities |
| [deep-dives.md](deep-dives.md) | Eedi, Math Academy, Khanmigo plus the free chat tutors, Mindspark, Physics Wallah: actual workflows |
| [learning-science.md](learning-science.md) | 12 principles: evidence, application, measurement, limits |
| [learning-engine-architecture.md](learning-engine-architecture.md) | Subsystems A–I, data flow, AI vs deterministic split |
| [efficiency-audit.md](efficiency-audit.md) | Tokens, latency, reliability, cost-per-outcome, ranked opportunities |
| [strategy-roadmap.md](strategy-roadmap.md) | Positioning, ranked opportunities, 4-stage roadmap, experiments, metrics |
| [sources.md](sources.md) | Deduplicated source register with grades and research limits |

## Executive summary

1. **Learnora has built a sophisticated evidence engine that is starved of evidence.** Production has 36 users, 8 active in 30 days, **3 quiz attempts ever**, 13 learning events and 33 misconceptions with 0 resolved [R12]. Every model parameter is hand-set, and none has been validated against learning. The constraint is not modelling sophistication. It is a fast, trustworthy practice loop that students actually repeat.
2. **The practice loop is too slow and unreliable to generate that evidence.** AI quizzes take 24 s on average (p90 34 s) on the fallback provider. Every logged request in 60 days needed a failover. Total outages are deleted from the log rather than recorded [R13, R6]. Quiz verification is built but not deployed [R11].
3. **The knowledge model has correctness gaps.**
   - Topics are matched by word subsets, so "Cells" absorbs "Cell division" evidence [R7].
   - Two different forgetting curves drive the scheduler and the forecast [R3].
   - One correct MCQ answer moves a topic to "Recalled", and "Applied" never requires an application question [R1].
4. **The differentiator is real and rare.** It is the misconception ledger, a narrow catalogue, a *delayed, novel-question* resolution rule, and a hint ladder whose use cannot inflate mastery [R4, R5]. Eedi diagnoses per question [C1]. No reviewed product keeps a persistent cross-tool belief ledger with that resolution test. The guardrail design matches the strongest recent AI-tutoring evidence [L8, L9].
5. **Socratic AI tutoring and "quiz from my notes" are now free commodities** (ChatGPT Study Mode, Gemini Guided Learning, NotebookLM) [C22–C24]. Learnora should not lead with them.
6. **CBSE is promised but not served.** Onboarding offers CBSE Class 9 and 10 [R9], but the syllabus catalogue and question bank cover only AQA GCSE, GCSE Maths and IB [R8]. Learnora is MCQ-only, while CBSE Class 10 papers are about 80% non-MCQ (50% competency-based, 30% constructed response) [C41].
7. **Breadth outran validation.** There are 34 view directories and five overlapping diagnosis tools. The highest-leverage engineering move is *consolidation*: one skill identity, one evidence stream, one "what next" function. A rewrite is not needed.

## Implementation status (2026-10-10, branch `learning-engine`, PR #134)

| Roadmap item | Status | Where |
|---|---|---|
| 1.1 Quiz verification live | Done (learnora-ai v67+) | `supabase/functions/_shared/quizQuality.js` |
| 1.2 AI log: tokens, status, kept failures | Done (v68) | `_shared/tokenUsage.js`, migration `20261009000000` |
| 1.4 One forgetting curve (FSRS) | Done | `lib/trajectory.ts`, `lib/adaptiveLearning.ts` |
| 1.5 Evidence lands on one topic | Done (best match; ties attribute nothing) | `lib/topicKey.ts` `bestTopicMatch` |
| 2.1 Bank-first practice | Done | `api/questionBank.ts` `bankFirst` |
| 2.2 One attempt stream (ref, verified, kind, confidence, time, hints) | Done, in answer payloads (no new table) | `lib/attempts.ts` |
| 2.3 Evidence-gated knowledge model + ladder | Done | `lib/knowledgeModel.ts`, `lib/mastery.ts` |
| 2.4 One "what next" | Partly: `chooseNextStep` reads knowledge and prerequisites; other deciders remain | `lib/nextStep.ts` |
| 2.5 Deterministic numeric grading | Done, all four answer surfaces; 25 numeric CBSE questions | `lib/numericAnswer.ts` |
| 3.1 Distractor-mapped items | Done for 30 CBSE questions; 14 new catalogue beliefs | `scripts/question-bank/cbse-source.mjs` |
| 3.2 Per-answer diagnosis | Done | `lib/diagnosis.ts` |
| 3.3 Placement check | Done | `lib/placement.ts`, `/exams/:id/placement` |
| 3.5 Student-state summary in the tutor | Done | `formatKnowledgeForPrompt` |
| E4 Item cache for bank-question AI text | Done (v69) | `_shared/itemCache.js` |
| CBSE Class 9/10 syllabi | Done (official 2025-26 unit marks) | `lib/syllabus/cbse.ts` |
| 4.2 Retest-delay experiment | Running | `lib/experiments.ts`, `docs/experiments.md` |
| Weekly tutor evals in CI | Built; waits on a `GROQ_API_KEY` repo secret | `.github/workflows/tutor-evals.yml` |
| Oak maths import | Blocked on the Oak API key | `WAITINGONLEDGER.md` 4.5 |

## Proposed position

> Learnora finds what a student believes that is wrong, fixes it, and proves days later on a new question that it stayed fixed, for their exact board, in the minutes they have.

Details and ranking: [strategy-roadmap.md §1–3](strategy-roadmap.md).

---

## Founder briefing

### The three biggest weaknesses today

1. **No reliable, fast practice loop, and therefore no learning data.** 24-second quizzes, a free-tier provider chain, verification not live, and 3 quiz attempts ever [R11–R13].
2. **The student model can be wrong in ways the student sees.**
   - Topics leak evidence through word matching.
   - Two forgetting curves disagree.
   - Mastery rungs over-claim from one MCQ answer, with no correction for guessing.
3. **The product promises CBSE without CBSE content, and spreads across many tools.** It is MCQ-only against an 80%-constructed CBSE paper, with 34 surfaces for 8 active students.

### The three highest-value opportunities

1. **A verified, instant practice loop.** Bank-first items, deterministic grading, one `chooseNext` [O1].
2. **Misconception repair v2.** Distractor-mapped items, a confidence tap, probes on correct answers, and prerequisite remediation on repeated failure [O2]. This builds on the one thing competitors don't do.
3. **One board done properly, plus a 12-item placement check** [O3, O4]. Teaching at the measured level produced Mindspark's large effects in India [C10].

### The first five engineering tasks

1. **Ship quiz verification.** Merge PR #133 and deploy `learnora-ai`, then run the ledger smoke test. *(Owner action; the code exists.)*
2. **Instrument `ai_request_log`.** Add tokens, cost and status, and keep failed rows flagged instead of deleting them (efficiency E1).
3. **Bank-first practice plus the Oak maths import.** Covered skills serve in under 1 s, with no AI call (E2).
4. **Unify forgetting on FSRS retrievability, and stop read-time subset-word topic joins.** Write `skill_id` on new events (roadmap 1.4, 1.5).
5. **Add confidence, `response_ms` and `hint_rung` to a single attempt-event stream** (roadmap 2.2). It is cheap, and every later diagnostic depends on it.

### Assumptions to validate with real students

- Students will tap a confidence rating on most answers without abandoning practice.
- Resolved misconceptions stay resolved: recurrence within 30 days is low.
- The catalogue's repair beats a generic explanation on recurrence (experiment 4.1).
- Students act on a single "do this now" recommendation more than on a menu of tools.
- CBSE students want diagnosis and practice from Learnora, given they already have PW-style doubt-solving and video [C27]. Unvalidated: no CBSE users are known.
- The forecast's "points per hour" changes what students choose to study, and its predictions match past-paper results.

### What not to build yet

- More AI tools or surfaces. Consolidate the five diagnosis tools into tutor modes instead.
- A video library, voice tutor or image generation.
- Social features: rooms, leaderboards, peer benchmarking (also pending a privacy review).
- Deep-learning knowledge tracing, a full knowledge graph, or per-user FSRS fitting. None can work at the current data volume.
- LLM marking that feeds mastery for long answers, until it agrees with teachers (κ ≥ 0.7).
- Multi-board breadth. Pick one board and finish it before adding others.

---

## Quality-gate notes

- All 20 products in the matrix are real and in use or documented. BYJU'S is included as a cautionary case [C39].
- Pages read through search summaries rather than fetched in full are marked *(summary)* in [sources.md](sources.md). No product was used hands-on, and the Perplexity and GitHub MCP servers failed to connect.
- Proposed components are labelled as proposals. Existing parts are marked *(exists)* in the architecture.
- Production data was read only as aggregates. No student content was queried.
