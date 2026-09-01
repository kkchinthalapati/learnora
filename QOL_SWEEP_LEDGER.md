# Learnora QoL Sweep — Accessibility & UX Fixes

**Audit date:** 2026-09-01  
**Auditors:** Claude subagent (CSS/visual/a11y) + manual inspection (functional/data-loss)  
**Total findings:** 32 defects across 4 batches  
**Status:** Batches 1–3 **DONE** • Batch 4 **pending**

---

## Batch 1 — Shared infrastructure (semantic text tokens, toast, shortcuts) — ✅ SHIPPED

**Commit:** [`accb99f`](https://github.com/kkchinthalapati/learnora/commit/accb99f) — `fix(a11y,ux): semantic-text contrast & toast/input polish — Batch 1 QoL sweep`  
**Merged to main:** 2026-09-01 · All 50 file changes · +485−176 lines  
**Tests:** 1780/1781 pass (1 vitest worker timeout under load, passes isolated)

### 1.1 — Semantic text tokens ✅

**Problem:** Success (#1e8e6b) and warning (#c98a2e) failed AA as text in light mode (2.93:1 and 4.09:1). Dark-mode danger (3.76:1) also failed. Labels on semantic fills were the *only* part of the app's color system with no dedicated text token.

**Solution:** Add `--success-text` / `--warning-text` / `--danger-text` to `tokens.css` and `themes.css`. Repoint 157 declarations across 40 files. Light-mode tones hold 4.5:1 against each fill's worst backdrop (its own `-soft` wash composited over `--surface-active`). Dark-mode success/warning point back at the fill (already safe); danger lightened to 4.51:1 worst-case.

**Files touched:** 40 CSS modules + 1 TS component (Chip split)  
**Regression test:** 6 new contrast-floor tests in `tokens.test.ts`; one intentionally reverts `--warning-text` to verify it fails at 2.93:1  
**Visual change:** Light-mode semantic text now noticeably darker app-wide — this is the fix working as designed, worth eyeballing.

### 1.2 — `--border` shorthand trap ✅

**Problem:** `--border: 1px solid var(--glass-border-subtle)` is a shorthand. Using it as `border-color: var(--border)` is invalid CSS and silently dropped. ResumeLearningCard's hover border was dead.

**Solution:** Fix ResumeLearningCard to `border-color: var(--accent-ring)`. Annotate the token with a comment so consumers never make this mistake again.

**Files touched:** 1 (ResumeLearningCard.module.css + annotation in tokens.css)

### 1.3 — Toast z-index ✅

**Problem:** Modal overlay sits at `z-index: 10000`. Toast container was `9999`. Every error toast fired from inside a modal (every "could not save" message) rendered *behind* the scrim, dimmed and blurred — exactly when the message mattered most.

**Solution:** Raise toast container to `z-index: 10010`, above modal and commandpalette (9999).

**Files touched:** 1 (ToastProvider.module.css)

### 1.4 — Toast viewport containment ✅

**Problem:** Toast messages interpolate raw `err.message`. An unbroken token (a UUID or a URL) would push the box wider than the viewport on mobile (375px). With no `left` bound and `overflow-x: hidden` on the app chrome, the excess was clipped permanently.

**Solution:** Add `left: 24px` so the container is bounded on both sides and wrapping works inside the viewport. Add `max-width: 100%` and `overflow-wrap: anywhere` on the toast itself. Make the action button `flex-shrink: 0` so a long message never squeezes it out of reach.

**Files touched:** 1 (ToastProvider.module.css)

### 1.5 — Modifier-key guard on keyboard shortcuts ✅

**Problem:** `useKeyboardShortcuts` matched on `e.key` alone and called `preventDefault()` on a match. In QuizRunner, Cmd/Ctrl+D submitted answer "D" instead of bookmarking. In ReviewView, Cmd/Ctrl+1–4 graded flashcards instead of switching tabs. The inline shortcut map in the dep array also re-attached the listener on every render.

**Solution:** Add guards for `ctrlKey`, `metaKey`, `altKey` — if held, the keypress belongs to the browser/OS, not us. Move the shortcut map to a ref so a caller's object literal doesn't cause re-attachment, and every keypress reads the current callbacks (no stale closures).

**Files touched:** 1 TS hook + 1 test file  
**Regression tests:** 7 new tests covering modifier chords, listener stability across re-renders  

### 1.6 — Four silent mutations ✅

**Problem:** 61 mutation call sites, 22 `onError` handlers. Scan found 4 genuine gaps:
- `AccountTab.tsx:88,96` — data export mutations fire silently on failure; dialog closes with no feedback
- `useTaskActions.ts:69,76` — rename and setDueDate are optimistic edits; failures silently revert the row with no trace

**Solution:** Add contextual error toasts matching the app's call-site convention ("Could not export your data. {err.message}"). Decided against a global `onError` in hooks because 18 existing handlers have specific context ("we couldn't save this attempt — weak-topic tracking may be affected") that would be hidden by a generic message.

**Files touched:** 2 (AccountTab.tsx, useTaskActions.ts)

---

## Batch 2 — Data loss & correctness (notes autosave, reload loop, loading flashes, query defaults) — ✅ SHIPPED

**Merged to main:** 2026-09-01 · 4 items · 12 new regression tests  
**Tests:** 1892/1892 pass · `tsc -b` and `vite build` clean

### 2.1 — Notes autosave can strand the last edit ✅

**Problem:** `flush()` returned early when a save was in flight **without
rescheduling**. A student types → the debounce fires while a slow save is
pending → the student stops typing → `dirtyHtmlRef` stays populated and
nothing re-triggers, so the edit is never sent. No unload guard existed either.

**Solution (all 3 parts shipped):**
1. The busy branch now calls `scheduleSave(SAVE_BUSY_RETRY_MS)` (300ms) so a
   blocked save comes back for the edit. On unmount it falls through and
   issues the save alongside the in-flight one rather than dropping it.
2. A failed save puts the html back in `dirtyHtmlRef` and retries once after
   3s; a second failure latches `status: "failed"` and stops. A new keystroke
   resets the retry budget.
3. `beforeunload` guard registered whenever status is unsaved/saving/failed,
   matching the `useQuizDraft` pattern.

**Files:** NotesEditorPane.tsx  
**Regression tests:** new `NotesEditorPane.autosave.test.tsx` — 4 tests on fake
timers covering the reschedule, the single retry then stop, the unload guard
while dirty, and its release after a successful save.

### 2.2 — Chunk-load-error recovery ✅

**Problem:** After a deploy, an open tab's dynamic import for a lazy route
404s → ErrorBoundary shows "Something went wrong" → "Try again" re-renders the
same failing import, looping forever.

**Solution:** `isChunkLoadError()` added to `lib/appUpdate.ts`, matching the six
message shapes browsers use for a failed dynamic import (no engine exposes a
code, so text matching is the only option). ErrorBoundary branches on it:
"A new version is ready" with a **Reload Learnora** button wired to
`applyAppUpdate`, instead of the dead "Try again".

**Files:** ErrorBoundary.tsx, appUpdate.ts  
**Regression tests:** 2 new — the chunk path offers the update and calls
`applyAppUpdate`; a plain error still gets the generic fallback.  
**Note:** routes.tsx needed no change — the boundary at `App.tsx:80` already
catches lazy-import failures.

### 2.3 — Analytics & Achievements flash fake empty state ✅

**Problem:** Nine query hooks destructured as `data: x = []` with no
`isPending` gate, fed straight into the stat engines. Every open rendered
"0 hours", 0% consistency, an empty heatmap and every badge locked.

**Solution:** Both views now aggregate their pending flags and hold a
`Skeleton` until all queries land, following ConceptGraphView. Added
`anyPending()` in `lib/queryState.ts` so the omission is visible in review — a
view that pulls four queries and never calls it is missing its gate.

**Files:** StudyAnalyticsView.tsx, AchievementsModal.tsx, lib/queryState.ts  
**Regression tests:** 2 new (one per view) holding the pending window open with
a never-resolving handler; 8 existing tests updated to await the data.

### 2.4 — Invert query defaults ✅

**Problem:** `staleTime` unset (0) while `refetchOnWindowFocus: false` —
navigating to Analytics refetched 365 days of sessions every time, while a tab
left open an hour refetched nothing on return.

**Solution:** `staleTime: 60_000` and `refetchOnWindowFocus: true`. Focus
refetches are bounded by staleTime, so bouncing between tabs costs nothing.

**Files:** queryClient.ts

---

## Batch 3 — Keyboard & screen-reader access (6 items) — ✅ SHIPPED

**Merged to main:** 2026-09-01 · 6 items · 11 new regression tests  
**Tests:** 1903/1903 pass · `tsc -b` and `vite build` clean

### 3.1 — Socratic Coach drawer is a fake dialog ✅

**Problem:** Declared `role="dialog" aria-modal="true"` with no overlay
machinery — no `useFocusTrap`, no `useOverlayBehavior`, no focus on open, no
restore on close. Tab walked straight out into the page a screen reader had
just been told was inert, and closing dropped focus on `<body>`.

**Solution:** Wired through `useOverlayBehavior` + `useFocusTrap`, exactly as
ConceptNodeDrawer does. The bespoke `window` Escape listener is gone — the
overlay stack owns Escape, so nested overlays now close in order.
The dialog role also moved from the scrim onto the drawer: a `role="dialog"`
wrapping its own backdrop claims the whole viewport as dialog content.

**Note:** the scrim is the drawer's positioning parent here (unlike
ConceptNodeDrawer, where scrim and drawer are siblings), so it deliberately is
**not** `aria-hidden` — that would hide the dialog inside it along with itself.

**Files:** ReviewView.tsx  
**Regression test:** focus enters the drawer on open, 40 tabs never leave it,
Escape closes it and focus returns to the button that opened it.

### 3.2 — Missing focus indicators (3 sites) ✅

**Problem:** Each site set `outline: none` with no `:focus` replacement, and
module-CSS specificity beats the global fallback — so the indicator wasn't
degraded, it was deleted.

**Solution:** the `:focus-within` accent ring from LibrarySearch, on the
wrapper that actually has a border to light up: `.hexRow` (custom theme),
`.searchBar` and `.chatInputRow` (notebooks), `.searchWrapper` (command
palette, which uses an inset ring since it has only a bottom border).

**Files:** appearance.module.css, notebooks.module.css,
CommandPalette.module.css

### 3.3 — Keyboard activation gaps (2 sites) ✅

**Problem:** NotebookStudioView's artifact card was a `role="button"` div with
`tabIndex={0}` and no `onKeyDown` at all — reachable by Tab, activatable by
nothing. Three other cards activated on Space without `preventDefault()`, so
Space both activated them and scrolled the page a screen down.

**Solution:** the artifact card's click and key paths now share one
`openArtifactPreview` handler so they can't drift; `preventDefault()` added to
the Space branch in NotebooksHubView, RecentNotebooksShelf and
ConceptGraphView.

**Files:** NotebookStudioView.tsx, NotebooksHubView.tsx,
RecentNotebooksShelf.tsx, ConceptGraphView.tsx  
**Regression tests:** 3 — the artifact preview opens on Space and on Enter,
and the hub card's Space is prevented while still navigating.

### 3.4 — Invisible heatmap focus ring ✅

**Problem:** the only `:focus-visible` style was a `1.5px var(--surface)` halo
shared with `:hover` — the same colour as the card behind the cell. The
heatmap is a real `role="gridcell"` grid with roving tabIndex, so keyboard nav
is a supported flow with no feedback at all.

**Solution:** a dedicated `.cell:focus-visible { outline: 2px solid
var(--accent) }`, matching the hourly-chart bars rather than inventing a new
cue. The hover halo is left alone — separating an enlarged cell from its
neighbours is its actual job.

**Files:** analytics.module.css

### 3.5 — Labels on role-less elements ✅

**Problem:** StudyDeskCard put `aria-label` on bare `<div>`s. A div has no
role for a name to attach to, so both labels were silent.

**Solution:** `role="img"` on the status dot (the dot *is* the status, so the
label is its alt text), `role="group"` on the cheer bar.

**Files:** StudyDeskCard.tsx  
**Regression test:** both are now reachable by role and name.

### 3.6 — Table semantics ✅

**Problem:** six `<th>` cells in the Subject Balance Matrix with no
`scope="col"`, and no `<caption>` — screen readers had to guess the
cell/header association, and the table had no name out of context.

**Solution:** `scope="col"` on each header plus a visually-hidden `<caption>`
(`.srOnly`, same shape as MaterialPanel's).

**Files:** StudyAnalyticsView.tsx, analytics.module.css  
**Regression test:** the table is findable by its caption and all six headers
carry `scope="col"`.

### Guard added

`styles/focusVisible.test.ts` asserts each `outline: none` site has a live
accent-ring rule and that the heatmap ring is drawn in `--accent`. CSS source
text, not rendered styles — jsdom applies no stylesheets, the same reason
`contrast.test.ts` and `drift.test.ts` read files directly.

---

## Batch 4 — Visual polish & mobile (8 items) — ⏳ PENDING

**Scope:** Responsive layout breaks, touch target misses, disabled/hover state visibility, dead code

### 4.1 — Mobile grid overflow that is clipped, not scrollable

**Problem:** notebooks.module.css, PreMortemHubView/RadarView — `minmax(340px, 1fr)` with no mobile override. AppShell leaves `viewport − 32px`, so 360px Android overflows ~12px — and `overflow-x: hidden` on the app chrome **clips it permanently**.

**Impact:** Card content is permanently cut off on narrow viewports.

**Solution:** Use `minmax(min(100%, 340px), 1fr)`.

**Files:** 3 CSS modules

### 4.2 — Suspense fallback is a bare unstyled paragraph

**Problem:** routes.tsx — `<p role="status">Loading workspace…</p>` covers the seven heaviest screens. Full layout collapse then snap-back on every entry.

**Impact:** Visual jank every time you enter a heavy view.

**Solution:** Use the `Skeleton` component for a consistent loading state.

**Files:** 1 TSX file

### 4.3 — `OfflineBanner` sync button invisible in most themes

**Problem:** OfflineBanner.module.css — hardcoded `color: #ffffff` inside a pill whose text colour is `--accent-on`/`--warning-on` (near-black in 8 of 13 light presets).

**Impact:** The "Sync now" button label is unreadable in most theme combinations.

**Solution:** Change to `color: inherit`. Also hide the button when offline (it's a no-op) and consider mounting the banner above AppShell so auth screens get an offline signal too.

**Files:** 2 (OfflineBanner.module.css, OfflineBanner.tsx)

### 4.4 — Touch targets under the app's stated floor

**Problem:** tokens.css commits to `--touch-target-min: 44px` "globally". Missed by:
- ToggleSwitch — 44×24px (the most-used control in Settings)
- Modal close X at ~34px
- Analytics heatmap cells at 12px

**Impact:** Fiddly tap targets on touch.

**Solution:** Bump switches and close button to `min-height/min-width: var(--touch-target-min)`. Heatmap cells scale up under mobile media query.

**Files:** 3 CSS modules

### 4.5 — Disabled toggle looks identical to enabled

**Problem:** ToggleSwitch.module.css has no `input:disabled + .toggleSlider` rule despite the component accepting `disabled`.

**Impact:** Users click repeatedly with no feedback.

**Solution:** Add opacity + cursor rules for disabled state.

**Files:** 1 CSS module

### 4.6 — Sidebar badges pop in after load

**Problem:** Sidebar.tsx — `data: dueCount = 0` defaults, so badges are absent on first paint then appear and shift the nav.

**Impact:** Layout shift on page load.

**Solution:** Check `isPending` explicitly and show a skeleton or hide the badge during load.

**Files:** 1 TSX file

### 4.7 — Dead code with live traps (3 items)

**Problem:**
- StudyRoomView.module.css — 419 lines, imported by nothing. Edits here silently have no effect.
- CommandBar — exported, imported nowhere; header comment says it assumes no sidebar.
- CommandPalette.tsx:606 — `aria-labelledby` pointing at a `display: none` span using a class that doesn't exist.

**Impact:** None today, but a trap for the next editor.

**Solution:** Delete StudyRoomView.module.css and CommandBar component. Drop the `aria-labelledby` and keep the `aria-label`.

**Files:** 3 (2 delete, 1 edit)

---

## Deferred — requires product decision, not a fix

- **Timer's separate "Apply & Reset" step** — Typing a duration doesn't update the clock until you click a second button. A UX question, not a defect.
- **Five competing "start a session" buttons on the dashboard** — Each reshapes a screen and deserves its own pass.
- **Notebooks Studio tab toggle hides notes while chatting** — A layout question that should be revisited as a whole.

---

## Rollup & notes

**Batch 1:** Shipped 2026-09-01 · 50 files · +485−176 · 1780/1781 tests pass  
**Batch 2:** Shipped 2026-09-01 · 4 items · 12 new tests · 1892/1892 tests pass  
**Batch 3:** Shipped 2026-09-01 · 6 items · 11 new tests · 1903/1903 tests pass  
**Batch 4:** 8 remaining defects · visual polish and mobile · estimate **6–8 hours**

**Why this structure?** Batch 1 is shared infrastructure (tokens, hooks, toasts) that several later items depend on — done first, unblocks the rest. Batches 2 (correctness) and 3 (a11y) are independent. Batch 4 (polish) can run in parallel if needed.

**Regressions to watch:** 
- Batch 1's 157-declaration repoint is a real light-mode visual change. Eyeball before shipping if you haven't already.
- Batch 3.1 shipped with a focus-trap regression test. Note the scrim there
  must stay un-hidden: it is the dialog's parent, so aria-hidden on it would
  hide the dialog too (this cost a red test run to find).
- Batch 2.4 changed cache behaviour app-wide: anything that relied on a
  refetch-on-every-mount for freshness now reuses the cache for 60s.
- Batch 2.1 shipped with regression tests. The retry-once-then-stop policy is
  deliberate — surviving a longer outage needs a durable local draft
  (useQuizDraft's model), not more retries.
