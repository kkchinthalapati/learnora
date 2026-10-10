# Current-state audit: what Learnora actually is (2026-10-09)

Source: code read on branch `tutor-hints-verification` (clean, at `a5ac4dd`), plus read-only aggregate queries against production [R12, R13]. "Works" means the code implements it and has unit tests. It does **not** mean there is evidence that it helps students learn. With current usage, nothing here has been validated on learning outcomes.

## 0. The fact that frames everything else

Production on 2026-10-09 [R12]:

| Metric | Value |
|---|---|
| Registered users | 36 |
| Signed in during the last 30 days | 8 |
| `quiz_attempts`, all time | **3** |
| `learning_events`, all time | 13 |
| Flashcards (with FSRS state) | 99 (16) |
| Misconceptions logged / resolved | 33 / **0** |
| AI requests, last 30 days | 159 (last on 2026-10-05) |

Learnora has built a large evidence-modelling apparatus (forecasts, mastery ladder, misconception ledger, calibration) with almost no evidence flowing into it. Every parameter in it is a hand-set constant. **The binding constraint is not model sophistication. It is getting students through a short, reliable loop often enough to produce data.**

## 1. Learning capabilities and user journeys (actual)

| Subsystem | Implementation | Assessment |
|---|---|---|
| **Destinations** | 34 view directories under `webapp/src/views`: today, plan, review, quiz, session, ai-tutor, feynman, sparring, debugger, premortem, exam-detective, study-lab, notebooks, trajectory, lifesync, room, friends, achievements, … | Broad. Several tools overlap in purpose (diagnose a wrong belief: debugger, feynman, sparring, premortem, exam-detective). |
| **Spaced repetition** | FSRS-4.5 in `views/review/srs.ts`, with S and D persisted (migration `20260905…`) [R2] | Sound choice. FSRS is the best-performing open scheduler [C33]. The repo pins FSRS-4.5 defaults; FSRS-7 is current. |
| **Quizzes** | AI-generated MCQs. Grading is deterministic, by `correctIndex`. Verification pipeline: drop questions that need an unseen figure, run a second-model solve check, regenerate failures, shuffle options [R6] | Good design. **Not live**: production `learnora-ai` is v66 without verification [R11]. Fails open ("unverified"), and MCQ only. |
| **Question bank** | 228 Learnora-written MCQs (AQA GCSE sciences, GCSE Maths). Oak importer (OGL, ~1,050 maths questions) built but not applied [R8] | The only content with a trusted key. Used as a fallback, not as the primary path. |
| **Curriculum** | `lib/syllabus/catalogue.ts`: AQA GCSE Bio, Chem and Phys; GCSE Maths (AQA, Edexcel, OCR); IB sciences. Includes topics, weights and prerequisites [R8] | **No CBSE or ICSE syllabus**, although onboarding offers "CBSE Class 10" and "CBSE/ICSE Class 9" [R9]. |
| **Mastery model** | `trajectory.ts` `TopicState {mastery, evidence, stabilityDays}`. Topic = flashcard deck. Score events are blended by EMA (weight 0.35, halving for each older event). The ladder in `mastery.ts` maps the scalar to Seen, Recalled, Applied or Explained [R1] | Honest about uncertainty (unmeasured ≠ 0, confidence bands). Weaknesses are listed in §3. |
| **Forecast / planning** | Projection to exam day with memory decay, available hours (Life Sync), points per hour per topic, and a "drift" counterfactual | Ambitious and well documented, but every constant is hand-set and nothing has been back-tested against real outcomes. |
| **Misconception ledger** | `misconceptions` and `misconception_observations` tables. Extractors for each AI tool. Ranking by severity × net evidence × recency. Fed back into prompts (`formatMisconceptionsForPrompt`) [R4] | **The strongest idea in the codebase.** See §4. |
| **Misconception catalogue** | 45 named beliefs (Bio 18, Chem 11, Phys 10, Maths 7), each with a re-teach and a check. Fires only when the student's own wrong option states the belief [R4] | Careful precision-first design. Small, UK-framed and not yet teacher-validated (per `plans/PRODUCTION_DEC_2026_STATUS.md`). |
| **Mistake loop** | match → repair → retest at least 2 days later on a *new* question → resolved. A DB trigger mirrors the TS rule [R4] | Pedagogically correct and rare among competitors. 0 of 33 production rows have resolved. Whether any reached a retest is not visible from the counts. |
| **Error typing** | AI label (`api/mistakeLabel.ts`): concept, misread, calculation or time. Shown as a named pattern only after 2 sightings | Sensible caution. No use of response time; no use of confidence except in a separate calibration view. |
| **Hint ladder** | nudge → step → worked solution. Hints that leak the answer are dropped. Hint-assisted correct answers earn no credit, and reaching the worked solution counts as wrong [R5] | Matches the strongest evidence (§ learning-science, [L8, L9]). Ladder text is cached only in the device's localStorage. |
| **Grounding** | BM25 over the student's own notes, in the browser (`lib/grounding.ts`) | Pragmatic. No embeddings, deliberately. |
| **AI orchestration** | One edge function, mode-based. Provider fallback chain: Gemini → Groq → Cloudflare → GitHub Models → OpenRouter → NVIDIA → OpenAI → Anthropic, gated by a disclosure allowlist [R6] | Strong privacy discipline. Weak reliability and no routing (§3). |
| **Evals** | 100 fixtures across hint, explanation, quiz-check and misconception-match, graded by the app's own checks [R10] | Good start. Checks *format and leakage*, not learning. Not in CI. |
| **Tests** | 304 `*.test.ts(x)` files in `webapp/src`, plus 10 repo-level tests | Healthy unit coverage of the pure logic. |

## 2. What works today (with caveats)

1. Deterministic grading of MCQs, with a well-designed verification pipeline that is ready to deploy [R6, R11].
2. FSRS scheduling with persisted memory state [R2].
3. A misconception ledger shared across tools, a narrow catalogue, and a delayed-retest resolution rule [R4].
4. A hint ladder that avoids both answer-dumping and refusal, with an anti-gaming credit rule [R5].
5. Epistemic honesty throughout: provisional flags, confidence bands, "untested" kept separate from "weak" (`studentEvidence.ts`, `specPriorities.ts`).
6. Privacy engineering: a provider disclosure test, consent at first use, students' data not sent to undisclosed providers [R6].

## 3. Incomplete, inefficient or unreliable

### 3.1 Correctness of the knowledge model

- **No canonical skill ID.** A "topic" can be a deck title, a quiz answer's `topic` string, a ledger `conceptKey`, a syllabus topic or a timer label. These are joined by `topicMatches`, which is true whenever every word of the shorter label appears in the longer one [R7]. So "Cells" matches "Cell division", "Cell transport" and "Specialised cells". Evidence leaks between topics, and the forecast, ladder and priorities all inherit the leak. **This is the root architectural weakness.**
- **The trajectory model only covers decks.** A student with quizzes but no decks gets a separate, simpler forecast (`quizForecast`). The two views can disagree.
- **Two forgetting models.** The scheduler uses FSRS's power-law retrievability with persisted S. The forecasts and analytics use `exp(-t/S)` with S = interval × ease/2.5 [R3], and ignore persisted FSRS stability. The "fading" label and the review queue can therefore disagree about the same card.
- **The mastery ladder over-claims.** From the unmeasured prior of 0.25, one correct answer yields 0.25 + 0.75 × 0.35 = 0.51, which is "building" and therefore rung 2, **"Recalled"**. Five consecutive correct answers reach about 0.657, which is "solid" and therefore **"Applied"**, whatever the question type. Because each older event's weight halves, the ceiling from score events alone is about 0.664: a card-less topic can never look much better than "just solid", however much evidence piles up. The rung names claim kinds of evidence (recall vs application) that the model never checks. There is no guessing correction (a four-option MCQ has a 25% floor), no item difficulty, and every answer adds the same +0.15 evidence.
- **MCQ only.** CBSE Class 10 papers are about 50% competency-based and 30% constructed response [C41]. Learnora cannot currently assess or mark a constructed answer except through LLM free-form tools (Feynman, Sparring) that are unverified and not tied to marking schemes.

### 3.2 Decision logic

- **At least six independent "what next" deciders**, each with its own rules: `adaptiveLearning.getAdaptiveRecommendations`, `trajectory` interventions, `nextStep`, `studyNow`, `todayPlan` (which composes some of the others), `specPriorities`, and `getPreExamSurgeQueue`. `todayPlan` reconciles several of them, but not all surfaces go through it. Contradictory advice is likely across screens.
- **No placement diagnostic.** Every topic starts at the 0.25 prior, so the first sessions are not targeted. ALEKS caps its initial check at 25 questions and Math Academy picks the most informative topic each time [C12, C5]; Learnora has no equivalent.

### 3.3 AI reliability, latency and cost

- **Reliability depends on free tiers.** As of 2026-09-24, Groq was the only reliable provider. Gemini was overloaded, OpenAI and Anthropic were out of credit, and Cerebras was dead [R11]. In production, every request with a recorded provider in the last 60 days also recorded a failover [R13].
- **Latency is too high for a practice loop.** Quiz generation via OpenRouter averages 24.1 s (p90 34.0 s, n=9). Feynman averages 12.1 s [R13]. A student practising for 10 minutes cannot wait 30 s for four questions.
- **No routing by task.** The same chain serves chat, quiz generation, verification and labelling. Defaults include older models (`claude-3-5-haiku-20241022`, `gpt-4o-mini`) [R6].
- **Quiz = 2–3 calls** (generate, verify, sometimes regenerate) to produce four MCQs that the question bank could often serve for free.
- **Hint ladders are cached per device** (`hintState.ts`). A bank question's ladder is identical for every student at the same level, but it is regenerated for each student.
- **The cost of a session cannot be measured.** `ai_request_log` has no token or cost columns, and most rows have a null provider [R13].

### 3.4 Product coherence

- The 34 destinations against 8 monthly actives suggest breadth has outrun validation. Five tools diagnose misconceptions in different ways (Debugger, Feynman, Sparring, Pre-mortem, Exam Detective); each is a separate prompt, surface and maintenance cost.

## 4. What already differentiates Learnora

| Differentiator | Why it matters | Who else does it |
|---|---|---|
| **A persistent misconception ledger** written by every tool and read by every prompt | Only diagnostic-question products such as Eedi model *which wrong belief*. They do it per question; none found keeps a cross-tool, per-student belief ledger. | Eedi diagnoses by distractor [C1]. Math Academy remediates prerequisites, not beliefs [C5]. |
| **A delayed-retest resolution rule** (new question, ≥2 days later) | Separates short-term repetition from a corrected belief. Most products count the immediate re-answer. | Not found in any competitor documentation reviewed. |
| **Hint-use cannot inflate mastery** | Closes the crutch effect shown by Bastani et al. [L8]. | IXL's SmartScore guards against luck through asymmetry [C18]. General chat tutors do nothing equivalent [C22, C23]. |
| **Honest uncertainty** (provisional, untested, confidence bands) | Avoids false precision. Learnora does this more explicitly than the competitors reviewed. | ALEKS shows a pie; IXL a score. Neither shows uncertainty to the student. |
| **Exam-weighted priorities and a "drift" counterfactual** | Links study time to marks, which school students understand. | Embibe claims similar ideas [C25, C26], but its evidence is marketing. |

## 5. Needs further investigation

1. Whether any production misconception reached a retest, and how many repairs were shown. This needs a query on `misconception_observations` grouped by kind. Not run, to keep this audit to aggregates.
2. Whether the 0 resolved misconceptions reflect the 2-day rule, too few retests being surfaced, or retest UX friction.
3. Actual pass rate of the quiz checker on generated questions once verification is deployed. The `question_review_log` will hold it.
4. Whether the eval harness has ever been run against the production model. `evals/results/` is git-ignored [R10].
5. Who the 8 active students are: board, grade, and whether any are CBSE. This decides whether the CBSE gap (§3.1) is the top priority or a future market.
6. Real FSRS parameter fit. With 16 FSRS cards, defaults are unavoidable for now.
