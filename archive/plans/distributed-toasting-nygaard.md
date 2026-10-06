# Accessibility pass: Study Room, Concept Graph, Achievements, Analytics, Exam Prep

## Progress

- [x] **Batch 1** — Mechanical CSS/attribute fixes. Done 2026-08-24
      (commit follows this file's own commit on `main`): reduced-motion
      guards on `graph.module.css` (`.nodeGapRing`) and `analytics.module.css`
      (`.cell`/`.barFill`); `--touch-target-min` applied to `.cheerBtn`/
      `.syncBtn` in `room.module.css` and `.presetBtn`/`.badgeIconBox` in
      `achievementsModal.module.css`; `aria-pressed` added to the three
      Achievements preset-button groups + a test. Full suite green
      (1456/1456), typecheck/lint clean.
- [x] **Batch 2** — Achievements category tabs (roving tabindex). Done 2026-08-24.
      Roving tabindex and arrow-key nav (Left/Right/Up/Down/Home/End) added to
      AchievementsModal category tabs, plus single `role="tabpanel"` pairing with
      `aria-controls` / `aria-labelledby`.
- [x] **Batch 3** — Study Room ambiance popover overlay fix + drop `role="toolbar"`.
      Done 2026-08-24. `useOverlayBehavior` and `useFocusTrap` added to ambiance
      popover (`aria-modal="true"`), Escape-to-close and focus return tested;
      `role="toolbar"` removed from cheer reaction rows.
- [x] **Batch 4** — Exam Prep Modal (checkbox hit-area, phase headings). Done 2026-08-25.
      Phase titles converted to `<h5>` headings; checklist checkbox and `.taskTitle`
      wrapped in `<label>` for larger hit-area; tests added and passing.
- [x] **Batch 5** — Analytics date-range button touch target. Done 2026-08-25.
      Added `.rangeBtn` with `min-height: var(--touch-target-min)` in `analytics.module.css`;
      updated date-range buttons in `StudyAnalyticsView.tsx` to use `.rangeBtn`;
      added comprehensive date-range switching test in `StudyAnalyticsView.test.tsx`.
- [x] **Batch 6** — Concept Graph `role="img"` → `role="group"`. Done 2026-08-25.
      Replaced SVG `role="img"` with `role="group"` and added descriptive keyboard interaction instructions in `aria-label`.
- [ ] Batch 7 — Concept Graph textual/list fallback

Pick up at Batch 4 next. Batches 4, 5, 6 are independent of each other;
Batch 7 depends on Batch 6 landing first (both touch `ConceptGraphView.tsx`).

## Context

`FEATURE_BACKLOG.md`'s original a11y ask named Friends/Study Circle/command
bar specifically; those have since gotten attention, but five bigger
surfaces shipped after that audit and have never had a dedicated pass:
Study Room, Concept Graph, Achievements Modal, Analytics Dashboard, and
Exam Prep Modal. Three read-only Explore audits (one per surface group)
confirmed this app already has a consistent, mature a11y toolkit — a shared
overlay/focus-trap pair, a touch-target token, a roving-tabindex tabs
pattern, and a chart-labeling convention — that these five surfaces mostly
follow already, but not uniformly. The goal here is closing the specific,
concrete gaps found, reusing that existing toolkit everywhere it applies,
not inventing new patterns. Two findings in Concept Graph need genuinely
new (but small) work; everything else is a reuse of what's already in the
codebase.

Existing toolkit to reuse (confirmed by reading the source, not just the audit):
- `useOverlayBehavior` (`webapp/src/context/overlayStack.ts`) + `useFocusTrap`
  (`webapp/src/hooks/useFocusTrap.ts`) — together give an overlay Escape-to-close
  (via the document-level stack listener in `OverlayStackProvider.tsx`),
  scroll lock (reference-counted there too), initial-focus-on-open, and
  focus-return-to-trigger-on-close, plus Tab-trap. `Modal.tsx` wraps both;
  `ConceptNodeDrawer.tsx:32-33` is the cleanest existing example of calling
  them directly on a non-`<Modal>` overlay — that's the template for Batch 3,
  not `Combobox.tsx` (which only self-manages Escape/outside-click and skips
  `useOverlayBehavior`, so copying it would leave the scroll-lock/focus-return
  gaps unfixed).
- `--touch-target-min: 44px` token, `webapp/src/styles/tokens.css:160`.
- Roving-tabindex ARIA-tabs pattern, `webapp/src/views/settings/SettingsView.tsx`
  (`onTabKeyDown`, arrow keys + Home/End, `tabIndex={selected ? 0 : -1}`).
- "Real `<button>` + `aria-label` carrying the actual value" for chart marks —
  already done well in `StudyHeatmap.tsx` / `StudyAnalyticsView.tsx`'s bar chart.
- `@media (prefers-reduced-motion: reduce)` — no central hook, copy the block
  into whichever `*.module.css` animates and lacks one (~24 files already do).
- `role="list"` + real `<button>` children (no `role="listitem"` wrapper) —
  `ReviewView.tsx:811` is the template for Batch 7's textual fallback.

## Sequencing

Seven small-to-medium PRs, ordered by risk/effort. 1, 2, 4, 5, 6 touch
disjoint files and can land in any order or in parallel across sessions;
3 and 7 are the two behavioral/new-feature batches and are worth their own
focused sessions. Total: ~14-16 files, ~330-420 net lines.

### Batch 1 — Mechanical CSS/attribute fixes (trivial, ~4 files)

- `views/graph/graph.module.css`: add a `prefers-reduced-motion` guard for
  `.nodeGapRing`'s `pulseGap` animation (~line 310), modeled on
  `examPrepModal.module.css:504-508`.
- `views/analytics/analytics.module.css`: same guard for `.cell:hover/
  .cell:focus-visible { transform: scale(1.35) }` (~line 197) and `.barFill`'s
  transition (~line 360) — this file currently has zero such blocks.
- `views/room/room.module.css`: `.cheerBtn` grows from 36px (and a mobile
  34px regression at ~line 1216) to `var(--touch-target-min)`; `.syncBtn`'s
  mobile `min-height: 40px` (~line 1221) same fix. `.ambianceTrigger`/
  `.inviteButton`/`.chatForm > button` already use the token correctly —
  copy their treatment, don't reinvent it.
- `views/achievements/achievementsModal.module.css`: `.presetBtn` (~line 222)
  gets `min-height: var(--touch-target-min)` (accept the slightly taller
  preset chips — flag as a visible layout change in the PR, not a silent
  one); `.badgeIconBox` (~line 355) switches its hardcoded `44px` to the
  token for consistency, no visual change.
- `views/achievements/AchievementsModal.tsx`: add `aria-pressed={goals.dailyMinutesGoal === mins}`
  (and the cards/tasks equivalents) to the three preset-button `.map()`
  blocks, mirroring the sibling category pills' `aria-selected` (~line 381).

Tests: extend `AchievementsModal.test.tsx`'s existing preset test to assert
`aria-pressed` toggles correctly. No test needed for pure CSS changes (no
precedent in this codebase for asserting on `prefers-reduced-motion` or
computed pixel sizes via RTL/jsdom).

### Batch 2 — Achievements category tabs (low effort, 2 files)

`AchievementsModal.tsx`'s `role="tablist"` block (~line 369) has no
`aria-controls`, no roving tabindex, no arrow-key nav. Copy
`SettingsView.tsx`'s `onTabKeyDown` pattern verbatim, adapted to
`CATEGORIES`/`selectedCategory`: add `tabRefs`, an `onCategoryTabKeyDown`
handler (ArrowLeft/Right wrap, Home/End), and on each tab button add
`tabIndex={isSelected ? 0 : -1}`, `id`, `aria-controls="achievements-badge-grid"`,
a ref, and the keydown handler. Give the badge grid container (~line 395)
`id="achievements-badge-grid"` + `role="tabpanel"` + `aria-labelledby` — one
shared panel that re-filters, not five separately-mounted panels (this is a
filter UI, not `SettingsView`'s multi-panel case).

Tests: add a test block modeled on `SettingsView.test.tsx`'s tab-keyboard
tests — Arrow key wrap, Home/End, only the selected tab has `tabIndex="0"`,
`aria-controls` points at the grid's id.

### Batch 3 — Study Room ambiance popover (the one blocking gap)

`StudyRoomView.tsx`'s ambiance popover (`.ambianceMenu`, opened via
`isAmbianceOpen`, rendered ~line 154-214) has no focus trap, no
Escape-to-close, no initial-focus, no focus-return, no scroll lock — only an
outside-mousedown listener (~lines 48-66, on `ambianceMenuRef`, which is
attached to the outer `.ambianceWrapper`, not the popover itself).

Fix: add a **new** ref on the `.ambianceMenu` div itself (not the existing
`ambianceMenuRef`, which must stay on the wrapper for the outside-click
check to keep working), then:
```tsx
useOverlayBehavior({
  ref: ambiancePopoverRef,
  open: isAmbianceOpen,
  onClose: () => setIsAmbianceOpen(false),
});
useFocusTrap(ambiancePopoverRef, isAmbianceOpen);
```
(imports: `useOverlayBehavior` from `../../context/overlayStack`,
`useFocusTrap` from `../../hooks/useFocusTrap` — same two `ConceptNodeDrawer.tsx`
uses.) Add `aria-modal="true"` next to the existing `role="dialog"` on that
div, now accurate since it behaves fully modally. Keep the existing
outside-click effect as-is — `useOverlayBehavior` doesn't provide that, so
it's still needed and doesn't conflict.

Also drop `role="toolbar"` from the cheer-emoji rows (`StudyRoomView.tsx`
~line 242, `StudyDeskCard.tsx` ~line 268): these are independent one-shot
action buttons, not a composite widget, so the ARIA toolbar's implied
roving-tabindex contract would make them *less* accessible (one Tab stop
instead of several) for no benefit. One-line removal in each file; leave
the existing `aria-label` on the container as-is (screen readers still read
it fine without the toolbar role).

Tests: extend/add to `StudyRoomView.test.tsx`'s existing ambiance-dialog
test, modeled on `Modal.test.tsx`'s house style — focus moves into the
popover on open and back to the trigger on close; Escape closes it; Tab is
trapped inside while open.

### Batch 4 — Exam Prep Modal (low effort, 2 files)

- Checklist checkbox (`ExamPrepModal.tsx` ~line 405, `.taskCheck` in
  `examPrepModal.module.css` ~line 374, 18×18px): no exact "small visual
  checkbox, larger hit area" precedent exists in this codebase (checked
  `Sidebar.module.css`/`combobox.module.css` — neither styles a checkbox;
  `MaterialPanel.tsx`'s full-card-as-label pattern is the wrong scale).
  Wrap the checkbox + its `.taskTitle` text (not the whole `.taskRow`, so
  the due-date pill / "Add to Tasks" control nearby isn't swallowed) in a
  single `<label>` — native label-wraps-control, same idea at a smaller
  scale. Keep `.taskCheck`'s visual size at 18px; only the clickable region
  grows past 44px.
- Phase titles (`ExamPrepModal.tsx` ~line 371, currently `<span>`) become
  `<h5>` — the correct next level under the modal's existing `<h4>` roadmap
  title (~line 346) — so screen-reader users get real heading-navigation
  stops between Phase 1-4.

Tests: extend `ExamPrepModal.test.tsx`'s existing roadmap-phases test to
assert `getByRole("heading", { level: 5, name: phase.title })`; add a test
that clicking a task's title text toggles its checkbox.

### Batch 5 — Analytics date-range buttons (low effort, 2 files)

The three date-range buttons (`StudyAnalyticsView.tsx` ~lines 209-258) reuse
the decorative `.statBadge` class (`analytics.module.css` ~line 86,
`padding: 2px 7px`) despite being real interactive controls — far under the
touch-target minimum. Add a new `.rangeBtn` class in `analytics.module.css`
with `min-height: var(--touch-target-min)` (check first whether this
codebase's CSS Modules setup supports `composes:` before using it — if not
used anywhere else, just duplicate `.statBadge`'s visual rules rather than
introduce the first `composes:` usage unverified); swap the three buttons'
class, keep their existing inline state-coloring as-is. Leave `.statBadge`
itself untouched — it's correctly used elsewhere as a non-interactive pill.

Leave the 12×12px heatmap cells alone — accepted GitHub-style calendar
trade-off, arrow-key grid nav already exists per `StudyHeatmap.tsx`. Leave
the h1→h3 heading skip alone — it's pre-existing and also present in
`PlanView.tsx`, a separate cross-cutting cleanup, not this batch's scope.

Tests: if `StudyAnalyticsView.test.tsx` doesn't already have a behavioral
test for switching the active date range, add one (this codebase tests
behavior/attributes, not computed CSS pixel sizes, so no size-assertion test).

### Batch 6 — Concept Graph: fix `role="img"` (trivial, 1 file)

`ConceptGraphView.tsx:406`'s `<svg role="img" aria-label="...">` wraps
genuinely interactive `<g role="button" tabIndex={0}>` node children
(~line 493) — `role="img"` tells assistive tech "flatten this, don't expose
interactive descendants," which actively fights the node keyboard support
that's otherwise implemented correctly. Change to `role="group"` with an
updated label hinting at the interaction model, e.g. `aria-label="Interactive
concept map. Use Tab to move between concept nodes; press Enter to open a
node's details."` This is a plain ARIA-role correction, not new behavior.

Tests: add an assertion the container is exposed as `getByRole("group",
{ name: /Interactive concept map/i })` and that existing node-button queries
still pass.

### Batch 7 — Concept Graph: textual/list fallback (largest batch, new feature)

No screen-reader-usable way exists to get the graph's information — a
student has to open each node's drawer one at a time to reconstruct any
relationship. Smallest reasonable fix, not a new page/route: a toggleable
list view alongside the existing canvas, reusing `ReviewView.tsx:811`'s
`role="list"` + real `<button>` (no `role="listitem"` wrapper) template.

- Add `const [viewMode, setViewMode] = useState<"graph" | "list">("graph")`
  and a toggle button near the existing toolbar/zoom controls in
  `ConceptGraphView.tsx`.
- New file `webapp/src/views/graph/ConceptGraphListView.tsx`: takes
  `nodes`, `edges`, `onSelectNode`. Renders `<div role="list" aria-label="Concepts
  and their connections">`, one real `<button>` per node (not wrapped in
  `role="listitem"`) labeled with name + mastery % + gap status — reuse the
  exact label text/logic already computed for the SVG node's `aria-label`
  (~line 495) and `ConceptNodeDrawer.tsx`'s gap logic (~lines 113-115), so
  the two views describe nodes identically. Under each row, list its related
  concepts as plain text/a small `<ul>`, reusing `ConceptNodeDrawer.tsx`'s
  existing `relatedConcepts` resolution (~lines 39-41) — extract to a shared
  helper in `lib/conceptGraph.ts` if that logic would otherwise duplicate.
  Clicking a row calls the same `onSelectNode`/`setSelectedNodeId` that opens
  `ConceptNodeDrawer`, so list and graph views share one selection path and
  one detail drawer — no new detail UI needed.
- In `ConceptGraphView.tsx`: render the existing SVG `<main>` block when
  `viewMode === "graph"`, `<ConceptGraphListView>` when `"list"`; keep
  `<ConceptNodeDrawer>` unconditional/shared between both modes.

Tests: new `ConceptGraphListView.test.tsx` (model on `ConceptNodeDrawer.test.tsx`'s
fixture style) — one row per node with the right accessible name, clicking a
row calls `onSelectNode`, related concepts appear as text. Add a test in
`ConceptGraphView.test.tsx` that toggling to "List View" swaps out the SVG
and that selecting a node from the list still opens the drawer.

## Verification (per batch, before moving to the next)

1. `cd webapp && npx tsc -b` — typecheck clean.
2. `npx oxlint` — lint clean.
3. `npx vitest run` for the touched surface's test files first, then a full
   `npx vitest run` before committing each batch (current baseline:
   1455/1455 passing).
4. For the two behavioral batches (3 and 7), manually sanity-check in a
   running app if convenient: Tab into the Study Room ambiance popover and
   confirm Escape/Tab-trap/focus-return; toggle Concept Graph's List View
   and confirm it renders and opens the same drawer.
5. Commit + push each batch separately (matches how this session has been
   working — small, verified, tested commits), so a bad batch is easy to
   isolate and revert without losing the others.
