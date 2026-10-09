# Learning science: what the evidence supports, and what it means for Learnora

IDs refer to [sources.md](sources.md). Each principle answers four things: **Evidence**, **For Learnora**, **In the workflow**, **How to know it worked**. These are effects measured in specific populations and tasks, not universal laws. **Realism check [L15]:** the median education RCT effect is about 0.1 SD. Anything Learnora builds should expect effects of 0.05–0.2 SD, and needs samples far larger than 8 active users to detect them.

---

## 1. Retrieval practice

- **Evidence.** Practice tests beat restudying and other comparison conditions across a large meta-analysis. The effect varies with test format and is stronger with feedback [L1]. Practice testing is one of only two techniques rated "high utility" [L3].
- **For Learnora.** The core loop should be *answering questions*, not reading generated notes or chatting. Today the AI chat and note tools are as prominent as the practice loop.
- **In the workflow.** Every session opens with 3–5 retrieval questions on due or weak topics before any explanation. Explanations come *after* an attempt, not before.
- **How to know.** Compare delayed (7–14 day) accuracy on unseen items for topics practised by retrieval vs topics only explained. That is a within-student comparison, which works at small N.
- **Limits.** Effects shrink for complex transfer tasks. Low-stakes framing matters.

## 2. Spacing and forgetting

- **Evidence.** Spaced practice beats massed practice. The optimal gap grows with the retention interval [L2]; Learnora's exam date sets that interval. FSRS predicts recall better than HLR on about 10k collections [C33]. A model-driven schedule produced a measured engagement gain at Duolingo [C20].
- **For Learnora.** Keep FSRS and upgrade it (FSRS-4.5 → current). **Use one forgetting model everywhere**: today the forecast uses a different curve [R3]. Extend scheduling from cards to *quiz items and misconceptions* (the mistake loop's 2-day retest is already a hand-set spacing rule).
- **In the workflow.** A single due queue that mixes cards, missed quiz items and misconception retests, capped by the student's minutes for the day.
- **How to know.** Calibration: predicted vs observed recall on due items, measured by log loss and binned RMSE as in [C33]. Then delayed retention against an exam-date-aware schedule.
- **Limits.** Most spacing evidence is verbal recall. Effects on multi-step problem-solving are less certain.

## 3. Feedback timing and quality

- **Evidence.** Feedback has a medium average effect (d=0.48) with very high heterogeneity. *Information content* drives it: what was wrong and how to fix it, more than a correct/incorrect flag [L4].
- **For Learnora.** The value lies in the *repair content* (the catalogue's `whyWrong` and `remediation`), not in more chat. Verified, specific feedback beats long generated explanations.
- **In the workflow.** After a wrong answer: (1) immediate "not quite", (2) a targeted repair if a misconception matched, (3) the hint ladder otherwise, (4) a delayed retest.
- **How to know.** Error recurrence: the same misconception reappearing within 14 days, with vs without the repair shown. Randomise the repair *format*; never withhold repairs (see ethics in [strategy-roadmap.md](strategy-roadmap.md)).
- **Limits.** Feedback can harm when it targets the self ("you're bad at this") rather than the task [L4].

## 4. Worked examples and fading scaffolding

- **Evidence.** Worked examples help novices, but the advantage reverses as expertise grows (expertise reversal). Fading solution steps works well, and *adaptive* fading beats fixed fading [L5].
- **For Learnora.** The hint ladder (nudge → step → worked) is a reverse fade on demand. Add the forward direction: a low-mastery topic starts with a worked example, then a completion problem, then independent problems.
- **In the workflow.** Choose the entry point from the mastery estimate. Below "building", show a worked example first. At "solid", go straight to independent problems.
- **How to know.** Time-to-first-independent-correct and delayed accuracy, compared across entry policies.
- **Limits.** The fading evidence comes mostly from well-structured domains (maths, physics). Its benefit for essay-type answers is unclear.

## 5. Conceptual understanding vs memorisation: self-explanation

- **Evidence.** Prompting learners to explain produces g≈0.55 across 69 effects [L13]. The authors suggest computer-generated prompts as a future direction.
- **For Learnora.** The "Explained" rung and the Feynman tool point the right way. The gap is *grading* an explanation reliably (see §8 of [learning-engine-architecture.md](learning-engine-architecture.md)).
- **In the workflow.** After a correct answer on a topic with an open misconception, ask "why is B wrong?" (one line). That probes the belief, not the recall.
- **How to know.** Agreement between the explanation grader and a teacher (Cohen's κ). Then whether the probe predicts delayed retention better than correctness alone.
- **Limits.** Prompts without feedback on the explanation can entrench errors.

## 6. Misconception diagnosis

- **Evidence.** Distractor-mapped diagnostic questions make the wrong belief observable [C1]. Misconceptions can hide behind correct answers [C4]. *High-confidence* errors are corrected more readily once feedback is given (hypercorrection) [L10].
- **For Learnora.** This is the differentiator. Three upgrades follow from the evidence: (a) **distractor-mapped items**, which make diagnosis deterministic; (b) **confidence capture** on every answer, which distinguishes a belief (confident and wrong) from a guess (unsure and wrong); (c) **probes on correct answers** for topics with an open misconception.
- **In the workflow.** A one-tap confidence rating (sure / unsure) before submitting. Confident-wrong combined with a mapped distractor gives a strong misconception signal. Unsure-wrong gives a weak one: practise, don't diagnose.
- **How to know.** Diagnostic precision: share of ledger entries a teacher agrees with on review. Then recurrence after repair.
- **Limits.** Confidence ratings add friction, and students may tap without thinking. Measure the completion cost.

## 7. Transfer to unfamiliar problems: interleaving

- **Evidence.** In a cluster RCT, interleaved maths practice scored 61% vs 38% on a test one month later (d≈0.83, WWC: meets standards) [L6].
- **For Learnora.** Today's quizzes are per-topic, which is blocked practice. Review sessions should mix topics.
- **In the workflow.** Quick checks on a single topic for *learning*; mixed sets for *review* and exam prep.
- **How to know.** Accuracy on mixed, unseen exam-style items. That is the transfer measure, and it is what CBSE competency questions demand [C41].
- **Limits.** Interleaving feels harder and students rate it lower. Expect satisfaction to dip while learning rises, so don't optimise on ratings.

## 8. Cognitive load and explanation design

- **Evidence.** Covered here only through expertise reversal [L5]. General cognitive-load theory was not researched in this pass.
- **For Learnora.** Generated explanations are long and unconstrained. Use short, level-pitched explanations (`levelGuidance` already exists) and one idea per message, matching the step-at-a-time design that won in [L9].
- **How to know.** Hint-ladder eval: readability at the stated level (already graded in `evals/`).

## 9. Metacognition and confidence calibration

- **Evidence.** Hypercorrection [L10] shows confidence is *useful data*, not just a feeling.
- **For Learnora.** A calibration view exists (`/exams/:examId`). Make calibration a student-facing habit: "you were sure on 6 and right on 3".
- **How to know.** The gap between calibration and accuracy should narrow over weeks.
- **Limits.** Evidence that calibration *training* transfers to grades is less clear. Not researched here.

## 10. Mastery learning and prerequisites

- **Evidence.** Mastery programmes show positive exam effects across 108 evaluations, and more so for weaker students. They also cost more time, and self-paced versions lower completion [L12]. Step-based tutoring reaches effects close to human tutoring [L7]. Teaching at the measured level produced large effects in India [C10].
- **For Learnora.** Gate *advancement* on demonstrated mastery, but bound the time cost: a student with an exam in 3 weeks cannot master everything, which the forecast already knows. Route repeated failure to prerequisites [C5].
- **How to know.** Time-to-mastery, and delayed accuracy on topics whose prerequisites were remediated.
- **Limits.** The completion risk is real [L12]. Always offer a "move on, flag for later" option.

## 11. Motivation, autonomy and habits

- **Evidence.** Gamification has small positive effects: g=.49 cognitive, but motivational and behavioural effects are less robust once rigour is controlled [L11]. Duolingo's engagement gains came from the *scheduling model*, not only game elements [C20]. Self-determination theory was not researched in this pass.
- **For Learnora.** Achievements, streaks and leaderboards exist. Do not invest further until the learning loop is proven. Reward *correct retrieval of due items*, not minutes or activity.
- **How to know.** Day-7 and day-30 return rate, *conditional on* delayed retention not falling.

## 12. AI tutoring specifically

- **Evidence.**
  - Unrestricted GPT access improved practice scores but *hurt* unassisted exam performance (−17%). A guardrailed tutor with hints and provided solutions mitigated the harm [L8].
  - A structured tutor that reveals one step at a time beat in-class active learning over two weeks (no retention data) [L9].
  - LearnLM drafts under human supervision matched human tutors (exploratory) [C3].
  - Step-level tutoring approaches human tutoring [L7].
- **For Learnora.** The hint ladder's no-credit rule and leak check are exactly the guardrails this evidence supports. **Provide the tutor with the verified solution** (as GPT Tutor did [L8]) rather than letting it solve.
- **How to know.** The Bastani design is reproducible within Learnora: compare unassisted delayed performance for students and topics with heavy vs light tutor use.

---

## Summary: evidence strength vs Learnora readiness

| Principle | Evidence | Learnora has | Gap |
|---|---|---|---|
| Retrieval practice | Strong [L1, L3] | Quizzes, quick checks, cards | Not the default opening move; slow to generate |
| Spacing | Strong [L2, C33] | FSRS for cards | Second forgetting model; quiz items unscheduled |
| Feedback content | Medium, heterogeneous [L4] | Catalogue repairs | Only 45 entries; not validated |
| Worked examples / fading | Moderate [L5] | Hint ladder (on demand) | No proactive entry by mastery |
| Self-explanation | Moderate [L13] | Feynman, Explained rung | Explanations not graded reliably |
| Misconception diagnosis | Moderate [C1, C4, L10] | Ledger, catalogue, loop | No distractor-mapped items; no confidence on answers |
| Interleaving | Strong single RCT [L6] | None (per-topic quizzes) | Mixed review sets |
| Mastery and prerequisites | Strong but costly [L12, C10] | Prerequisites in syllabus data | Not used on failure; no placement |
| Guardrailed AI | Strong recent [L8, L9] | Hint ladder rules | Tutor solves instead of being given the solution |
| Gamification | Weak to moderate [L11] | Achievements, streaks | Over-built relative to the evidence |
