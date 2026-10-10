# Deep dives: five strongest comparators

Selection criteria: closeness to Learnora's actual differentiator (misconception repair), strength of evidence, and relevance to secondary students, including CBSE.

| Pick | Why this one |
|---|---|
| **Eedi** | Closest to Learnora's core idea. Has RCT evidence of AI tutoring at secondary level. |
| **Math Academy** | The most complete published adaptive and retention engine. |
| **Khanmigo, plus the free chat tutors** | Defines what "AI tutor" means to students and parents, and what is now free. |
| **Mindspark** | The strongest causal evidence for adaptive learning in Indian schools. |
| **Physics Wallah (Alakh AI)** | What Indian students actually use and expect today. |

**Method note:** none of these products was used hands-on. Workflows are reconstructed from vendor documentation, papers and credible third-party accounts. Cells marked *unknown* were not established.

---

## 1. Eedi [C1–C4]

| Question | Finding |
|---|---|
| First arrival | School-assigned. Students meet diagnostic questions set by a teacher or a scheme of work. *Unknown* for a self-serve student. |
| Establishing what's known | **Diagnostic MCQs in which every wrong option maps to one known misconception** [C1]. Knowing *which* wrong option was chosen is the diagnosis. Library of 60k+ questions (vendor figure, *summary*). |
| What to teach next | Routes to materials for the topic [C1]. In the 2025 RCT, a tutor chat ran on Eedi's platform [C3]. |
| After a wrong answer | Misconception identified from the distractor, then chat tutoring. In the RCT the chat was drafted by LearnLM and approved by human tutors [C3]. |
| Careless vs conceptual | Implicit: a misconception distractor is evidence of a belief. The research line flags the reverse problem, where flawed methods yield **correct** answers ("the correct answer trap") [C4]. |
| Revisiting forgotten knowledge | *Unknown.* |
| Adapting difficulty and depth | *Unknown* for the product. In the RCT, the human tutor adapted the depth. |
| Communicating progress | Teacher-facing: most common wrong answer and its reason [C1]. |
| Where AI helps | Drafting Socratic tutor turns: 76.4% approved with no or minimal edits [C3]. Learning misconception labels from response data [C2]. |
| Where it is conventional | The core is human-authored question design. |
| Weaknesses | School-mediated. Maths only. A question can miss a misconception if a flawed method still gives the right answer [C4]. |
| Evidence | Exploratory RCT (n=165): AI-supported students at least matched human-only tutoring, with 66.2% vs 60.7% success on novel problems in later topics [C3]. Preprint, small sample. |

**Lesson for Learnora:** Learnora's catalogue detects a belief from the *text* of the student's wrong option. Eedi's design is stronger: **author the question so each distractor *is* a misconception**, and diagnosis becomes deterministic and free (no AI call). Learnora's ledger and delayed retest go beyond what Eedi documents, which makes the combination distinctive. The gap is authoring distractor-mapped items for the target curriculum.

---

## 2. Math Academy [C5–C8]

| Question | Finding |
|---|---|
| First arrival | Adaptive diagnostic that estimates a "knowledge frontier", including lower-grade foundations [C5]. |
| Establishing what's known | The graph is compressed to a minimal covering set, then the most informative topic is chosen each step. A correct answer is evidence for the topic and its prerequisites; a wrong answer is evidence against the topic and its dependents. **Slow correct answers count less.** Borderline passes are "conditionally completed" [C5]. |
| What to teach next | Maximise learning per minute. Mastery gating on prerequisites. Interleave dissimilar topics and space out similar ones. Fold due reviews into new lessons ("repetition compression"). If foundations are missing, first advance on topics that don't depend on them [C5]. |
| After a wrong answer | In a lesson, each miss adds questions. Too many misses halt the lesson; the student does other topics, then retries. A second halt slows the pace and assigns **remedial reviews on the prerequisites linked to the struggle**. On a quiz, a miss triggers an immediate remedial review [C5]. |
| Careless vs conceptual | Not distinguished explicitly. Repeated failure is treated as a signal; a single miss only extends practice. |
| Revisiting forgotten knowledge | FIRe: spaced repetition with **fractional implicit credit** flowing down to prerequisites. Hard topics require explicit review. Per-student, per-topic learning speed [C5, C6]. |
| Adapting difficulty | Quizzes tuned so students average about 80% [C5]. |
| Communicating progress | XP and course progress (XP from third-party accounts; not on the fetched page). |
| Where AI helps | Classical algorithms. No LLM tutor is described [C5]. |
| Weaknesses (user-reported) | Review load can overwhelm (about 2.7 reviews per new lesson in one user's Calculus II) [C7]. Critics argue it rewards speed over depth and offers little guidance when stuck [C8]. |

**Lessons for Learnora:**
1. **Repeated failure means a prerequisite check, not more explanation.** Learnora's syllabus catalogue already has prerequisites (`lib/syllabus`), so this rule is cheap to add.
2. **Response time is evidence.** Slow-correct ≠ fluent-correct. Learnora records quiz timing data (`useExamProctor`), but the mastery model does not use it.
3. **Target about 80% success** when choosing practice difficulty. This is a rule of thumb from one vendor, so validate it.
4. Do not copy the whole knowledge graph. At Learnora's scale, curated prerequisites per syllabus topic are enough.

---

## 3. Khanmigo and the free chat tutors (ChatGPT Study Mode, Gemini Guided Learning) [C14, C15, C22, C23]

| Question | Khanmigo | ChatGPT / Gemini modes |
|---|---|---|
| First arrival | Inside Khan Academy content. Learner plan is $4/mo, **US billing address required**, and under-18s need a parent [C14]. | Toggle in a general chat [C22, C23]. |
| Establishing what's known | Khan's mastery system (not researched). The tutor itself does not maintain a diagnostic model. | Asks the student's level; ChatGPT has cross-chat memory [C22]. |
| What next | Student-driven within Khan content. | Student-driven. |
| After a wrong answer | Guiding questions, not answers [C14]. | Hints and reflection prompts; the mode can be switched off to get the answer [C22, C23]. |
| Careless vs conceptual | *Unknown.* | *Unknown.* |
| Forgotten knowledge | *Unknown.* | Not scheduled. |
| Progress | Khan mastery levels. | None. |
| Where AI helps | Socratic dialogue on any exercise. | Same, free, on any material. |
| Where AI fails | Arithmetic and **judging whether the student's answer is right**. Khan moved numeric checks to a calculator [C15]. | Same class of risk. No curriculum anchor. |

**Evidence context:** guardrailed tutoring (hints, provided solutions) avoided the −17% unassisted-exam penalty of plain GPT access [L8]. A structured, step-at-a-time tutor beat active learning over two weeks [L9]. **The guardrails and the structure are what matter, not "having AI".**

**Lessons for Learnora:**
1. Socratic chat is a commodity at $0. Learnora's tutor must win on *what it knows about this student* (the ledger, evidence, exam weights) and *verified correctness*, not on its tone.
2. Never let an LLM decide whether an answer is correct when a deterministic check is possible (key match, numeric tolerance, unit check). Khan learned this publicly [C15].
3. Khanmigo is US-only for paying learners [C14], so it is not a direct paid competitor in India. The free modes [C22, C23] are.

---

## 4. Mindspark (Educational Initiatives) [C9, C10]

| Question | Finding |
|---|---|
| First arrival | In the study, after-school centres in Delhi with lottery-allocated free access [C10]. |
| Establishing what's known | "Identify the learning level of every student" [C9]. Many students in the study were several grades behind their enrolled grade. |
| What next | Content targeted at the student's *actual* level, adjusting dynamically [C9]. |
| After a wrong answer | Vendor claims misconception-focused feedback. *Not verified in sources read.* |
| Careless vs conceptual | *Unknown.* |
| Retention | *Unknown.* |
| Progress | *Unknown.* |
| Where AI helps | Pre-LLM adaptive software. |
| Evidence | **RCT, n=619: about 0.37σ in maths and 0.23σ in Hindi intent-to-treat after 4.5 months** (accepted-draft figures; *summary*) [C10]. These are large by Kraft's benchmarks (≥0.20 = large) [L15]. Gains were relatively larger for weaker students. |
| Limitations | Includes centre-based instructor time. Scale-up effects were untested at the time [C10]. |

**Lesson for Learnora:** the largest Indian effect came from **teaching at the measured level**, not from conversational AI. A short placement diagnostic per syllabus, and the willingness to send a Class 10 student to a Class 8 prerequisite, are worth more than another AI tool.

---

## 5. Physics Wallah, Alakh AI [C27–C29]

| Question | Finding |
|---|---|
| First arrival | Enrolled in low-cost PW courses (lectures, tests). |
| Establishing what's known | *Unknown.* "Study Sahayak" claims adaptive practice and backlog clearance [C28]. |
| What next | Course schedule and Study Sahayak (claimed). |
| After a wrong answer or doubt | **AI Guru**: text, voice or photo input; answers in text **and video**; points to timestamps in PW lectures [C27]. About 80% of doubts are handled by AI, and experts' answers feed the training library [C29]. |
| Careless vs conceptual | *Unknown.* |
| Retention | *Unknown.* |
| Progress | *Unknown.* |
| Where AI helps | Instant doubt resolution. Previously about a 10-hour wait (company claim) [C28]. "NCERT Pitara" generates questions from NCERT books [C28]. |
| Where it is conventional | Lectures, human faculty, test series. |
| Evidence | Company-reported usage and satisfaction only (1.5M users in two months; 94% satisfaction) [C28]. No learning-outcome evidence found. |
| Weaknesses | Accuracy is acknowledged as imperfect (the CEO says 100% is impossible) [C29]. No published outcome data. |

**Lessons for Learnora:**
1. For Indian students, **photo-of-a-question input is expected**. Learnora's Gemini channel already reads images (ledger 4.4), but that depends on an unreliable provider.
2. **NCERT is the content anchor for CBSE.** PW generates from it. Learnora should check NCERT's licence for derived questions before any CBSE content work (an unanswered question; NCERT terms were not researched).
3. Learnora cannot match PW's video library and should not try. Its angle is *diagnosis and verified repair*, which PW does not document.

---

## Cross-cutting answers

| Question | Best practice observed | Learnora today |
|---|---|---|
| How the product establishes what's known | Short adaptive placement (ALEKS ≤25 questions, Math Academy, Mindspark) | None. Every topic starts at the 0.25 prior. |
| How it chooses what next | One engine with an explicit objective: learning per minute (Math Academy) | Six or more deciders ([current-state-audit §3.2](current-state-audit.md)). |
| After a wrong answer | Distractor → misconception (Eedi); repeated failure → prerequisite (Math Academy) | Catalogue cue or AI label, then repair and retest. **Good, but no prerequisite step.** |
| Careless vs conceptual | Nobody documents this rigorously. Embibe claims it (L confidence). | AI error type (misread, calculation, time). Unvalidated. |
| Forgotten knowledge | FIRe (Math Academy), HLR (Duolingo), FSRS (Anki) | FSRS for cards only. Quiz-only topics have no schedule. |
| Progress | Pie (ALEKS), SmartScore (IXL), XP | Ladder plus forecast with confidence bands. More honest, but over-claims the rung (audit §3.1). |
| AI's real value | Drafting tutor turns under supervision (Eedi); instant doubts (PW) | Spread across 8+ tools, mostly unverified. |
