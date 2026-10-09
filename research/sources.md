# Source register

Accessed 2026-10-09 unless noted. IDs are cited across `research/` as `[C#]` (competitor/product), `[L#]` (learning science / research) and `[R#]` (this repository or Learnora production).

**Evidence grade** (how much weight a claim can bear):
- **A**: peer-reviewed RCT or meta-analysis, or a primary vendor doc describing its own mechanism.
- **B**: preprint, official blog or announcement, or a WWC/J-PAL summary of an RCT.
- **C**: third-party review, press coverage or a school guide.
- **D**: user reviews, forums or competitor-authored critique. Treat these as signal of sentiment only.

**Research limits.** WebSearch and WebFetch worked, but the Perplexity and GitHub MCP servers failed to connect. Several pages were read only through search summaries rather than fetched in full. Rows marked *(summary)* are those, so verify them before quoting a number externally. No competitor product was used hands-on, and no account or login was created.

## Competitors and products

| ID | Source | Published | Grade | Notes |
|----|--------|-----------|-------|-------|
| C1 | [Eedi: How to plan for error](https://eedi.com/articles/how-to-plan-for-error) | n/d | A | Diagnostic-question design: every distractor maps to one misconception. *(summary)* |
| C2 | [Eedi: Kaggle misconception-mapping challenge](https://eedi.com/blog/from-wrong-answers-to-real-insights-how-we-used-a-kaggle-challenge-to-map-student-misconceptions) | n/d | B | Misconception labels learned from distractor choices. *(summary)* |
| C3 | [LearnLM Team & Eedi, "AI tutoring can safely and effectively support students: an exploratory RCT in UK classrooms", arXiv 2512.23633](https://arxiv.org/abs/2512.23633) | 2025-12-29 | B | n=165 across 5 schools. Human tutors approved 76.4% of drafts with no or minimal edits. 66.2% vs 60.7% success on novel problems. Exploratory, and significance is not reported in the abstract. Fetched. |
| C4 | ["The Correct Answer Trap", arXiv 2606.23205](https://arxiv.org/pdf/2606.23205) | 2026 | B | Misconceptions can hide behind correct answers. Preprint. *(summary)* |
| C5 | [Math Academy: How our AI works](https://mathacademy.com/how-our-ai-works) | n/d | A | Diagnostic, knowledge graph, task selection, remediation, quiz tuning (~80%), FIRe. Fetched. |
| C6 | [Skycak: Individualized spaced repetition in hierarchical knowledge structures](https://justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/) | n/d | B | The FIRe model in the company's own words. *(summary)* |
| C7 | [Hecker, Math Academy update 3](https://frankhecker.com/2025/10/06/math-academy-update-3/) | 2025-10-06 | D | Long-term user: review load complaints. *(summary)* |
| C8 | [Pershan, "Math Academy wants to supercharge your learning"](https://pershmail.substack.com/p/math-academy-wants-to-supercharge) | n/d | D | Educator critique: speed over depth. *(summary)* |
| C9 | [J-PAL summary: Mindspark evaluation](https://www.povertyactionlab.org/print/pdf/node/2242) | n/d | B | Adaptive CAL in urban India. *(summary)* |
| C10 | [Muralidharan, Singh & Ganimian, "Disrupting Education?", AER 109(4), 2019](https://econ.ucsd.edu/~kamurali/papers/Published%20Articles/Disrupting_education_AER.pdf) | 2019 | A | ITT ≈0.37σ maths and ≈0.23σ Hindi over 4.5 months, n=619, Delhi (accepted-draft figures). *(summary)* |
| C11 | [McGraw Hill: A practical perspective on knowledge space theory (ALEKS data)](https://www.mheducation.com/prek-12/resources/research/library/math/practical-perspective-on-knowledge-space-theory-aleks-data.html) | n/d | A | KST basis of ALEKS. *(summary)* |
| C12 | [ALEKS: Shorter, smarter knowledge checks](https://www.mheducation.com/content/dam/mhe/highered/documents/aleks/innovation-shorter-smarter-knowledge-checks.pdf) | n/d | A | Initial knowledge check capped at 25 questions. *(summary)* |
| C13 | [ALEKS K-12 student guide](https://mheducation.com/unitas/school/explore/sites/aleks/aleks-k-12-student-guide.pdf) | n/d | A | Pie chart and periodic retention knowledge checks. *(summary)* |
| C14 | [Khanmigo for learners](https://www.khanmigo.ai/learners) | n/d | A | $4/mo or $44/yr. US billing address required; under-18s need a parent. Fetched. |
| C15 | [Khan Academy blog: Khanmigo math computation and tutoring updates](https://blog.khanacademy.org/khanmigo-math-computation-and-tutoring-updates/) | n/d | B | Moved numeric checks to a calculator after errors were reported. *(summary)* |
| C16 | [IXL Real-Time Diagnostic guide](https://www.ixl.com/materials/i_guides/Admin_Plan_Diagnostic) | n/d | A | ~45 min initial diagnostic, "I don't know this yet", 10–15 questions/week upkeep. *(summary)* |
| C17 | [IXL blog: personalized learning plan](https://blog.ixl.com/2023/05/25/create-a-personalized-learning-plan-for-your-child/) | 2023-05-25 | B | Diagnostic leads to an action plan. *(summary)* |
| C18 | [Boddle: "Does IXL punish wrong answers?"](https://www.boddlelearning.com/article/ixl-punishes-wrong-answers) | n/d | D | Competitor-authored. SmartScore asymmetry above 90. *(summary)* |
| C19 | [Nibble: Quizlet cost 2026](https://nibble-app.com/blog/quizlet-cost) | 2026 | C | Third-party pricing that conflicts across sites. *(summary)* |
| C20 | [Duolingo blog: How we learn how you learn](https://blog.duolingo.com/how-we-learn-how-you-learn) | n/d | B | HLR in production: +9.5% daily practice retention in an A/B test. *(summary)* |
| C21 | [Settles & Meeder, "A trainable spaced repetition model for language learning", ACL 2016](https://aclanthology.org/P16-1174.pdf) | 2016 | A | Half-life regression. *(summary)* |
| C22 | [Axios: ChatGPT study mode](https://www.axios.com/2025/07/29/openai-chatgpt-study-mode) | 2025-07-29 | C | Socratic mode, free to logged-in users. *(summary)* |
| C23 | [Google: New Gemini tools for students (Guided Learning)](https://blog.google/products/gemini/new-gemini-tools-students-august-2025/) | 2025-08 | B | LearnLM-powered guided mode, free. *(summary)* |
| C24 | [Google Workspace Updates: NotebookLM flashcards, quizzes, reports](https://workspaceupdates.googleblog.com/2025/09/flashcards-quizzes-reports-notebook-lm-google-education.html) | 2025-09 | B | Source-grounded flashcards and quizzes with "explain". *(summary)* |
| C25 | [Embibe parent page](https://www.embibe.com/in-en/parent/) | n/d | C | Claims of CBSE/ICSE/state-board coverage and careless-error reporting are marketing. *(summary)* |
| C26 | [LearnOpt, arXiv 2606.15349](https://arxiv.org/pdf/2606.15349) | 2026 | B | Third-party description of Embibe's PAJ system: knowledge graph plus BKT. *(summary)* |
| C27 | [Microsoft Research: Physics Wallah and AI tutoring](https://www.microsoft.com/en-us/research/?p=1128279) | n/d | B | AI Guru on GPT-4o: text, voice, image input, links to lecture timestamps. *(summary)* |
| C28 | [Outlook Business: Alakh AI 1.5M users in two months](https://www.outlookbusiness.com/education/physics-wallahs-alakh-ai-education-suite-records-15-million-users-within-two-months) | 2024 | C | Company-reported figures. *(summary)* |
| C29 | [Outlook Business: Alakh Pandey interview (IPO)](https://www.outlookbusiness.com/amp/story/interviews/physicswallah-ipo-major-investments-are-done-now-its-time-for-public-to-join-our-journey-says-alakh-pandey) | 2025 | C | ~80% of doubts handled by AI, with experts handling the rest. *(summary)* |
| C30 | [Seneca help: What is Seneca](https://help.senecalearning.com/en/articles/2483292-what-is-seneca-learning) | n/d | A | Adaptive, exam-board-specific, free. *(summary)* |
| C31 | [Seneca iGCSE page](https://senecalearning.com/en-GB/igcse/) | n/d | C | Amelia AI tutor and RCT claims are self-reported and differ between pages. *(summary)* |
| C32 | [Anki manual: what spaced repetition algorithm](https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm.md) | n/d | A | SM-2 variant plus FSRS since 23.10. *(summary)* |
| C33 | [open-spaced-repetition/srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark) | 2026 | A | FSRS-7 log loss 0.3401 vs HLR 0.4694 on ~10k Anki collections. Fetched. |
| C34 | [Sparx Maths support: monitoring homework completion](https://support.sparxmaths.com/en/articles/342343-monitoring-homework-completion) | n/d | A | Homework counts as complete only at 100% correct. *(summary)* |
| C35 | [ASE Green Tick review: CENTURY](https://www.ase.org.uk/node/21267) | n/d | C | Independent subject-association review. *(summary)* |
| C36 | [CENTURY student guide (school)](https://www.clrchs.co.uk/wp-content/uploads/2021/07/Student-guide-to-Century-Tech.221666414.pdf) | 2021 | C | Diagnostic nuggets give no feedback; "I don't know" option. *(summary)* |
| C37 | [Brilliant help: Premium pricing](https://brilliant.org/help/pricing-and-plans/how-much-does-brilliant-premium-cost/) | n/d | A | Official page does not list prices. Third-party figures run $24.99–27.99/mo. *(summary)* |
| C38 | [WWC review: Cognitive Tutor Algebra I at scale (Pane et al.)](https://ies.ed.gov/ncee/WWC/study/82101) | 2014 | A | 147 schools, 7 states, cluster RCT. Effect was concentrated in year 2. *(summary)* |
| C39 | [Wikipedia: Byju's](https://en.wikipedia.org/wiki/Byju%27s) | 2025 | C | Under insolvency proceedings. Cautionary tale. *(summary)* |
| C40 | [PW: CBSE Class 10 board exams twice a year, 2026](https://www.pw.live/news/cbse-class-10-board-exams-twice-a-year-2026-dates-rules) | 2025–26 | C | Two board exams from 2026. Not a CBSE primary source. *(summary)* |
| C41 | [MTG: Decoding the new CBSE exam pattern](https://blog.mtg.in/decoding-the-new-cbse-exam-pattern/) | 2025 | C | 50% competency-based, 20% MCQ, 30% constructed response. Verify against a CBSE circular. *(summary)* |

## Learning science

| ID | Source | Year | Grade | Finding used |
|----|--------|------|-------|--------------|
| L1 | [Adesope, Trevisan & Sundararajan, "Rethinking the use of tests", RER 87(3)](https://journals.sagepub.com/doi/10.3102/0034654316689306) | 2017 | A | Practice testing beats restudy, and the effect is moderated by test format and feedback. |
| L2 | [Cepeda et al., "Distributed practice in verbal recall tasks", Psych Bull 132(3)](https://pubmed.ncbi.nlm.nih.gov/16719566/) | 2006 | A | 839 assessments. The optimal gap grows with the retention interval. |
| L3 | [Dunlosky et al., "Improving students' learning…", PSPI 14(1)](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html) | 2013 | A | Practice testing and distributed practice rated high utility. Rereading, highlighting and summarising rated low. |
| L4 | [Wisniewski, Zierer & Hattie, "The power of feedback revisited", Front Psych](https://www.frontiersin.org/articles/10.3389/fpsyg.2019.03087/full) | 2020 | A | d=0.48 with high heterogeneity. Information content drives the effect. |
| L5 | [Expertise reversal effect (overview; Kalyuga et al. 2003)](https://en.wikipedia.org/wiki/Expertise_reversal_effect) and [Worked-example effect (Renkl & Atkinson 2003; Salden et al. 2010)](https://en.wikipedia.org/wiki/Worked-example_effect) | 2003–10 | B (secondary pages over A papers) | Worked examples help novices, the benefit reverses with expertise, and adaptive fading beats fixed fading. |
| L6 | [Rohrer et al., "A randomized controlled trial of interleaved mathematics practice", JEP 112(1) (WWC review)](https://ies.ed.gov/ncee/wwc/Study/88770) | 2020 | A | 787 students. Unannounced test after one month: 61% vs 38%, d≈0.83. |
| L7 | [VanLehn, "Relative effectiveness of human tutoring, ITS…", Ed Psych 46(4) (author slides)](https://quality.mit.edu/files/2012/01/Quality-Symposium-Kurt-VanLehn.pdf) | 2011 | A | Step-based ITS 0.76 vs human tutoring 0.79. Answer-based systems are much lower. |
| L8 | [Bastani et al., "Generative AI without guardrails can harm learning", PNAS 122(26)](https://ideas.repec.org/a/nas/journl/v122y2025pe2422633122.html) | 2025 | A | ~1,000 students. Unguarded GPT gave −17% on the unassisted exam, and the guarded tutor largely mitigated it. |
| L9 | [Kestin et al., "AI tutoring outperforms in-class active learning", Sci Rep 15:17458 (coverage)](https://hechingerreport.org/proof-points-ai-tutor-harvard-physics/) | 2025 | A (paper) / C (coverage) | n=194 crossover. Structured, step-at-a-time tutor. Two weeks only, so retention was not measured. |
| L10 | [Hypercorrection effect review (Butterfield & Metcalfe 2001 onward)](https://dukespace.lib.duke.edu/items/d6ab09ca-f55c-4efb-9d32-2788bc5838b2) | 2001– | A/B | High-confidence errors are corrected more readily once feedback is given. |
| L11 | [Sailer & Homner, "The gamification of learning: a meta-analysis", EPR 32](https://link.springer.com/article/10.1007/s10648-019-09498-w) | 2020 | A | g=.49 cognitive, .36 motivational, .25 behavioural. Only the cognitive estimate holds up under rigour. |
| L12 | [Kulik, Kulik & Bangert-Drowns, "Effectiveness of mastery learning programs", RER 60(2)](https://www.academia.edu/81783373/Effectiveness_of_Mastery_Learning_Programs_A_Meta_Analysis) | 1990 | A | 108 evaluations, positive overall and stronger for weaker students. Costs more time, and self-paced versions lower completion. |
| L13 | [Bisra et al., "Inducing self-explanation: a meta-analysis", EPR 30(3)](https://bps.org.uk/research-digest/self-explanation-powerful-learning-technique-according-meta-analysis-64-studies) | 2018 | A | g=.55 over 69 effects. |
| L14 | [Corbett & Anderson, "Knowledge tracing", UMUAI 4(4)](https://link.springer.com/doi/10.1007/BF01099821) | 1994/95 | A | Bayesian knowledge tracing with slip and guess parameters. |
| L15 | [Kraft, "Interpreting effect sizes of education interventions", Ed Researcher 49](https://annenberg.brown.edu/publications/interpreting-effect-sizes-education-interventions) | 2020 | A | Median RCT effect ≈0.1 SD. Benchmarks: <0.05 small, 0.05–0.19 medium, ≥0.20 large. |

**Not researched in this pass.** These are cited only as background and must not be quoted as evidence until fetched: self-determination theory and autonomy, cognitive-load theory beyond expertise reversal, pretesting, and productive failure.

## Repository and production (first-party)

| ID | Where | What it established |
|----|-------|---------------------|
| R1 | `webapp/src/lib/mastery.ts`, `lib/trajectory.ts` | Mastery ladder thresholds and the score-event fold. |
| R2 | `webapp/src/views/review/srs.ts`, migration `20260905000000_persist_fsrs_memory_state.sql` | FSRS-4.5 scheduler with persisted S and D. |
| R3 | `webapp/src/lib/adaptiveLearning.ts` `computeRetentionProbability` | A second forgetting model: `exp(-t/S)` with S = interval×ease/2.5. |
| R4 | `webapp/src/lib/misconceptions.ts`, `misconceptionCatalogue.ts`, `mistakeLoop.ts`, migration `20261005010000_mistake_loop.sql` | Ledger, a 45-entry catalogue, and the delayed-retest resolution rule. |
| R5 | `webapp/src/lib/tutorPolicy.ts`, `hintState.ts` | Hint ladder, leak check, no-credit rule, and ladder cache in localStorage. |
| R6 | `supabase/functions/learnora-ai/index.ts`, `_shared/providerPolicy.js`, `_shared/quizQuality.js` | Single edge function, provider chain, and quiz verification. |
| R7 | `webapp/src/lib/topicKey.ts` | Topic identity by normalised strings and subset-word matching. |
| R8 | `webapp/src/lib/syllabus/catalogue.ts`, `lib/questionBank/seed/*.json`, `docs/QUESTION_SOURCES.md` | AQA, GCSE Maths and IB only. 228 seeded MCQs (Bio 48, Chem 64, Maths 56, Phys 60). |
| R9 | `webapp/src/lib/onboarding.ts` | CBSE Class 9 and 10 presets exist in onboarding. |
| R10 | `evals/` | 100 fixtures with graders. `evals/results/` is git-ignored, so whether runs happened is unknown. |
| R11 | `WAITINGONLEDGER.md`, `plans/PRODUCTION_DEC_2026_STATUS.md` | Quiz verification is not yet deployed (prod `learnora-ai` v66). Provider health as of 2026-09-24. |
| R12 | **Production DB, read-only aggregate queries, 2026-10-09** | 36 users, 8 signed in during the last 30 days, 13 `learning_events`, 3 `quiz_attempts`, 99 flashcards (16 with FSRS state), 33 misconceptions (0 resolved), 228 bank questions, 159 AI requests in 30 days (last on 2026-10-05). |
| R13 | **Production `ai_request_log`, last 60 days** | Quiz via OpenRouter: n=9, mean 24.1 s, p90 34.0 s. Feynman via OpenRouter: mean 12.1 s. Every row with a provider recorded also recorded a failover. Most rows have a null provider (older logging), and there are no token or cost columns. |
