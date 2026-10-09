# Competitor matrix

Twenty products, chosen for relevance to Learnora: secondary students, exam prep, diagnosis, retention, AI tutoring. "Unknown" means not established from sources; it does not mean absent. Source IDs refer to [sources.md](sources.md). **Confidence** is H when there is a primary doc or RCT, M when there is an official blog or a mix, and L when only third-party or marketing material exists. None of these products was used hands-on (see [sources.md](sources.md) for research limits).

## 1. Compact matrix

| # | Product | Audience | Core problem | Diagnosis of what's known | Feedback after a wrong answer | Misconception-level? | Retention model | Mastery signal shown | AI role | Access / price | Conf. | Src |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Math Academy** | Grade 4 → university maths, self-driven | Learn maths fast, fully | Adaptive diagnostic over a knowledge graph; picks the most informative topic each step | Lessons extend on misses; repeated halts trigger prerequisite remediation | No (prerequisite-level) | FIRe: spaced repetition with implicit credit through the graph | XP, course progress | Classical algorithms; no LLM tutor described | Paid; price unknown | H | C5, C6 |
| 2 | **Eedi** | UK KS2–KS4 maths, schools | Find *why* a student is wrong | Diagnostic MCQs with a misconception mapped to every distractor | Routed to topic materials; a human or AI tutor chat in the RCT | **Yes, by distractor** | Unknown | Teacher-facing insights | LearnLM tutor under human supervision in the RCT | School product; unknown | H | C1, C2, C3 |
| 3 | **ALEKS** (McGraw Hill) | K-12 and college maths/chemistry | Placement and mastery path | Knowledge space theory; initial check of at most 25 questions | Explanations; topic put back in the path | No | Periodic "knowledge checks" re-verify | "ALEKS pie" | Classical (KST) | Institutional | H | C11–C13 |
| 4 | **IXL** | K-12 US/UK, all subjects | Skill practice with a diagnostic | Real-Time Diagnostic (~45 min), "I don't know this yet" | Explanation after a miss; SmartScore drops sharply above 90 | No | Weekly diagnostic upkeep (10–15 questions) | SmartScore 0–100 (not % correct) | Mostly conventional | Subscription; unknown | M | C16–C18 |
| 5 | **Khanmigo / Khan Academy** | Grades 5–12+, US | Socratic help on Khan content | Khan mastery system (not researched here) | Guiding questions, not answers | No | Unknown | Khan mastery levels | GPT-4-class tutor; calculator added after math errors | $4/mo or $44/yr; **US billing only**; free for teachers | H | C14, C15 |
| 6 | **ChatGPT Study Mode** | Anyone | Learn instead of getting answers | Asks about the user's level | Hints and self-reflection questions; can be toggled off | No | Memory across chats | None | Entirely LLM | Free tier included | M | C22 |
| 7 | **Gemini Guided Learning** | Anyone, students | Same as above | Unknown | Step-by-step, quizzes, visuals | No | Unknown | None | LearnLM | Free | M | C23 |
| 8 | **NotebookLM** | Students, teachers | Learn from your own sources | None | "Explain" a missed quiz item with citations to sources | No | None (no scheduling found) | None | LLM with source grounding | Free / Workspace | M | C24 |
| 9 | **Quizlet** | High school and college | Memorise sets | None | Learn mode re-asks missed items; Q-Chat follow-ups | No | Learn-mode frequency adaptation | Set progress | Magic Notes, Q-Chat | Plus about $36/yr; Learn rounds capped on Plus (third-party) | L | C19 |
| 10 | **Anki** | Self-directed memorisers | Long-term retention | None | Self-rated (Again/Hard/Good/Easy) | No | **FSRS** (best open benchmark) or SM-2 | Card stats | None | Free (desktop/Android) | H | C32, C33 |
| 11 | **Duolingo** | Language learners | Daily habit plus vocabulary retention | Placement test (not researched) | Correction plus re-queue | No | Half-life regression → Birdbrain | Streaks, XP, levels | Personalisation models | Freemium | M | C20, C21 |
| 12 | **Brilliant** | Teens and adults, STEM | Intuition through interaction | None found | Interactive explanation | No | Unknown | Course progress | Unknown | About $150–162/yr (third-party); official page lists no price | L | C37 |
| 13 | **CENTURY Tech** | UK schools, up to GCSE | Adaptive path plus teacher data | Diagnostic nuggets (no feedback; "I don't know" option) | Short video or slides then questions | Claims diagnostics find misconceptions; detail unknown | Unknown | Path and teacher dashboard | "AI" path recommender | School licence | M | C35, C36 |
| 14 | **Seneca** | UK GCSE/A-level/iGCSE | Free exam-board revision | Unknown | Wrong Answer Mode; varied formats | No | Spaced re-asks of weak items (claimed) | Course % | AI tutor "Amelia" (iGCSE), AI marking (claimed) | Free + Premium | M | C30, C31 |
| 15 | **Sparx Maths** | UK secondary maths, schools | Homework that is actually done and learned | Personalised weekly sets | Support video for each question; must reach 100% | No | Unknown | Completion | Unknown | School licence | M | C34 |
| 16 | **Carnegie Learning (Cognitive Tutor / MATHia)** | US middle and high school maths | Step-level tutoring | Knowledge tracing (BKT lineage) [L14] | Step-level hints and just-in-time feedback | Partly (production rules / "bug" rules) | Unknown | Skill bars | Classical ITS | School | H (RCT) | C38 |
| 17 | **Mindspark** (Educational Initiatives) | Indian grades 1–10 | Teach at the right level | Identifies each student's level | Adaptive content; misconception focus claimed by vendor (not verified) | Unknown | Unknown | Unknown | Classical adaptive | Centres and schools; fee | H (RCT) | C9, C10 |
| 18 | **Physics Wallah, Alakh AI** | Indian JEE/NEET/boards | Doubts at scale | Unknown | AI Guru answers in text and video, links lecture timestamps; experts handle the remainder | No | "Study Sahayak" adaptive practice (claimed) | Unknown | GPT-4o-based | Low-cost courses | M (company-reported) | C27–C29 |
| 19 | **Embibe** | Indian CBSE/ICSE/state, JEE/NEET | Personalised test prep | Knowledge graph + BKT (third-party description) | Reports "careless" vs conceptual (claimed) | Claimed | Unknown | Score quotient | Proprietary | Freemium | L | C25, C26 |
| 20 | **BYJU'S** | Indian K-12 | Video-led learning | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Under insolvency proceedings | L | C39 |

## 2. Per-product lesson for Learnora (one line each)

1. **Math Academy.** Prerequisite graphs and implicit review make practice compound. The adoptable part is *prerequisite-aware remediation after repeated failure*, not the whole graph. Users complain about review load and speed-over-depth [C7, C8].
2. **Eedi.** Its *distractors are the diagnosis*. Learnora's catalogue cues (matching the wrong option's text) are a weaker form of the same idea. Authoring distractor-mapped questions is the higher-value move.
3. **ALEKS.** A short, capped placement check (≤25 questions) plus periodic retention checks. Learnora has neither.
4. **IXL.** A mastery score that is not % correct, rising difficulty, and asymmetric loss. Users find it punishing [C18]. The lesson is to explain the score and avoid harsh, unexplained drops.
5. **Khanmigo.** A Socratic tutor anchored to curated content. Arithmetic errors forced a calculator tool [C15]. **US-only billing** [C14] leaves Indian learners unserved directly.
6. **ChatGPT Study Mode** and 7. **Gemini Guided Learning.** Free Socratic tutoring is now a commodity. Learnora must not compete on "an AI that doesn't give answers".
8. **NotebookLM.** Free, source-grounded flashcards and quizzes with cited explanations. "Make a quiz from my PDF" is no longer a differentiator.
9. **Quizlet.** Metered AI rounds on paid tiers [C19]. Students meet usage caps on study tools; Learnora's caps should not block the core practice loop.
10. **Anki.** The FSRS benchmark is open [C33], so Learnora can stay on the frontier for free. It should upgrade from FSRS-4.5 and later fit per-user parameters.
11. **Duolingo.** Its scheduling model (HLR) earned a measured A/B win (+9.5% daily practice retention [C20]). It ships retention models behind experiments, not on faith.
12. **Brilliant.** Interactivity as pedagogy. Expensive to author; not a fit for Learnora's resources.
13. **CENTURY.** Diagnostic items without feedback, so the diagnostic stays clean, plus an explicit "I don't know" option. Cheap to copy.
14. **Seneca.** Free, exam-board-exact content is the UK baseline. Board alignment is table stakes.
15. **Sparx.** "Complete means 100% correct", plus a support video for every question. Completion is defined by correctness, not attempts.
16. **Carnegie Learning.** Step-level tutoring has the best ITS evidence [L7], but the at-scale RCT shows effects take time and implementation [C38].
17. **Mindspark.** The strongest Indian evidence: ~0.37σ in maths over 4.5 months from *teaching at the student's actual level* [C10]. This argues for a level-finding diagnostic before AI tutoring.
18. **Physics Wallah.** Indian students expect instant doubt resolution, multimodal input (photos) and links into lectures. AI handles about 80% of doubts, with experts on the remainder [C29].
19. **Embibe.** The claimed CBSE "careless vs conceptual" diagnosis is close to Learnora's idea, but it is unverified marketing. It shows there is demand, not that it works.
20. **BYJU'S.** Scale through sales and content without learning evidence ended in collapse [C39]. It is a reason to measure learning, not activity.

## 3. Capabilities that are becoming standard (table stakes)

- A Socratic AI tutor that withholds answers: ChatGPT, Gemini, Khanmigo [C22, C23, C14].
- Quizzes and flashcards generated from the student's own material: NotebookLM, Quizlet [C24, C19].
- Exam-board-specific content in the UK: Seneca, Sparx, CENTURY [C30, C34, C35].
- Instant doubt-solving with photo input in India: PW [C27].

## 4. Capabilities that remain rare (opportunity space)

- **A persistent, per-student record of wrong beliefs** resolved only by delayed, novel-question evidence. Eedi diagnoses per item; nobody reviewed keeps a cross-tool belief ledger.
- **Distractor-mapped diagnostics for CBSE.** Eedi-style quality, but for Indian boards: none found.
- **Constructed-response marking against a board scheme for CBSE.** Claimed by some (Seneca AI marking for UK [C31]), but no verified CBSE offering was found.
