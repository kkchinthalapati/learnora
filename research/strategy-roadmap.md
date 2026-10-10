# Strategy, differentiation and roadmap

Builds on [current-state-audit.md](current-state-audit.md) (what exists), [competitor-matrix.md](competitor-matrix.md) and [deep-dives.md](deep-dives.md) (the market), [learning-science.md](learning-science.md) (what works), [learning-engine-architecture.md](learning-engine-architecture.md) (the design) and [efficiency-audit.md](efficiency-audit.md) (the cost).

---

## 1. Strategic position

> **Learnora finds what a student believes that is wrong, fixes it, and proves days later on a new question that it stayed fixed, for their exact board, in the minutes they have.**

Why this position, and not "AI tutor":
- **Socratic AI tutoring is free and everywhere** (ChatGPT Study Mode, Gemini Guided Learning) [C22, C23]. Quizzes and flashcards from your notes are free too (NotebookLM) [C24]. Competing there is competing with $0.
- **Diagnosing misconceptions is rare and evidenced.** Eedi does it per question for UK maths [C1, C3]. No product reviewed keeps a *persistent, cross-tool belief ledger with a delayed, novel-question resolution test*. Learnora already has that machinery [R4].
- **Guardrails are where AI tutoring wins or harms** [L8, L9]. Learnora's hint-ladder rules [R5] are already aligned with that evidence.

## 2. The landscape in one table

| Category | Items |
|---|---|
| **Becoming standard (match cheaply, don't lead with)** | Socratic chat; quizzes and flashcards from uploads; board-specific content (UK); photo doubt-solving (India) [C22–C24, C30, C27] |
| **Expensive distractions (do not build now)** | Video lesson library (PW, BYJU'S scale) [C27, C39]; social features, study rooms, leaderboards, peer benchmarking; more "AI tools" (a sixth diagnostic surface); image generation; voice tutoring; deep-learning knowledge tracing; a full Math-Academy-style knowledge graph |
| **Student problems handled poorly by the market** | (1) "I feel like I know it" vs actually knowing; (2) confidently held wrong beliefs that resurface in the exam; (3) feedback on written and competency answers; (4) "I have 30 minutes, what now?" with a defensible answer; (5) honest readiness, not a flattering %. |
| **CBSE-specific openings** | 50% competency-based questions in Class 10 [C41], which the MCQ-recall tools serve badly; two board exams from 2026 [C40], giving two planning horizons and a natural "improvement exam" use case; NCERT as the single content anchor (licence **unresearched**). Khanmigo's paid learner plan is US-only [C14]. |
| **Feasible with Learnora's resources** | Bank-first verified practice; distractor-mapped items for a few hundred core skills; deterministic numeric grading; one `chooseNext`; a placement check. All build on existing modules. |
| **Needs evidence before investment** | LLM marking of long CBSE answers; careless-vs-conceptual classification; forecast accuracy; any gamification. |

## 3. Ranked opportunities

Scored 1–5. For effort and operating cost, 5 means *cheapest*. Time to validate: 5 means fastest.

| Opportunity | Learning value | Evidence strength | Differentiation | Effort (5 = low) | Op. cost (5 = low) | Validate fast | **Total** |
|---|---|---|---|---|---|---|---|
| **O1. Verified, instant practice loop** (bank-first, deterministic grading, one `chooseNext`) | 5 | 5 [L1, L3] | 2 | 4 | 5 | 5 | **26** |
| **O2. Misconception repair loop v2** (distractor-mapped items, confidence tap, correct-answer probes, prerequisite step) | 4 | 4 [C1, C3, L10, C5] | **5** | 3 | 5 | 3 | **24** |
| **O3. One board, done properly** (pick UK GCSE *or* CBSE Class 10 science and maths: skills, items, competency-style numeric items) | 4 | 3 [C30, C41] | 3 (CBSE: 4) | 2 | 4 | 3 | **19–20** |
| **O4. 12-item placement check** | 4 | 4 [C10, C12, C5] | 2 | 3 | 5 | 4 | **22** |
| **O5. Scheme-based marking of short constructed answers** (experiment) | 4 | 2 | 4 | 2 | 3 | 2 | **17** |

### Why each beats its strongest alternative

- **O1 vs "improve the AI tutor".** The tutor is a free commodity, and a 25-second quiz [R13] kills the loop that produces all evidence. Retrieval practice is the best-evidenced lever [L1, L3]. Without O1, nothing else gets data.
- **O2 vs "add more AI diagnostic tools".** Five tools already diagnose. They produce unverified labels (33 ledger rows, 0 resolved [R12]). Distractor mapping makes diagnosis *deterministic and free* [C1]. Confidence separates belief from guess [L10]. The prerequisite step comes from Math Academy's remediation rule [C5].
- **O3 vs "support every board shallowly".** Board-exact content is table stakes [C30]. Shallow multi-board coverage produced a CBSE onboarding option with no CBSE content behind it [R9]. **This choice is a DECISION** (see §6): which market the next 100 students come from.
- **O4 vs "let the forecast learn over time".** Every topic starts at an arbitrary 0.25 prior. The largest Indian effect came from teaching at the measured level [C10], and a capped check is cheap [C12].
- **O5 vs "LLM-grade everything".** Ungrounded LLM judgement of answers failed publicly at Khan [C15]. Keep O5 an experiment with a κ gate before it feeds mastery (architecture D).

## 4. Roadmap

Adapted to the codebase. Stages are *dependency order*, not separate releases; Stage 1 items can ship independently within days.

### Stage 1: correctness, reliability, measurement (unblock everything)

| ID | Initiative | Problem → evidence | Benefit | Existing parts | Effort | Risks | Acceptance criteria | Evaluation | Success |
|---|---|---|---|---|---|---|---|---|---|
| 1.1 | **Ship quiz verification** (merge PR #133, deploy `learnora-ai`) | Wrong keys in AI questions (`quizQuality.js` header); prod v66 lacks the checker [R11] | Grades students can trust | Whole pipeline *(exists)* | S (owner action) | Checker outage → unverified (labelled) | `ai_request_log` shows `mode='verify'` rows; unseeded subjects show "unverified" | Ledger smoke test (WAITINGONLEDGER row 3) | ≥ 95% of served AI questions verified in the first week |
| 1.2 | **Instrument AI log** (E1) | No cost, tokens or outages [R13] | Enables cost per outcome | `ai_request_log`, `session_key` | S | Migration (follow `db-migration-safety`; add a ledger row) | Every request row has status, tokens, cost; total failures retained | Daily availability query | Cost per session reported for 2 consecutive weeks |
| 1.3 | **Reliable primary provider + task routing** (E5) | Free-tier chain, failovers on every logged call [R13, R11] | Practice and tutor actually respond | Provider chain, allowlist | S + DECISION | Budget; new provider means disclosure update (test enforces) | p90 tutor latency < 8 s; failover share < 10% | E1 dashboard | 2 weeks without a full outage |
| 1.4 | **One forgetting model** (E11) | Forecast and scheduler disagree [R3] | Consistent "fading" and due | `srs.ts`, `trajectory.ts` | S | Forecast numbers shift | `computeRetentionProbability` uses FSRS R with persisted S | Unit tests | No card is "fading" in one view and "not due" in another |
| 1.5 | **Topic identity fix, step 1**: stop subset-word joins at read time; write `skill_id` on new events and items (S1) | False evidence joins [R7] | Correct per-topic evidence | `topicKey.ts`, `syllabus` | M | Legacy rows unmapped (keep the fallback for them, flagged) | New quiz answers carry `skill_id`; "Cell" no longer matches "Cell division" | Unit tests on known collisions | Zero cross-topic evidence leakage on a fixture set |

### Stage 2: foundational learning engine

| ID | Initiative | Problem → evidence | Benefit | Existing parts | Effort | Risks | Acceptance | Evaluation | Success |
|---|---|---|---|---|---|---|---|---|---|
| 2.1 | **Bank-first practice** (E2) + import Oak maths (ledger: `--apply`) | 24 s quizzes, 3 a day [R13]; best lever is retrieval [L1] | Instant, trusted practice | `question_bank`, importer *(exist)* | M | Repetition; Oak coverage is maths only | Covered skills serve in < 1 s; exposure tracked | E1 latency; repeat rate | Median practice items per active student per week doubles vs baseline |
| 2.2 | **Attempt-event stream** (S2) with confidence, `response_ms`, `hint_rung` | Evidence scattered; no confidence on answers | Data for every later stage | `learning_events` | M | Migration; UI friction from the confidence tap | All practice surfaces write the same event | Tap completion rate | ≥ 80% of answers carry confidence without a drop in completion |
| 2.3 | **Guess-adjusted, evidence-gated knowledge model** (architecture A) | One correct answer → "Recalled"; "Applied" without an application item (audit §3.1) | Honest mastery | `trajectory`, `mastery` | M | Students see lower levels than before | Rung requires item-type evidence; secure requires distinct items and days | Calibration (Brier) on next new-item attempt | Better calibration than the current fold on the same events (offline replay) |
| 2.4 | **One `chooseNext`** (S3) | Six deciders (audit §3.2) | One coherent answer to "what now" | `todayPlan`, `nextStep`, `trajectory`, `specPriorities` | M | Behaviour change on Today | All "next" surfaces call it; each card shows a reason | Snapshot tests per scenario | No two surfaces recommend different next skills for the same state |
| 2.5 | **Deterministic numeric grading** (E9) | MCQ only, while CBSE is 80% non-MCQ [C41] | Constructed answers without AI cost | New pure module | M | Units and format variety | Tolerance, units and sig-fig checks on a 200-item fixture | Fixture accuracy | ≥ 98% agreement with a human key |

### Stage 3: personalisation, mastery, retention

| ID | Initiative | Problem → evidence | Benefit | Existing parts | Effort | Risks | Acceptance | Evaluation | Success |
|---|---|---|---|---|---|---|---|---|---|
| 3.1 | **Distractor-mapped items for core skills** (O2) | Diagnosis via text cues on 45 beliefs [R4]; Eedi model [C1] | Deterministic, free diagnosis | Catalogue, bank schema | L (authoring) | Authoring cost; needs teacher review | ≥ 150 items for the chosen board's top-weighted skills, each distractor mapped | Teacher review sample | ≥ 80% teacher agreement on mappings |
| 3.2 | **Per-answer classification table** (architecture B) incl. correct-answer probes and the prerequisite step | Single-signal diagnosis; no prerequisite remediation [C4, C5] | Fewer false labels; gaps fixed at the root | `mistakeLoop`, syllabus prerequisites | M | Over-probing annoys students | Table implemented, with unit tests per row | Ledger precision review | Ledger precision ≥ 80%; recurrence falls (Stage 4 experiment) |
| 3.3 | **Placement check** (O4) | 0.25 prior everywhere | Teaching at level [C10] | Onboarding, syllabus | M | Onboarding drop-off | ≤ 12 items; skip allowed; no feedback | Placement accuracy (§B) | ≥ 75% of placed-secure skills correct on first practice |
| 3.4 | **Skill-level expanding-interval review**, misconception retests in the same due queue (architecture F) | Quiz-only topics never scheduled | Retention beyond cards | `mistakeLoop` (2-day retest), `srs` | M | Queue overload (Math Academy users complain [C7]) | Daily due cap ≤ 40% of minutes | Calibration of due-time recall | Due-item recall 70–90% (neither too easy nor too hard) |
| 3.5 | **Student-state summary + tool consolidation** (E6, E10) | Repeated context; five diagnosis surfaces | Consistency; fewer tokens | `formatMisconceptionsForPrompt`, `evals/` | L | Prompt regressions | Evals pass at ≥ the pre-change rate | `evals/run.mjs` | Equal or better eval pass with fewer input tokens (E1) |

### Stage 4: differentiation experiments

| ID | Experiment | Hypothesis | Design | Primary outcome | Decision rule |
|---|---|---|---|---|---|
| 4.1 | **Repair format** | A catalogue repair plus contrast example reduces recurrence more than a generic explanation | Within-student, randomised *per misconception* (both arms get help; only the format differs) | Recurrence of the same belief within 14 days on new items | Ship the better arm if the difference is ≥ 10 points with a 95% CI excluding 0. Otherwise keep the cheaper arm. |
| 4.2 | **Retest delay** | A 2-day vs 4-day retest changes durable correction | Randomise `RESOLVE_AFTER_DAYS` per misconception | Correct on a 14-day delayed new item | As 4.1 |
| 4.3 | **Interleaved review** | Mixed review beats per-topic review for transfer [L6] | Alternate weeks, within student | Accuracy on unseen mixed exam-style items at +7 days | As 4.1 |
| 4.4 | **Short-answer scheme marking** (O5) | LLM rubric marking agrees with teachers on CBSE short answers | 200 human-marked answers per subject | Cohen's κ | Feed mastery only if κ ≥ 0.7 |
| 4.5 | **Hint-dependence check** (replicating [L8] in Learnora) | Heavy ladder use does not hurt unassisted performance under the no-credit rule | Observational, then randomised ladder availability on a skill subset | Unassisted delayed accuracy | If harm appears, require an attempt before rung 1 |

**Power reality:** with 8 active students these experiments cannot reach significance. Run them as *within-student* designs (many skills and misconceptions per student) and treat early results as directional. Pre-register the decision rule here before looking at data.

**Ethics:** never withhold a known-effective support. Randomise *format and timing*, not access. Users are 13+; follow the existing consent flow, and get a privacy review before any experiment that changes what data is collected (ledger rows 6.x).

## 5. Metrics

| Tier | Metric | Definition | Why |
|---|---|---|---|
| **Outcome** | **Delayed retention** | Accuracy on *unseen* items for a skill, 7–14 days after it was last practised | The real learning signal |
| **Outcome** | **Unseen-question performance** | First-attempt accuracy on new, verified, board-aligned items | Transfer, not memorisation |
| **Outcome** | **Error recurrence** | Share of resolved misconceptions that reappear within 30 days | Tests the differentiator |
| **Outcome** | **Time to demonstrated mastery** | Minutes of practice from first attempt to `secure` (architecture A5) | Efficiency of learning |
| Quality | Diagnostic precision | Teacher-agreement share on sampled ledger rows | Guards against false diagnoses |
| Quality | Grading accuracy | Upheld key reports per 1k; κ for rubric grading | Trust |
| **Leading** | Weekly active practisers | Students with ≥ 10 graded attempts in a week | Volume the engine needs |
| Leading | Due-queue completion | Share of due items done within 2 days | Retention behaviour |
| Leading | Confidence-tap completion | Share of answers with confidence | Diagnostic input health |
| Ops | Latency | p90 time to next practice item; tutor first response | Loop viability |
| Ops | Cost per session; cost per resolved belief | [efficiency-audit §3](efficiency-audit.md) | Sustainability |

Leading indicators can rise while learning falls; for example, easier items raise completion. **Never ship on a leading indicator alone** when an outcome metric moves the other way.

## 6. Blocking unknowns (record and proceed)

1. **Which market are the next 100 students in: UK GCSE or CBSE?** This decides O3. Content exists only for UK and IB [R8], while the onboarding promises CBSE [R9]. *Decision for the founder.*
2. **NCERT licence terms** for deriving questions. Not researched. Needed before any CBSE item authoring at scale.
3. **Provider spend.** Which paid provider to make primary (E5). *Decision for the founder.*
4. **Teacher access** for validating the catalogue and distractor mappings (the plan already calls for teacher interviews).
5. **Current CBSE circulars.** The exam-pattern figures here come from secondary sources [C40, C41].
