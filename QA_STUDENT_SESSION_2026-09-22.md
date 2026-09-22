# Learnora — Production Readiness Report

**Tester persona:** Grade 9 student, first intensive session
**Date:** 2026-09-22
**Build:** local dev (`webapp/`, Vite dev server, base `/app/`), branch `fix/dark-theme-contrast`
**Backend:** live Supabase project `mlvgqwqiynpwpwzqufdf` + live `learnora-ai` edge function
**Account:** `learnoratesting@gmail.com` (pre-existing data)

---

> ## ⚠️ CORRECTIONS — read before acting on this report
>
> A follow-up session re-tested every finding against the running app and the
> live database. **Three findings in this report were wrong**, one was wrong
> about its cause, and one was overstated. They are corrected inline below and
> the reasoning is in `QA_FIX_PROGRESS.md`.
>
> **The systematic error:** I inspected `document.querySelector('main').innerText`
> and sampled it only after long waits. Toasts render in a portal *outside*
> `main` and auto-dismiss after **6 seconds**, while the AI actions I was
> testing take 20–40s. I was structurally blind to the app's main feedback
> channel and repeatedly concluded "no feedback at all".
>
> | Finding | Status after re-test |
> |---|---|
> | **C1** (chat half) | **WRONG** — chat's "Save as deck" does show an error toast |
> | **C1** (cause) | **WRONG CAUSE** — not "RLS rejects null folder_id"; see below |
> | **C2** | **WRONG** — the toast fires with a Review action; artifacts list is by design |
> | **C3** | **WRONG** — the tracker works; nothing is written to the ledger |
> | **B2** | **NOT REPRODUCIBLE** |
> | **C4** | Real, but the scoping mechanism already existed; only the disclosure was missing |
>
> Findings that never depended on toasts — **B1, B4, B5, B7, B8** and the
> Feynman half of **C1** — were confirmed and are fixed.

## Executive Verdict

*(Revised after the correction pass. The original wording, written before
C1's cause was understood and before C2/C3/B2 were retracted, overstated the
damage.)*

**One blocker remains, and it is a real one.** The AI pedagogy is the best part
of this product and the misconception ledger genuinely threads across features —
both confirmed, repeatedly.

The blocker is that **no account can create an unfiled note, deck or quiz**. A
BEFORE INSERT trigger creates the parent "Unfiled sources" notebook in the same
command as the row whose RLS check then has to see it, which it cannot, so the
write is refused with 42501. It is permanent per account, because the only thing
that would create that notebook is the trigger that fails. On top of that, the
Feynman debrief reported the resulting failure as a **success** from inside its
catch block — a save that never happened, announced with a ✓.

The reporting half is fixed; the database half has a written, verified migration
that is **deliberately not applied** — it touches a live production database and
needs a human to run it.

**Blocking for release:** C1 (specifically: apply the migration).
Everything else found here is fixed, retracted, or deferred with a reason.

**Fixed and verified in the follow-up session:** B1, B3, B4, B5, B8, the Feynman
half of C1, and the disclosure half of C4. Full suite green throughout
(224 files / 2847 tests, +9 new), typecheck and lint clean.

---

## Critical Findings

### C1 — Folderless decks cannot be created, and the Feynman screen lies about it

**Severity: BLOCKER** · Reproducibility: 100% (5/5)
**Status: Feynman half FIXED (`caf1db7`). Database half diagnosed, migration
written but NOT applied (`d24e1f1`). Chat half was a false alarm.**

> **CORRECTION — the cause below is wrong.** Both the old and current policy
> versions, and the live policy, explicitly allow `folder_id is null`. The real
> cause is same-command visibility: `flashcard_decks` has a BEFORE INSERT
> trigger that *creates* the account's "Unfiled sources" notebook and sets
> `notebook_id` to it, inside the same command as the row being checked. The
> policy then verifies that parent with an `EXISTS` evaluated against the
> command's snapshot, which cannot see a row that same command just inserted.
> Foldered rows are fine because `folders` has an AFTER INSERT trigger that
> creates their notebook in an *earlier* statement.
>
> It also affects **materials and quizzes**, not just decks — any unfiled note,
> quiz or deck. Full proof in `QA_FIX_PROGRESS.md`.
>
> **CORRECTION — the chat half is wrong.** Chat's "Save as deck" *does* report
> the failure with an error toast. I measured after the 6s toast expired.

A Supabase row-level-security policy, `decks_parent_owner_guard`, rejects any `flashcard_decks` insert where `folder_id` is `null`. I verified this directly against the API:

```
POST /rest/v1/flashcard_decks  {user_id, folder_id: null, title}
-> 403 {"code":"42501","message":"new row violates row-level security policy
   \"decks_parent_owner_guard\" for table \"flashcard_decks\""}

POST /rest/v1/flashcard_decks  {user_id, folder_id: <real folder>, title}
-> 201 Created
```

Two shipped call sites pass `null`:

| Call site | File | What the student sees |
|---|---|---|
| Feynman debrief -> "Save these as a deck" | `webapp/src/views/feynman/FeynmanDebriefView.tsx:132` | **"✓ Made 3 flashcards for you."** — a lie |
| AI chat -> "Save as deck" | `webapp/src/context/ChatProvider.tsx:730` | **Nothing at all.** No toast, no error, no state change |

**The Feynman case is the worst thing I found.** Look at the handler:

```ts
// FeynmanDebriefView.tsx:124-152
try {
  const deck = await decksApi.add(null, deckTitle);   // <- always 403
  ...
  setExportMessage(`Added ${cardsToAdd.length} flashcards to "${deckTitle}".`);
} catch (err: any) {
  console.warn("Deck save fell back to a local confirmation", err);
  // Graceful fallback for demo or test environments
  setExportedDeckId("local-exported");
  setExportMessage(`Made ${report.generatedFlashcards.length} flashcards for you.`);
}
```

The success path says *"Added N flashcards to …"*. The **failure** path says *"Made 3 flashcards for you."* — which reads like success and is the only message a real student will ever see, because the try block always throws.

**Evidence:** after clicking it twice, the newest `flashcard_decks` rows were still from 2026-09-21 and 2026-07-17. Nothing was written.

**Student impact:** you finish a 10-minute Feynman session, the app generates 3 cards from exactly the bits you got stuck on, you click save, it says it saved them, and they are gone forever. This is silent data loss dressed as success.

**Repro (Feynman):**
1. `/app/feynman` -> Start teaching -> have 2 exchanges -> "Finish and see how it went"
2. Click **Save these as a deck** -> "✓ Made 3 flashcards for you."
3. Go to `/app/library/flashcards` -> no new deck. Reload -> still no deck.

**Repro (chat):**
1. Ask AI -> "make me 3 flashcards about mitosis"
2. Click **Save as deck** -> nothing happens, no message
3. Network shows `POST flashcard_decks -> 403`

**Fix direction:** decide whether folderless decks are legal. If yes, fix the RLS policy. If no, make the UI pick/require a folder. Either way **delete the catch-block success message** — a fallback must never be indistinguishable from the real thing.

---

### C2 — ~~Notebook Studio Tools generate real content but the UI never shows it~~ RETRACTED

**Status: NOT A BUG. No change made.**

> **CORRECTION.** The toast *does* fire — `"Flashcard deck created from your
> sources."` with a **Review** action that opens the new deck. I read `main`,
> which excludes the toast portal, and sampled ~28s after clicking.
>
> `GENERATED ARTIFACTS (0)` not listing decks and quizzes is **deliberate**:
> `NotebookStudioView.tsx:426-433` records that those artifact rows used to
> describe a deck *that was never created*, and were removed for that reason.
> Decks and quizzes are real library objects, surfaced by the toast action and
> the Library.
>
> The two duplicate decks were mine: I wrongly concluded it had failed and
> clicked again 31s later. Not a double-submit defect.
>
> Residual UX nit only: after a 20–30s generation there is no persistent trace
> in the notebook for a student who looked away.

~~**Severity: CRITICAL** · Reproducibility: 100% (4/4)~~ — original text follows
for the record.

In a notebook, `Studio Tools -> Flashcard Deck` and `-> Practice Quiz` both complete successfully server-side. I captured the network traffic:

```
POST /functions/v1/learnora-ai          -> 200
POST /rest/v1/flashcard_decks           -> 201
POST /rest/v1/flashcards                -> 201
```

The panel still reads **`GENERATED ARTIFACTS (0)`** and *"Pick a tool above to make your first plain-English breakdown or revision sheet."* — before **and after a full page reload**. The only visible change is the daily quota counter ticking down (`30 left today` -> `28 left today`).

Because nothing appears to happen after a ~20s wait, I did what any student would do and clicked again. Result — **two duplicate decks**:

```json
[{"title":"Grade 9 Bio - Cells — Flashcards","created_at":"2026-09-22T01:50:41Z"},
 {"title":"Grade 9 Bio - Cells — Flashcards","created_at":"2026-09-22T01:50:10Z"}]
```

The content is real and good — it does show up under `/app/library/quizzes` and `/app/library/flashcards`. It just never surfaces where it was made.

**Student impact:** burns a limited daily AI quota per click, silently creates duplicate decks, and trains the student to believe the notebook tools are broken. There is no spinner, no toast, no navigation, no artifact card.

**Repro:** open any notebook -> Studio Tools -> click "Flashcard Deck" -> wait 30s -> observe `GENERATED ARTIFACTS (0)` -> reload -> still 0 -> check `/app/library/flashcards` -> deck is there.

---

### C3 — ~~Feynman never credits a misconception you fixed, then blames you for it in the ledger~~ RETRACTED

**Status: BOTH CLAIMS WRONG. No change made.**

> **CORRECTION 1 — the tracker works.** I re-ran a session with `window.fetch`
> patched to capture the raw reply. The model returned
> `"solvedConcepts": ["Main product versus byproduct", "Gas exchange location"]`
> — verbatim labels, because the prompt already tells it to. Both matched and
> the UI showed **`2/2 sorted`, both ✅ Sorted**.
>
> **CORRECTION 2 — nothing is written to the ledger.** The ledger is the
> `public.misconceptions` table. Queried directly for this account: it holds
> `origin_tool` of `quiz` and `sparring` only — **zero feynman rows**.
> `FeynmanDebriefView` never calls `useRecordMisconceptions`. What I took for a
> ledger entry was the `CognitiveCrossLinkBar`, an in-page "take this to another
> tool" widget that resembles the solver's Past-mistakes card.
>
> What is genuinely true: in the original session the model did not echo the
> labels, so credit was dropped silently and the debrief then listed all three
> as shaky. That is model-compliance brittleness with no fallback — real, but
> **observed once and not reproducible**, and nowhere near critical.

~~**Severity: CRITICAL**~~ — original text follows for the record.

The Feynman studio plants 3 misconceptions in the apprentice's draft and tracks `n/3 sorted`. I corrected **all three explicitly** over two turns. The AI itself confirmed it in the conversation pane:

> *"Crystal clear: You clearly explained that sunlight is the actual energy source… You accurately identified that sugar is the main food product and oxygen is just the leftover byproduct."*

The tracker still read **`0/3 sorted`**, with all three marked **⚠️ Still muddled**, after both turns.

**Root cause** — `webapp/src/views/feynman/FeynmanStudioView.tsx:97-107`:

```ts
session.turns.forEach((t) => {
  t.solvedPoints.forEach((p) => allSolvedConcepts.add(p.toLowerCase()));
});
const isConceptSolved = (misc) =>
  allSolvedConcepts.has(misc.concept.toLowerCase());
```

This requires the model's free-text `solvedPoints` to be **string-equal** to the misconception's `concept` label. The model returns a sentence (*"You clearly explained that sunlight is the actual energy source…"*); the label is `"Primary energy source in photosynthesis"`. They will never match, so the counter is effectively hard-wired to 0.

**It then gets worse.** The same flawed check drives the debrief (`webapp/src/api/aiFeynman.ts:1992-1998`):

```ts
if (allSolved.has(m.concept) || overallMastery >= 80) {
  conceptsMastered.push(...);
} else {
  remainingGaps.push(`${m.concept}: Watch out for misconception - "${m.misconception}"`);
}
```

So the debrief told me **"Still a bit shaky (3)"** and listed all three — and wrote them into the **misconception ledger** as mine:

> *"Primary energy source in photosynthesis … Worth a look · 3 things to sort out · From: Explain it simply"*

These were **the app's own planted misconceptions**, which I demonstrably do not hold and which I had just corrected. The ledger is the product's differentiator; this poisons it with fabricated student beliefs.

Notably the codebase already knows this distinction matters — `FeynmanStudioView.tsx:164-167` comments that the extractor *"deliberately ignores its planted misconceptions, which are the app's inventions rather than the student's beliefs."* The debrief path does not honour that.

**Secondary effect:** "HOW ACCURATE YOU WERE: 53%" for two fully accurate explanations.

---

### C4 — Exam readiness and the grade forecast ignore subject entirely

**Status: PARTIALLY FIXED (`f162f55`) — the unscoped case now says so. True subject scoping needs a schema change and is deferred.**

**Severity: HIGH** · Reproducibility: 100%

I added one exam: **"Grade 9 Biology End of Term"**, 15 Oct, Medium.

The Today hero immediately told me:

> *"Study **Pythagorean Theorem Study Material Flashcards** next — is fading; revisit it before it costs you on **Grade 9 Biology End of Term**."*

`/app/trajectory` doubles down:

> *"GRADE 9 BIOLOGY END OF TERM · 23 DAYS AWAY — **94/100 (grade 9)** … You are on track."*
> *"One 45-minute block on Pythagorean Theorem Study Material Flashcards is worth 8.0 points — 2.0× the same block on QA Photosynthesis Flashcards."*

Pythagoras is not on the Biology syllabus. The forecast is built from whatever decks are stalest, with no subject scoping — the "Add exam" dialog collects only **name, date, difficulty**, so there is no subject to scope by.

Worse, I scored **3/10 on a Biology quiz** minutes earlier in the same session. That real evidence is not reflected in the confident "94/100, on track."

**Student impact:** the single most prominent recommendation on the home screen is visibly wrong to the student, and the headline grade prediction is unjustifiably confident. This destroys trust in the feature that is supposed to be Learnora's edge. The model's own hedging (*"a wide range, because there is not much review history yet"*) is buried under a bold `94/100`.

---

## Confirmed Bugs

### B1 — Today's "Due today" quick-add creates a task with no due date, which then vanishes

**Status: FIXED and verified (`651cfba`).**

**Severity: HIGH** · Reproducibility: 100% (2/2)

On `/app` the card is headed **"Due today" / "TODAY'S TASKS"**. I typed `finish bio hw on photosynthesiss`, clicked **Add** — the input cleared, and the list still said *"Nothing due today."* The task looked like it failed.

It was created, with **no due date**, so it is filtered out of the very widget that created it. It only appears on `/app/tasks` under **"NO DUE DATE"**.

**Root cause** — a camelCase/snake_case mismatch that TypeScript can't catch because it is inside a spread (spreads skip excess-property checks):

```ts
// views/tasks/DashboardTasksWidget.tsx:60-61
addTask.mutate({ text: trimmed, ...(dueOnly ? { due_date: localDateStr() } : {}) })

// hooks/useTasks.ts:21-27 — the mutation actually expects `dueDate`
mutationFn: ({ text, dueDate }) => tasksApi.add(text, dueDate ?? null)
```

`due_date` is silently dropped; `dueDate` is `undefined` -> `null`.

**Control:** adding the same task from `/app/tasks` with the **Today** quick-due chip works correctly and appears in the Today widget immediately. So the bug is specific to the Today quick-add.

**Student impact:** the first interactive control on the home screen appears to silently fail. A student retries, producing duplicates.

---

### B2 — ~~"Explain simpler" / "Give an example" chips are dead after every answer~~ NOT REPRODUCIBLE

**Status: could not reproduce. No change made.**

> **CORRECTION.** Re-tested by sampling the chip's `disabled` every 700ms from
> the moment of sending. It first appears at ~13.3s **already enabled** and
> stays enabled. `isSending` *is* in the context `useMemo` deps, so consumers
> do re-render when it clears.
>
> My original observation was real (chip `disabled === true`, zero AI calls on
> click) but followed a sequence that also produced the phantom "Canceled quiz
> generation" line, i.e. an aborted request was involved. Trigger unknown.
> Fixing it on one unreproducible observation would be guesswork.

~~**Severity: HIGH**~~ — original text follows for the record.

Under every finished AI answer sit two follow-up chips. Clicking either does **nothing** — no message, no spinner, no error. I instrumented `window.fetch`: zero AI requests are issued. Confirmed with both synthetic and real clicks.

The chips are rendered with `disabled={isSending}` (`webapp/src/components/chat/TurboChat.tsx:342`), and `isSending` is still `true` in the committed DOM long after the answer has fully rendered — I read `button.disabled === true` 25+ seconds after the response completed.

**The tell:** typing a single character in the chat input re-enables them, and they then work perfectly (the "explain simpler" answer it produced was genuinely better and simpler). Clearing the input again leaves them enabled. So this is a **stale render**, not a real in-flight state — the component isn't re-rendering when `isSending` flips back to false, and only an unrelated state change repaints it.

**Student impact:** "I still don't get it" is the single most common thing a stuck student does next, and the button for it is dead exactly when they need it. They have no way to know that typing anything would fix it.

---

### B3 — "Grade" in flashcard review never shows you the grade

**Status: FIXED and verified (`d8c9ac5`) — now shows "Marked <grade> — <reason>".**

**Severity: MEDIUM-HIGH** · Reproducibility: 100% (2/2)

Review offers *"Type your answer for AI to grade…"*. I typed a deliberately vague answer (*"plants make food from sunlight"*) and a good one. In both cases the card flipped and the deck **advanced straight to the next card**. I polled the DOM at 1.2s intervals and never caught a verdict.

The AI's judgement is applied silently — `handleAiGrade` (`webapp/src/views/review/ReviewView.tsx:1135-1163`) calls the model, parses a score tag, and passes it straight to `scoreCard(quality)`, which advances. There is no state holding a verdict and nothing rendering one.

I only learned how I'd been graded at the end-of-session recap ("Hard 1, Good 4"). Which answer was which, and why, is never shown.

**Student impact:** the feature is called *grade* and produces no visible grade, correction, or explanation. For a vague answer this is actively harmful — the student is silently marked "Good" and moves on believing they knew it.

---

### B4 — "Weak Topics Identified" in the review recap is word salad

**Status: FIXED and verified (`fa4ef85`).**

**Severity: MEDIUM** · Reproducibility: 100%

After a 5-card session with **one** card graded Hard, the recap showed:

> **Weak Topics Identified:** Algae 1 · Bacteria 1 · Chemical 1 · Convert 1 · Energy 1 · Glucose 1 · Green 1 · Light 1 · Photosynthesis 1 · Plants 1

These are not topics — they are every non-stopword from that one card's answer text.

**Root cause** — `webapp/src/views/review/session.ts:195-202`:

```ts
const words = textToAnalyze.replace(/[^\w\s-]/g, " ").split(/\s+/)
  .map(w => w.trim().toLowerCase())
  .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
for (const word of words) cardTopics.add(capitalize(word));
```

Every word >= 3 chars becomes a "topic". The explicit-topic prefix match above it is a nice idea but is a fallback, not a gate.

**Contrast:** the **quiz** results screen does this properly — *"Topics to review: Photosynthesis - Products and Byproducts, Organelle Function - Ribosomes, Cell Structure - Cytoplasm"*. The quiz has real topic labels; the review recap should reuse them instead of splitting strings.

---

### B5 — Feynman's left pane keeps showing the apprentice's *first* question forever

**Status: FIXED and verified (`d131875`).**

**Severity: MEDIUM** · Reproducibility: 100%

After two exchanges, the conversation pane correctly showed Leo's newest question, while the prominent **"Leo (10yo) asks:"** panel in the left column still displayed the opening question from turn 0. Two panels on one screen give contradictory answers to "what am I being asked right now?"

A student reading the left pane (which is where the instructions point them) answers a question they already answered two turns ago.

---

### B6 — Feynman debrief's "Save these as a deck" is not idempotent

**Severity: LOW** (subsumed by C1) · Reproducibility: 100%

Clicking it a second time reprints the same "✓ Made 3 flashcards for you." with no indication that it was already done. Once C1 is fixed this becomes a duplicate-deck generator unless guarded.

---

### B7 — Phantom "Canceled quiz generation" message in chat

**Severity: LOW** · Reproducibility: 2/2

A system line reading **"Canceled quiz generation"** appeared in the chat transcript twice without my ever starting or cancelling a quiz. It appears to be emitted by the abort path firing on a request that actually succeeded. Confusing noise in the middle of a conversation.

---

### B8 — "Quiz not found" is a dead end

**Status: FIXED and verified (`7f457e9`).**

**Severity: LOW** · Reproducibility: 100%

`/app/quiz/<bad-uuid>` renders bare text *"Quiz not found."* with only a `← Exit` chrome link and no recovery CTA. Compare the notebook equivalent, which does this correctly: *"Notebook not found — This notebook may have been deleted or does not exist. [Back to Notebooks]"*, and the 404 page, which offers Today / Library / Go Back.

---

## UX Problems

**U1 — The "Grounded AI Tutor" answers ungrounded questions with no warning.** I asked a new notebook with **0 sources** to explain plant vs animal cells. It gave a full, confident, uncited answer from general knowledge. Nothing said "you have no sources, this is general knowledge." Once I added a source it worked beautifully — *"Mr Patel refers to the jelly inside the cell as 'the cytoplasm soup' [1]. Citations: [1] Mr Patel cell notes"*. The two responses are visually indistinguishable in kind, which is precisely the trust problem.

**U2 — "Add Study Source" offers "PDF Textbook / Document" but has no file upload.** The dialog has a title field and a *paste text* box only. A student who picks the PDF option has no way to add a PDF. (`pdfjs-dist` is a dependency, so upload exists elsewhere — the affordance here is just misleading.)

**U3 — The content is pitched years above the stated audience.** The app onboards Grade 9 and has a "Curious 9th Grader" persona, but:
- Solver example chips are *"Calculus: Failed derivative…"*, *"Stack overflow in recursion"*, *"pH calculation of acetic acid"*.
- Exam-trap content says *"Professors pick extreme or boundary values — zero, empty sets, limits at infinity"*.
- Viva marked my (correct) Grade-9-level answer down to **Rigour 35%** for omitting *"the role of ATP and NADH/NAD+ regeneration"* and *"redox balance"*, then hinted about *"reduction-oxidation"* and *"the Calvin cycle."*

A 14-year-old reads that and concludes the app isn't for them.

**U4 — Wrong answers in the 60-second challenge get boilerplate; right answers get the real explanation.** Answering wrong returned: *"Not quite. Have another look at the idea above and check each step, rather than jumping to the answer."* Answering right returned a genuinely excellent explanation of *why*. The explanation is withheld at the exact moment it is most needed — backwards for a misconception-diagnosis product.

**U5 — Feynman hands you the answer key before the exercise.** The studio lists *"What they've got muddled"* with the quoted snippet **and the correction** spelled out, before you write anything. The pitch is "spot where they've gone wrong"; there is nothing left to spot.

**U6 — Every AI answer ends with the same quiz nag.** *"I haven't seen any quiz results for you on this topic yet. Would you like me to generate a quiz…"* appeared verbatim on essentially every response across chat and the notebook tutor. It reads like a stuck record.

**U7 — Empty-form submits are silent.** Both the Tasks "Add Task" button and the Solver's "Find my mistake" do nothing with no message when submitted empty. The task widget has a shake animation; the solver has nothing at all.

**U8 — Long AI waits with no cancel.** Solver took ~25-30s, Feynman debrief ~25s, viva scoring ~40s. The staged copy is good (*"Working backwards through it… / Looking for the earlier step that tripped everything else up"*), but there is no way to abort, and the Studio Tools case (C2) has no indicator at all.

**U9 — Solver draft restores a question you already submitted.** After submitting and reloading, the textarea silently refilled with the question I'd already had answered, so my next keystrokes appended to it. Minor, but produced a garbled submission.

---

## AI Quality

This is the strongest part of the product. Judged as a product, not as HTTP 200s:

### Excellent
- **Solver diagnosis.** Given *"solve 2x + 5 = 17. i got x = 11"* + *"i added 5 to 17 then divided by 2"*, it produced a correct, precisely-targeted 3-level dependency chain: *Keeping Equations Balanced -> Inverse Operations -> Solving Two-Step Linear Equations*, with *"You added 5 to 17 instead of taking 5 away, which gave you 22 instead of 12 before dividing by 2."* That is exactly right and exactly the level a Grade 9 needs.
- **The 60-second challenge.** The balance-scales framing was pitched perfectly, and the correct-answer explanation was excellent.
- **Quiz feedback.** Best-in-class: *"A common misconception is thinking oxygen is the main goal of photosynthesis because animals need it to breathe, but plants actually perform photosynthesis primarily to make glucose for themselves."* Names the misconception, not just the answer.
- **Feynman apprentice.** Wrote a plausible wrong student explanation with 3 planted errors, honoured the cricket-analogy setting throughout, stayed in character, and asked a genuinely good follow-up (*"what happens at night when the stadium lights go dark?"*).
- **Typo tolerance.** *"whats the diffrence between mitosis and meosis"* -> flawless, accurate, well-structured Grade 9 answer.
- **Grounding with citations** — once sources exist. Exact, correct, cited.
- **Viva structure.** Clarity/Rigour/Accuracy scores plus named strengths and gaps is a genuinely useful format.

### Mediocre / misleading
- **Wrong-answer feedback in the 60s challenge** is content-free boilerplate (U4).
- **"53% accurate"** on two fully accurate Feynman explanations (C3).
- **"94/100, on track"** for a Biology exam computed from Pythagoras decks (C4).
- **Repetitive quiz nag** on every turn (U6).
- **Difficulty calibration** drifts to undergraduate level (U3).

### Broken as a product
- **Feynman's `n/3 sorted` tracker** — permanently 0 (C3).
- **AI flashcard grading** — the judgement is never shown (B3).
- **Follow-up chips** — dead (B2).

**Infra note:** I observed intermittent `503`s from the edge function during the session. The requests that logged a 503 still ultimately produced answers, so retry appears to work, but it is worth confirming the retry/backoff policy before launch.

---

## What Worked Well (verified, not assumed)

| Feature | Verified behaviour |
|---|---|
| **Quiz resume across refresh** | Refreshed mid-quiz -> *"Resume quiz? You have an in-progress attempt (question 2 of 10)"* -> Resume restored exact position. Excellent. |
| **Quiz end-to-end** | 10 questions, per-question feedback, 3/10 result, properly-named topics to review, "Work on X" CTA. |
| **Cross-feature ledger** | Quiz misses appeared in the solver as *"TOPICS YOU KEEP DROPPING MARKS ON — Photosynthesis - Gas Exchange, missed 1x"*. The differentiator genuinely works. |
| **Solver -> challenge -> ledger update** | Diagnosis wrote "Needs work · 3 things to sort out" -> after the 60s challenge -> "Nearly there" -> later "YOU'VE FIXED IT · ALL THREE STEPS HOLD UP". Persisted across full reloads. |
| **Task delete + Undo** | Undo toast restored the task correctly. (Window is ~4s — short, but it works.) |
| **Task cross-sync** | Added on `/app/tasks` with "Today" -> appeared in Today's widget immediately. |
| **Exam creation** | Countdown ("23 days away"), difficulty, readiness %, calendar placement — all correct. |
| **Timer** | Ticked correctly, persisted config from a previous session, and **kept running across route changes**. |
| **Analytics** | Accurate and honest — "Quiz average 30% · 1 quiz attempt" matched my real 3/10. |
| **Command palette** | Found notes and decks by partial match; clean empty state (*"No commands, subjects, or documents matched 'zzzqqq!!!'"*). |
| **404 + bad notebook ID** | Both graceful with recovery links. |
| **Notebook creation + source add** | Smooth; source count updated correctly; tutor conversation persisted across reload. |
| **Review pre-session setup** | Session length (5/10/All) and card order (Due order / Difficult first) — a nice touch. |
| **Review recap** | Retention estimate, grade breakdown, per-card list, "what to do next". Good apart from B4. |
| **Deep links** | Every `/app/*` route loaded correctly on a cold navigation. |

---

## Coverage

### Tested and verified
Today/dashboard · Tasks (add, quick-due, complete, delete, undo, filters, empty submit) · Exams (create, countdown, calendar) · Trajectory/forecast · Plan nav · Timer (start, persistence, cross-route) · Analytics · Settings (read-only pass) · Library (notebooks, flashcards, quizzes tabs) · Notebook (create, add source, grounded tutor with and without sources, Studio Tools) · Flashcard review (setup, flip, AI grade, manual grade, recap) · Quiz (take, wrong-answer feedback, mid-quiz refresh/resume, completion, results) · Solver (empty submit, real diagnosis, 60s challenge right+wrong, mark-as-sorted, draft persistence) · Feynman (config, studio, 2 teaching turns, debrief, deck export) · Viva (start, type response, scoring, escalation) · Exam Detective (traps content) · Cognitive Debugger/ledger · AI chat (typo query, follow-ups, flashcard gen, save) · Command palette (search + empty state) · 404 and bad-ID routes · Refresh persistence on solver/quiz/notebook/timer · Repeated-action/double-click on deck save and Studio Tools.

### NOT verified — do not assume these work
- **Signed-out and first-time-user experience.** I tested on a pre-existing account. Signup, email verification, password reset, onboarding, and the true empty state are **untested**.
- **File upload / PDF parsing.** No upload control was reachable from the notebook source dialog; `Files & notes` upload was not exercised.
- **Voice features.** Mic access is blocked in this browser pane. "Say it out loud", Voice Study Partner, and viva voice mode are untested, including the permission-denied path.
- **Friends, Study Room, achievements, leaderboard.** Not exercised (needs a second account).
- **Billing / Pro / Stripe, account deletion, data export downloads, push and email notifications.** Not exercised.
- **Mobile layout and accessibility.** The browser pane ran at a narrow desktop width; I did not do a dedicated responsive, keyboard-only, or screen-reader pass.
- **Enter-to-submit on forms.** Synthetic `Return` did not submit any form in this harness — including a native `<form>` with a submit button — so I treat this as a **harness limitation, not an app bug**, and it remains unverified. Worth a manual check, since the code paths do exist (`DashboardTasksWidget.tsx:88-95`, `ReviewView.tsx:1304-1306`).
- **Offline queue / reconnect replay.** Referenced in the code; not tested.
- **Production build.** Everything here is the Vite dev server.

---

## Production Checklist

**Must fix before release**
1. **Resolve the `decks_parent_owner_guard` / `folder_id: null` conflict.** Either allow folderless decks in RLS or require a folder in the UI. (C1)
2. **Delete the success message in the Feynman catch block.** No fallback may ever be indistinguishable from a real save. Show the actual error. (C1)
3. **Make the chat "Save as deck" report failure.** It is currently 100% silent. (C1)
4. **Surface Studio Tools output** — artifact card, toast, or navigate to the new deck/quiz — and make the buttons idempotent / disabled while running. (C2)
5. **Stop matching `solvedPoints` by exact string equality** in both `FeynmanStudioView.tsx:106` and `aiFeynman.ts:1992`. Have the model return the concept id/label it is crediting, not prose. (C3)
6. **Never write the app's own planted misconceptions to the ledger.** Apply the rule already stated in the `FeynmanStudioView.tsx:164` comment to the debrief path too. (C3)
7. **Scope exam readiness by subject.** Add a subject/folder field to exams and filter the forecast; suppress or heavily hedge the headline grade when there is no matching evidence. (C4)
8. **Fix the `due_date` -> `dueDate` mismatch** in `DashboardTasksWidget.tsx:61`, and add a type that a spread can't bypass. (B1)
9. **Fix the stale `isSending` render** that leaves the follow-up chips dead. (B2)

**Should fix before release**
10. Show the AI's verdict and reasoning in flashcard grading before advancing. (B3)
11. Replace the word-splitter in `session.ts:195` with the quiz's real topic labels. (B4)
12. Update the Feynman left pane to the latest apprentice question. (B5)
13. Warn when the "Grounded" tutor has no sources, and visually mark ungrounded answers. (U1)
14. Add real file upload to the notebook source dialog, or remove the PDF option. (U2)
15. Give wrong answers in the 60s challenge the same quality of explanation as right ones. (U4)

**Verification still required**
16. Full signed-out journey: signup -> verify -> onboarding -> first empty state.
17. File upload / PDF extraction.
18. Voice features, including permission-denied.
19. Friends / Study Room with two accounts.
20. Billing, account deletion, data export.
21. Mobile and accessibility pass.
22. Manual check that Enter submits forms (untestable in this harness).
23. Confirm edge-function retry/backoff — intermittent `503`s were observed.
24. Recalibrate AI difficulty for the stated Grade 9 audience. (U3)

---

## Test data left behind on `learnoratesting@gmail.com`

For cleanup — I did not delete these, since several are evidence:
- Tasks: `revise chem equations` (due today), `finish bio hw on photosynthesiss` (no due date — B1 evidence), `throwaway undo test`
- Exam: `Grade 9 Biology End of Term` (15 Oct)
- Notebook: `Grade 9 Bio - Cells` + source `Mr Patel cell notes`
- Decks: **two duplicate** `Grade 9 Bio - Cells — Flashcards` (C2 evidence)
- Quiz: `Grade 9 Bio - Cells — Quiz` (1 attempt, 3/10)
- Ledger: one solver entry (`Keeping Equations Balanced`, resolved) and the **three bogus Feynman entries** (C3 evidence)
- A pomodoro timer may still be running (1-minute focus config)
