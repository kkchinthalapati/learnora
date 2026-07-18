# Learnora UX/Consistency Revamp

## Context

Two read-only audits of the app (one covering UX/flows across every view, one covering the CSS design system) surfaced roughly 20 concrete problems: real bugs (every AI action confirmation dialog silently shows the generic "Are you sure?" instead of its intended message; a fully non-functional Notifications tab; undefined CSS variables silently dropping styles on live UI — including breaking color on **all** AI-chat markdown rendering), inconsistent/confusing flows (duplicate "Quizzes" entry points was the user's original complaint and is already fixed; timer presets that silently corrupt non-Pomodoro settings; a calendar with no visible way to add a second exam to a busy day), and CSS inconsistency (a whole leftover "AI BEAST MODE STYLES" block duplicating and silently overriding the token-based design system, four different empty-state patterns for the same concept, missing utility classes, WCAG-failing text contrast).

The user explicitly wants a **clarity and correctness pass, not a visual redesign** — same overall look/feel, but fix what's broken, confusing, or dishonest about what the UI claims to do. This plan is sequenced so low-risk mechanical fixes land first, the CSS system gets consolidated onto a clean base next, then UX/flow changes build on that clean base, with the most novel piece (reworking Notifications into something real) done last.

**Verified already fixed by a prior session (do not re-fix):** the `<ADD_PLAN>` hash bug (`"planner"` → `"plan"`) and the missing `.text-sm`/`.mt-4`/`.mb-8` utility classes are both already corrected in the current code (commit `19af4e4`).

**Verified: no edge-function redeployment needed anywhere in this plan.** The AI system prompt (including the `CAPABILITIES` list) is built entirely client-side in `js/ai.js` and sent as chat history content — `learnoraedgefunctionlogic.ts` just forwards it verbatim to the LLM providers.

---

## Phase 1 — Low-risk pure bug fixes (do first, no design decisions)

1. **Fix `UI.confirm()` opts-object bug** (`js/ai.js:642,658,682,700,718`) — each call passes a plain string as the second argument where `UI.confirm(message, opts={})` (`js/ui.js:169-171`) expects an object with `.title`. Replace each with a proper `{ title, confirmText, danger }` object (pattern already used correctly at `js/main.js:571-574,731-734,747-750`): task-add, timer-start, theme-change, quiz-generation, and plan-generation each get their own distinct title/confirm-text instead of all silently falling back to generic "Are you sure?" / "Confirm".

2. **Gate "Plan my week" dashboard button with a confirmation when overwriting** (`js/main.js` dashboard button handler, `js/ai.js:322` `Plans.upsert`) — currently the dashboard button silently overwrites any existing weekly plan with zero confirmation, while the same action triggered from AI chat (`<ADD_PLAN>`) does confirm. Check if a plan already exists for the current week before generating; only show a confirm dialog ("This will replace your current weekly plan. Continue?") when one does — no friction for a first-time empty week.

3. **Document `<START_TIMER>`/`<SET_THEME>` in the AI's own system prompt** (`js/ai.js:573-576`, the `CAPABILITIES:` block) — these two action tags are fully implemented and parsed but never told to the model, making them effectively unreachable. Add two lines documenting them, matching the existing style of the `<ADD_TASK>` line. Optionally add a "⏱️ Start a timer" quick-action chip next to the existing ones (`index.html:1674-1677`).

4. **Fix undefined CSS variables** — confirmed via full cross-reference, exactly 6 undefined tokens are referenced anywhere in the codebase, breaking styling silently (including **all AI-chat markdown heading/code/blockquote coloring**, not just the 3 originally-suspected sites):
   | Undefined | Replace with | Sites |
   |---|---|---|
   | `--primary-color` | `--primary` | `style.css:3126`; `index.html:1391,1729`; `js/ai.js:120,125,126,135`; `js/main.js:134` |
   | `--radius-lg` | `--r-lg` | `index.html:1312` |
   | `--radius-md` | `--r-md` | `js/ai.js:115`; `js/router.js:265` |
   | `--text-color` | `--text` | `js/ai.js:123,124` |
   | `--surface-hover` | new token (see Phase 2.1) | `style.css:3195` |
   | `--surface-active` | new token (see Phase 2.1) | `style.css:3205` |
   Fold `--primary-color`/`--radius-lg`/`--radius-md`/`--text-color` fixes into this phase; leave `--surface-hover`/`--surface-active` for Phase 2.1 since those two lines are inside the block being dissolved there (avoid editing the same lines twice).

5. **Fix "Wipe Data" description to match actual scope** (`index.html:1238-1246`, confirm dialog at `js/main.js:748`) — currently claims to wipe "all tasks, study logs, and exams" but `DataAdmin.wipe()` (`js/api.js:969-989`) also deletes `weekly_plans`, `quizzes`, and clears the `fav_times` timer presets from localStorage (undisclosed), while folders/materials/notes/flashcards are untouched despite the "Wipe **All** Data" label. Rewrite to: *"Permanently delete all tasks, study logs, exams, weekly plans, quizzes, and saved timer presets from the cloud and this device. Folders, uploaded materials, notes, and flashcards are not affected."*

---

## Phase 2 — CSS consolidation (clean base before UX changes build on it)

1. **Dissolve the duplicate "AI BEAST MODE STYLES" block** (`style.css:3097-3240`, ~144 lines) into the original token-based definitions (`.ai-modal` at `style.css:2352-2380`, `.ai-bubble` at `style.css:2448-2456`). This later block currently *wins* the cascade and silently overrides box-shadow/border/background/radius with hardcoded `rgba(...)` values instead of tokens. Process: diff the two blocks property-by-property; delete true duplicates; relocate genuinely-new rules (`.ai-widget`, `.streaming-pulse`, `.ai-host-bubble`/`-avatar`/`-message`, `.pop-in`, `.hover-lift`/`-bright`) into their topically-correct existing sections; delete the "Beast Mode" header once empty. Add the two new tokens this block needs (`--surface-hover`, `--surface-active`) to `:root` (near `style.css:42`) and `body.dark-theme` (near `style.css:2861`), computed consistently from the existing surface palette rather than eyeballed. **Constraint: this must be visually silent** for `.ai-modal`/`.ai-bubble` — verify via computed-style comparison in both themes before/after. Fold in the `--primary-color`/`--surface-hover`/`--surface-active` fixes from Phase 1.4 since they live in these exact lines.

2. **Unify the two red/green systems** (`style.css:3218-3229`, `.correct-choice`/`.wrong-choice`) — currently hardcoded `#22c55e`/`#ef4444` with `!important`, ignoring the app's own `--success`/`--danger` tokens used everywhere else. Replace with `var(--success-soft)`/`var(--success)` and `var(--danger-soft)`/`var(--danger)` (both already exist, `style.css:31,34`), keeping `!important` since it's required to override the base choice-button class. **This is the one visually-perceptible change in Phase 2** — quiz correct/wrong colors shift from generic green/red to the app's teal-green/coral accents. This is intentional (unifying two competing systems is a real bug fix), not a redesign.

3. **Add missing utility classes** (`style.css` utilities section, ~`2694-2720`) for confirmed dead references: `.mb-32`, `.pt-24` (new family), `.btn-sm` (then remove the inline-style compensation at `js/main.js:1027`), `.pull-left`, `.text-gradient`, `.fade-in`. For `.header-drag-handle`, `.markdown-body`, `.splash-content/logo/screen`, `.todo-text`, `.view-section`, `.dropzone`, `.chat-suggestions`, `.btn-preset`, `.dash-ai`, `.dash-streak`, `.dash-tasks` — check each call site first; some (e.g. `.view-section`) may be intentional no-op JS query-selector hooks that don't need CSS, not actually "missing." Don't manufacture rules for classes that are legitimately style-free hooks — document that distinction with a code comment so it isn't re-flagged next time.

4. **Consistency + dead-code cleanup, same file sweep:**
   - Add matching `:active`/`:disabled` states to `.btn-danger`/`.btn-warning`/`.btn-success` (`style.css:480-511`) mirroring `.btn-primary`'s existing states (`style.css:454-459`) — needed before Phase 3.5d reclassifies a button's variant.
   - Delete confirmed-dead CSS: `.ai-modal.minimized` (nothing ever toggles it — only `.fullscreen` is wired), `.tab-content`, `.exam-list-mini`, `.danger-zone` (superseded by `.danger-card`), `.calendar-header` (superseded by `.calendar-toolbar`).
   - Fix the responsive gap on the folder-detail 3-column grid (`index.html:1342`, hardcoded inline `grid-template-columns: 1fr 1fr 1fr`) and the upload material-type picker (`index.html:1296`, inline `1fr 1fr`) — both bypass the responsive base `.grid-list` class with inline styles that have zero `@media` override. Replace with dedicated classes using `repeat(auto-fit, minmax(240px, 1fr))` (the responsive pattern already used elsewhere in this codebase).

---

## Phase 3 — UX flow / copy / consistency fixes (build on the clean CSS base)

1. **Unify the four empty-state patterns** onto `.dash-empty` (already the most-used, already token-sourced) — fix `js/main.js:900-907`'s ad-hoc inline-style empty task row, and the bare unstyled `<h3>` empty states in `js/router.js` (folders/flashcards/quizzes lists, lines ~166,200,327,374,382,460). If dashboard-card-sized `.dash-empty` text reads too small for full-page empty states, split into `.empty-state-sm`/`.empty-state` variants rather than inline-style overrides.

2. **Timer reset button — fix styling/behavior mismatch and add missing confirmation:**
   - When the button relabels to "Stop & log" (count-up types, ≥60s elapsed, `js/timer.js:532-535`), swap its class away from `btn-ghost-danger` to a neutral/positive variant (add `.btn-ghost-success` if it doesn't exist) — a beneficial save action shouldn't look destructive.
   - Add a confirmation to the direct Reset button (`js/main.js`, `btn-timer-reset` handler) **only** when it would discard real progress (a running/paused Pomodoro or Countdown) — count-up sessions under 60s have nothing meaningful to lose and stay confirmation-free. Use the same `{title, confirmText, danger}` pattern as elsewhere.

3. **Extend timer favorite presets to work correctly for every timer type** (user chose the fuller fix over just hiding presets outside Pomodoro): `saveFav()` (`js/timer.js:629-647`) should save whichever config fields are relevant to the *currently active* type (Countdown/Stopwatch/Flowtime already have their own config fields per `_syncConfigInputs()`, `js/timer.js:597-609`), tag each saved favorite with the type it was saved under, and display that type in the button label. Clicking a favorite should switch to *that preset's own saved type* instead of hardcoding a switch to `"pomodoro"`.

4. **Sidebar navigation fixes:**
   - Add a sidebar entry for "This week's plan" (`#plan`) — currently unreachable except via the dashboard button or AI chat. Place after "Task Manager", before "Exams" (see next point), icon `🗓️`.
   - **Rename the Calendar nav item to "📅 Exams"** (user confirmed) — adopt the auth-wall's 📅 emoji, drop the ambiguous 📚, align terminology (`index.html:340-342` and `285-287` both become "Exams"/"📅"). Zero functional/routing change, hash stays `#exams`.
   - Leave "🤖 Learnora AI" without router-driven active-state highlighting (it opens a modal, not a page — treating it as "navigated to" would be more confusing, since closing the modal doesn't restore the prior page). Give it a small distinct visual cue instead (e.g. a subtle badge/dot) so its different *behavior* is signaled by different *appearance* rather than mimicking the 7 real nav links.
   - Defer per-nav-item due-count badges for Quizzes/Tasks/Exams (parity with the Flashcards badge) — this is a small feature addition requiring new counting logic, not a copy/consistency fix; out of scope for this pass.

5. **Settings view fixes:**
   - Add a logout icon-button to the header (`index.html:386-408`, `.header-right`, matching the `.icon-btn` pattern already used for the theme toggle) so logout isn't only reachable from within Settings — keep the existing Settings-page logout button too.
   - Align the Export button label with its field label — "📥 Export Data" → "📥 Export CSV" (`index.html:1010-1012`).
   - Give the Display Name / Email inline-edit toggle buttons a visible "Cancel" state when open (swap the trigger button's text, or add an explicit Cancel action) — currently the only way to close them is re-clicking a button whose label never changes.
   - De-escalate "Sign Out Others" from `btn-danger` to `btn-warning` (`index.html:1074`) — it's a security-hygiene action, not data-destructive like Wipe Data/Delete Account, and shouldn't share their visual severity.

6. **Exams/Calendar — redesign day-cell interaction** (user chose the fuller fix): clicking a day with existing exams should open a day-detail view/popover listing that day's exams with an explicit "+ Add exam" action, rather than assuming any non-exam-bar click means "create a new exam." This also resolves the "+N more" overflow badge currently being unclickable — it becomes the same day-detail entry point. Hide the exam-creation modal's Status field on create (always "Scheduled" at that point, `js/main.js:1253`) — show it only when editing an existing exam.

7. **Upload & Generate fixes:**
   - Auto-detect and set the Material Type radio from the actual selected/dropped file's extension, rather than trusting the manually-selected radio blindly against an `accept`-all file input (`index.html:1315`, `js/main.js:77-229`) — removes the mismatch possibility entirely for file-based uploads (radio stays manually relevant only for the YouTube/Text-paste cases).
   - Toggle the reused `#youtube-link` input's `type` attribute between `"url"` and `"text"` when relabeling for pasted text (`index.html:1321`, `js/main.js:117-123`) — currently stuck at `type="url"`, giving the wrong mobile keyboard for pasting notes.
   - Add `required` + a visible required-field indicator to the folder `<select>` (`index.html:1284-1291`), consistent with whatever required-field convention already exists elsewhere in the app (check auth/exam forms before picking asterisk vs. microcopy vs. border style).
   - Replace the fire-and-forget generation with a persistent status toast that updates to success (with a link to the folder) or an explicit failure+retry state, instead of only `console.error`-ing silent failures (`js/main.js:213`).

8. **Standardize "back" navigation** across Notes reader, Flashcard Review, and Quiz-taking — replace `data-action="history-back"` (unpredictable on deep links, `js/router.js:30`) with deterministic `data-hash` targets (Notes → its folder, Review → `#flashcards`, Quiz → `#quizzes` or its originating folder). Unify the label copy to "← Back" everywhere instead of three different labels ("← Back"/"← Exit Review"/"← Exit").

9. **Auth wall consistency:** convert the reset-password form's two `UI.showPopup()` error calls (`js/main.js:489,493`) to the same inline `showAuthStatus()` banner used by every other form on the same screen. Add visible helper text under the DOB field ("You must be 13 or older to use Learnora") instead of relying solely on a native tooltip — reuse the `.field-desc` class already established in Settings.

---

## Phase 4 — Notifications tab rework (most novel, do last)

User confirmed: **remove the two fictional toggles, keep and wire up the two real ones, add a proper permission-request flow.**

1. **`index.html:1170-1224`**: rewrite panel title/description from "Email Notifications / Choose which emails you want to receive" (entirely fictional — no email-sending infra exists beyond Supabase Auth's own password-reset email) to "Browser Notifications / Control which desktop notifications Learnora can send you." Remove the "Security Alerts" and "Product Updates" toggle blocks entirely. Relabel "Exam Alerts" → "Timer Alerts" ("Get notified when a focus session, countdown, or flowtime block ends"); keep "Study Reminders" but retitle to "Flashcard Due Reminders" ("Get notified once a day when you have flashcards due for review"). Add a permission-status row above the toggles: "Enable Browser Notifications" button when `Notification.permission === "default"`, "✓ Enabled" when granted, explanatory copy when denied (JS can't re-request a denied permission).

2. **`js/ui.js`**: add `notifyStudyReminders: true, notifyTimerAlerts: true` to `DEFAULT_SETTINGS` (`:54-59`); read both toggles in `saveSettings()` (`:269-279`); restore both in `populateSettingsUI()` (`:281-293`, note these need `.checked`, not `.value` — the existing restore loop only handles `.value`, needs a small dedicated branch for checkboxes).

3. **Gate the two real notification call sites on their settings:**
   - `Timer._tryNotify()` (`js/timer.js:434-441`): `if (!UI.loadSettings().notifyTimerAlerts) return;` before existing permission checks.
   - `notifyDueCardsOncePerDay()` (`js/main.js:1635-1644`): same gate with `notifyStudyReminders`, **and** add its own `Notification.requestPermission()` call (currently only the timer path ever requests permission — flashcard-due notifications can never fire for a user who's never run a timer, a real gap independent of the toggle rework).

4. **Wire the permission-request button** in `bindSettings()` (`js/main.js`) — on Notifications tab view, check `Notification.permission` and render the appropriate status row; button click calls `Notification.requestPermission()` and re-renders on resolution.

---

## Verification

No test suite or build step exists (static files). Verify via a local static server (`python3 -m http.server` or similar — Supabase auth requires `http(s)://`, not `file://`) plus real browser interaction:

- **Phase 1**: trigger each of the 5 AI chat actions (add task, start timer, switch theme, generate quiz, generate plan) and confirm each shows its own distinct dialog title/button text, not "Are you sure?". Click "Plan my week" twice in a row and confirm the second click asks before overwriting. Inspect AI chat markdown rendering (headings, inline code, blockquotes) in both themes for correct coloring. Check Settings → Danger Zone copy matches actual wipe scope.
- **Phase 2**: screenshot the AI chat modal in light and dark theme before/after the Beast Mode dissolution and confirm no visual difference. Take a quiz and confirm correct/wrong answer colors now use the app's accent palette. Resize the folder-detail workspace view and upload material-type picker to a narrow viewport and confirm they reflow instead of squeezing 3/2 columns.
- **Phase 3**: exercise each fixed flow — empty states across folders/flashcards/quizzes/tasks with zero data, timer reset with a running Pomodoro (should confirm) vs. a fresh stopwatch under 60s (should not), saving/applying a favorite preset on a non-Pomodoro type, the new Exams day-detail popover, upload with a mismatched file/type selection, and back-navigation from Notes/Review/Quiz reached via a fresh page load (not just in-app navigation) to confirm deterministic targets.
- **Phase 4**: reset browser notification permission for the site, open Settings → Notifications, confirm the permission-request button appears and works; toggle both settings off and confirm timer completion / flashcard-due alerts no longer fire; toggle back on and confirm they resume.
- Spot-check 2-3 non-English languages after any copy changes to confirm nothing silently falls back to a raw i18n key (copy changes in this plan are mostly to non-i18n'd strings, but double-check).
