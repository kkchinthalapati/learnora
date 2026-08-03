# Dashboard batch — 9 renderable files

Status: AUDITED — 2026-08-02. Combines two independent passes: this session's live-rendered
audit (screenshots below) and a parallel source-only pass (dev account) that additionally
found a HIGH-severity accessibility bug and a breakpoint-coordination issue, folded in below
at the CommandBar and DashboardView entries respectively.
Source: `webapp/src/views/dashboard/`

Rendering: **live, via Playwright against the real running Vite dev server** (not source-only).
No `.env`/live Supabase credentials exist in this repo (`supabase.ts` hardcodes the anon key
directly); `test/mockSession.ts` / `test/auth.tsx` are vitest-only (they `vi.spyOn` the client
module, which doesn't help a real browser). Reached the dashboard anyway by:
1. Seeding `localStorage["sb-mlvgqwqiynpwpwzqufdf-auth-token"]` with a shaped-correctly fake
   session (this is exactly what `supabase-js`'s `persistSession` reads on `getSession()`, no
   network call needed for a session with a future `expires_at`), plus the `learnora_mode` /
   `learnora_accent` / `learnora_sidebar` / `learnora_bg` / `learnora_font` / `learnora_size`
   appearance keys `lib/appearance.ts` reads directly.
2. Intercepting `**/rest/v1/**`, `**/auth/v1/**`, `**/functions/v1/**` with Playwright
   `page.route`, returning fixtures shaped like `DashboardView.test.tsx`'s own MSW handlers
   (same entity names: `exams`, `study_sessions`, `folders`, `tasks`, `quiz_attempts`,
   `flashcards` HEAD with a `content-range` header, `weekly_plans`).

This means every screenshot below is a real render of the real component tree and real CSS
Modules — not a mockup. Screenshots and code line numbers should agree; where I mention a pixel
value below, I mean the *shipped* CSS, and I've eyeballed it in the render too.

Note on file count: the ledger's batch table says "8" for this row; the actual `.tsx` count
under `webapp/src/views/dashboard/` (excluding `DashboardView.test.tsx`) is **9**:
`DashboardView`, `CommandBar`, `AIActionsCard`, `FocusCard`, `NextExamCard`, `OnboardingBanner`,
`SessionHistoryCard`, `StreakCard`, `TasksCard`. All 9 are audited below. `analytics.ts` and
`useLocalSessions.ts` are non-visual (pure logic / a storage hook) and are referenced from the
components that use them rather than getting their own entry.

Screenshots captured (`redesign/screenshots/dashboard/`):
- `DashboardView-light.png` — light, default accent (teal), populated data
- `DashboardView-dark.png` — dark, default accent, populated data
- `DashboardView-dark-cyberpunk.png` — dark, `cyberpunk` accent preset, populated data
- `DashboardView-dark-empty-onboarding.png` — dark, default accent, zero-data account (onboarding
  banner + every card's empty state simultaneously)
- `DashboardView-dark-loading.png` — dark, default accent, REST responses held open 8s (Skeleton
  states on NextExamCard/StreakCard; FocusCard's local-storage-first paint already shows numbers
  while its network total is still pending — see FocusCard entry)

---

## DashboardView (`webapp/src/views/dashboard/DashboardView.tsx`)

- Route: `/` (protected, inside `AppShell`)
- Related files: `dashboard.module.css` (`.view`, `.pageHeader`, `.grid`), all 8 subcomponents
- Screenshots: all 5 listed above — this is the composed page all of them appear on
- Header: HAS the canonical `.pageHeader` pattern — `<div className={styles.pageHeader}><h1>`
  (lines 24-26), styled at `dashboard.module.css:12-21` (`margin-bottom: var(--s-6)`, then h1
  gets `font-family: var(--font-head); font-size: var(--fs-2xl); font-weight: 700; margin: 0`).
  No actions slot — header is title-only, consistent with move #2's description of the pattern.
- Card usage: none directly (delegates to children); `.view` and `.grid` are layout-only
- Spacing: `.view` padding `var(--s-6) var(--s-6) var(--s-8)` (line 7) — on-scale. `.grid` gap
  `var(--s-6)` (line 28), `margin-bottom: var(--s-6)` (line 30) — on-scale. Breakpoint at 860px
  collapses `1.35fr 1fr` to `1fr` (lines 33-37).
- Accent usage: none directly in this file (all in children)
- Distinctive/preserve: none
- Accessibility: single `<main>` landmark wraps the whole view; one `<h1>`. No other roles here.
- Responsive: `@media (max-width: 860px)` — grid to single column (line 33-37); not verified at
  a narrow viewport in the captured screenshots (all taken at 1440px) — worth a follow-up capture
  before Phase 4/5 sign-off, not blocking for source-grounded audit. **Cross-batch note (from the
  parallel source-only audit): this file's 860px breakpoint doesn't match any other module's** —
  768/900/1024 are used elsewhere in the app (CommandBar itself uses 768px). See design-move #8
  (breakpoint coordination) in DESIGN_MOVES.md.
- Test file: `DashboardView.test.tsx` — one file tests the whole composed page (see per-card
  notes below for its query style). Renders through `renderWithAuth` + a real `Routes` table +
  `ChatProvider` + `TurboChat`, i.e. as close to the real app tree as a unit test gets.
- Design-move tags: [PageHeader primitive: HIGH] (canonical instance, title-only, no actions) ·
  [header action-affordance: LOW] (nothing here obviously wants a top-right action — all
  primary actions already live inside cards, e.g. "Start a focus session", "Plan my week")
- Issues found (severity):
  - **Medium — floating CommandBar has no reserved bottom safe-area.** `.view`'s bottom padding
    is `var(--s-8)` = 32px (line 7), but `CommandBar` (`commandBar.module.css:12-31`) is
    `position: fixed; bottom: 28px` with its own vertical padding (`10px 18px`, ~52-56px total
    bar height). 28px + ~56px ≈ 84px of viewport-bottom space the bar actually occupies, well
    past the page's 32px reserved bottom padding. Confirmed in the live render (see
    `DashboardView-light.png`/`-dark.png`/`-dark-cyberpunk.png`): the bar visibly overlaps the
    second-to-last "Recent focus sessions" log row at the bottom of the page. A user scrolled to
    the bottom of a real (taller) history list would have their last 1-2 log entries permanently
    covered by the floating bar. Not a redesign-scope layout rewrite, but worth a line in
    Phase 4 (either reserve `padding-bottom` on `.view` sized to the bar's height, or give
    `.logList` a `scroll-margin-bottom`).
- Redesign status: TODO

---

## CommandBar (`webapp/src/views/dashboard/CommandBar.tsx`)

- Route: not routed — dashboard-only floating overlay, mounted at the bottom of `DashboardView`
  (line 44), rendered only while `/` is the active route (unlike `MiniTimer`/`TurboChat` in
  `App.tsx`, which are route-independent)
- Related files: `commandBar.module.css`
- Screenshots: visible (bottom-center, pill-shaped) in all 5 dashboard screenshots
- Header: none (not a page)
- Card usage: its own bespoke glass-pill shell, not the `.card` shape — `background:
  var(--glass-bg-strong)` (a *different* token than `.card`'s `var(--glass-bg)`),
  `backdrop-filter: blur(32px) saturate(180%)` (commandBar.module.css:24-25, hand-written
  numbers rather than `var(--glass-blur)`/`var(--glass-saturate)`, unlike every other glass
  surface in this batch which does use those tokens), `border-radius: var(--r-pill)`,
  `box-shadow: var(--shadow-lg), 0 0 30px var(--accent-glow)`. This is deliberately distinct from
  `.card` (pill vs. panel, always-on accent glow) — not a Card-primitive candidate, it's a
  different shape class entirely (more like the AI chat's glass/purple treatment the ledger says
  to preserve, though CommandBar itself isn't under `components/chat/`).
- Spacing: `bottom: 28px` (line 14, off-scale — nearest tokens are `--s-6`=24 or `--s-8`=32),
  `gap: 12px` (line 20, exactly `--s-3` but hardcoded), `padding: 10px 18px` (line 22, both
  off-scale — nearest to 10 is `--s-2`=8 or `--s-3`=12; nearest to 18 is `--s-4`=16 or
  `--s-6`=24), `.input` `padding: 6px 0` (line 46, off-scale). Mobile breakpoint overrides
  `bottom: 24px` (=`--s-6`, on-scale) at ≤768px (lines 86-89).
- Accent usage: icon color `var(--accent-text)` (line 37), send button `background: var(--accent)`
  + `color: var(--accent-on)` (lines 68-69), permanent ambient glow `0 0 30px var(--accent-glow)`
  on the bar itself (line 30) plus a *second*, larger glow on send-button hover
  (`0 0 16px var(--accent-glow)`, line 82). This is the single most accent-saturated element on
  the whole dashboard — an always-visible glowing accent-colored pill sitting on every screenshot.
  Reads well in the default teal and in cyberpunk pink alike (both captured), but it's worth
  flagging as the strongest data point for design-move #4 (accent restraint) in this batch: this
  one component alone accounts for 4 of the ~15 accent touches on the page.
- Distinctive/preserve: the comment at the top of `commandBar.module.css` explains its own
  history (ported from `!important`-laden vanilla CSS, now cleanly scoped) and calls out that
  the `left: 50%` centering is a known gap — "the React app has no sidebar yet... Restore it with
  the sidebar" — but the app *does* have a sidebar now (visible in every screenshot, ~236px in
  the captures). Live render confirms the bar centers on the *full viewport*, not on the content
  area right of the sidebar, so on a wide viewport it sits visibly left-of-center relative to the
  cards above it (compare the bar's horizontal position to the grid's in any of the 5 screenshots
  — the bar is shifted left of the grid's centerline). This looks like a genuine stale TODO, not
  an intentional decision — flag for redesign, not preserve.
- Accessibility: `<input aria-label="Ask Learnora AI">`, submit button
  `aria-label="Send AI command"`, icon `aria-hidden="true"`. Good coverage.
- Responsive: `@media (max-width: 768px)` narrows to `86vw` and lowers `bottom` to 24px (lines
  85-89); `@media (prefers-reduced-motion: reduce)` disables the send-button hover transform
  (lines 92-98).
- Test file: covered inside `DashboardView.test.tsx` ("sends the command bar's question into the
  same conversation", lines 378-398) — queries by role/label (`getByRole("textbox", {name:
  "Ask Learnora AI"})`), no DOM-depth queries.
- Design-move tags: [Card primitive: LOW] (intentionally not a `.card` — different shape) ·
  [accent restraint: MEDIUM] (heaviest single accent user in the batch; not unattractive but
  worth a second look across all 13 presets, not just default+cyberpunk)
- Issues found (severity):
  - **HIGH (found by the parallel source-only audit, confirmed against source here) — the
    CommandBar input has no focus indicator at all.** `commandBar.module.css:52,56-58` sets
    `outline: none` plus `box-shadow: none` on `.input:focus`, and neither global fallback in
    `index.css` can reach it: the `:where(...):focus-visible` ring deliberately excludes inputs,
    and the generic `input:focus` accent ring loses on specificity ((0,1,1) vs the module rule's
    (0,2,0)). A keyboard user tabbing to the dashboard's primary AI entry point gets no visible
    focus state — a WCAG 2.4.7 failure. Not visible in the live screenshots since focus state
    isn't captured by a static screenshot; this is a real gap this session's live pass didn't
    catch on its own. Standalone bug fix, not gated on any design move.
  - **Low — stale centering comment/behavior.** `left: 50%` centers on the full viewport, not the
    content area beside the sidebar, contradicting the file's own comment that this was meant to
    be revisited "with the sidebar" (which now exists). Visually off-center in every screenshot.
- Redesign status: TODO

---

## NextExamCard (`webapp/src/views/dashboard/NextExamCard.tsx`)

- Route: subcomponent of DashboardView, first card in the grid
- Related files: `dashboard.module.css` (`.card`, `.examCard`, `.countdown`, `.examMeta`,
  `.pill`, `.diffEasy/.diffMedium/.diffHard`)
- Screenshots: populated state in `-light`/`-dark`/`-dark-cyberpunk`; empty state ("No exams
  scheduled…") in `-dark-empty-onboarding`; Skeleton loading state in `-dark-loading`
- Header: none — uses `.eyebrow` label pattern ("NEXT EXAM") instead of an `<h*>`, consistent
  with all the other stat cards in this batch (not a PageHeader-primitive candidate; this is a
  card-internal label, a separate, smaller pattern worth naming if a Card primitive gets slots)
- Card usage: `.card .examCard` (line 15/23/38/67) — one of the 3 exact `.card`-shell instances
  in `dashboard.module.css`. `.examCard` layers a `position: relative; overflow: hidden` +
  `::before` radial-gradient accent wash on top (lines 110-131) — genuinely distinct decoration,
  not duplication.
- Spacing: no hardcoded spacing inside this component's own JSX; inherits `.card`'s
  `padding: clamp(20px, 3vw, 28px)` (dashboard.module.css:49) — see Card-primitive note below.
  `.examMeta` `gap: var(--s-3)` (line 161, on-scale), `.countdownUnit` `margin-top: var(--s-2)`
  (line 149, on-scale). `.pill` `padding: 3px 10px` (line 177) — both values off-scale (nearest:
  `--s-1`=4, `--s-3`=12).
- Accent usage: `.countdown` (the big "3") is `color: var(--accent-text)` (line 139); `.link`
  ("Open calendar →") is `var(--accent-text)`, hover `var(--accent-hover)` (lines 77-84); the
  card's own radial-gradient accent wash (`var(--accent-soft)`, line 123). Three accent touches
  in one card — this is the card DESIGN_MOVES.md's move #4 note singles out ("countdown...
  today-badge glow"). Confirmed in the live cyberpunk screenshot: countdown number, link, and the
  card's ambient top-right glow are all hot pink simultaneously, plus the difficulty pill uses a
  semantic (not accent) danger/warning/success color, so on a card with both an accent-colored
  countdown *and* an accent-tinted background wash *and* a separately-colored difficulty pill,
  there are three different color systems competing for attention in one card. Reads fine in this
  case (accent is desaturated enough, and the difficulty pill's danger-red is distinguishable
  from the pink accent) — but it's the best single example in this batch for a design-move #4
  discussion.
- Distinctive/preserve: exam-difficulty color coding (`diffEasy`/`diffMedium`/`diffHard` mapping
  to `--success`/`--warning`/`--danger` tokens, lines 184-197) — ledger explicitly calls this out
  as preserve-do-not-touch.
- Accessibility: loading state has `aria-busy="true"` on the card wrapper (line 15) with a
  labeled `<Skeleton label="Loading your next exam">`; error state uses `role="alert"` (line 25).
  Good coverage of all 3 non-happy-path states.
- Responsive: none component-specific; inherits the grid's 860px breakpoint.
- Test file: `DashboardView.test.tsx`, "Next exam card" describe block (lines 131-172) — pure
  role/text queries (`findByText`, `getByRole("link", {...})`), no `.closest()`.
- Design-move tags: [Card primitive: HIGH] (exact `.card` shell instance) ·
  [accent restraint: MEDIUM] (3 accent touches co-located in one card, worth a visual gut-check
  across presets before calling it settled) · [empty/loading/error polish: HIGH confidence
  it's structurally solid] (all 3 states present, consistently styled with `.emptySm`/`.eyebrow`)
- Issues found (severity): none blocking
- Redesign status: TODO

---

## FocusCard (`webapp/src/views/dashboard/FocusCard.tsx`)

- Route: subcomponent of DashboardView, second card (top-right of grid)
- Related files: `dashboard.module.css` (`.card`, `.focusCard`, `.statNumberLeft`,
  `.focusPresets`, `.focusPresetBtn`, `.fullWidthBtn`), `analytics.ts` (`formatFocusTime`,
  `localTotals`, `remoteTotals`), `useLocalSessions.ts`, `components/Button.tsx`
- Screenshots: populated in `-light`/`-dark`/`-dark-cyberpunk`; zeroed-but-present in
  `-dark-empty-onboarding` ("0m total"/"0m logged today" — note this card has **no dedicated
  empty state**, it just renders zeros, unlike every other card in the batch); the loading
  screenshot (`-dark-loading`) is the most interesting one for this card — it already shows
  "1h 5m total" while NextExamCard/StreakCard are still Skeletons, because `localTotals()` paints
  synchronously from `localStorage` before the Supabase query for `remoteTotals()` resolves
  (confirmed live: the number is present and correct at first paint, no flash-of-empty).
- Header: `.eyebrow` "FOCUS" label, not an `<h1>`/PageHeader
- Card usage: `.card .focusCard` — second exact `.card`-shell instance
- Spacing: `.focusPresets` `gap: var(--s-2)` / `margin-top: var(--s-4)` (lines 224-226, on-scale);
  `.focusPresetBtn` `padding: var(--s-2) 0` (line 230, on-scale); `.fullWidthBtn`
  `margin-top: var(--s-4)` (line 254, on-scale). This card's own CSS is fully on-scale — no
  hardcoded px here (the off-scale values in this file live in other cards).
- Accent usage: `.statNumberLeft` (the "2h" total) `color: var(--accent-text)` (line 209);
  `.focusPresetBtn:hover/:focus-visible` swaps to `var(--accent-soft)` background +
  `var(--accent-text)` text + `var(--accent)` border (lines 245-250) — a good `:focus-visible`
  pairing, not hover-only.
- Distinctive/preserve: none flagged
- Accessibility: preset buttons are wrapped in `role="group" aria-label="Quick-start a focus
  session"` (FocusCard.tsx:66-68) — a nice touch, and `:focus-visible` is styled explicitly
  (not just `:hover`, dashboard.module.css:245-246).
- Responsive: none component-specific
- Test file: `DashboardView.test.tsx`, "Focus card" describe block (lines 174-252) — role/text
  queries throughout (`getByRole("heading", {name: /total/})`, `getByRole("button", {name:
  "45m"})`), no `.closest()`. Good coverage: reconciled-total, local-paint-first, preset-start,
  and the running-timer confirm-dialog interrupt are all exercised.
- Design-move tags: [Card primitive: HIGH] (exact `.card` shell instance) ·
  [spacing-scale conformance: this card is a clean/positive example — 0 violations] ·
  [accent restraint: LOW/fine] (single accent touch, well-justified as the card's headline stat)
- Issues found (severity):
  - **Low — no explicit empty state.** Every sibling card (NextExamCard, StreakCard,
    SessionHistoryCard, TasksCard via DashboardTasksWidget) has a written empty-state message.
    FocusCard has none — a brand-new account just sees "0m total / 0m logged today" with no
    framing copy, confirmed in `DashboardView-dark-empty-onboarding.png`. Minor inconsistency
    worth a one-line copy addition if empty-state polish becomes an approved move.
- Redesign status: TODO

---

## StreakCard (`webapp/src/views/dashboard/StreakCard.tsx`)

- Route: subcomponent of DashboardView, third card (bottom-left of grid)
- Related files: `dashboard.module.css` (`.card`, `.streakCard`, `.statNumber`, `.streakBars`,
  `.streakBarCol`, `.streakBar`, `.folderBreakdown`, `.folderRow`, `.folderDot`),
  `analytics.ts` (`computeStreak`, `computeSparkline`, `computeFolderBreakdown`)
- Screenshots: populated (streak=3, sparkline, 2-folder breakdown) in `-light`/`-dark`/
  `-dark-cyberpunk`; explicit empty state ("Start your first streak today…") in
  `-dark-empty-onboarding`; Skeleton loading state in `-dark-loading`
- Header: `.eyebrow` "STREAK" label
- Card usage: `.card .streakCard` — third exact `.card`-shell instance (the 3rd of 3 in
  `dashboard.module.css`)
- Spacing: `.streakBars` `gap: var(--s-2)` / `margin-top: var(--s-4)` (lines 356-358, on-scale);
  `.folderBreakdown` `gap: var(--s-2)` / `margin-top: var(--s-4)` (lines 386-387, on-scale);
  `.folderDot` `width: 8px; height: 8px` (lines 399-400) — a fixed icon-size, not spacing, so
  off-scale-ness here is a non-issue (it's a deliberate small dot, not a padding/margin value).
- Accent usage: `.statNumber` (streak count) `color: var(--accent-text)` (line 96, shared rule
  with other cards); `.streakBar` (the sparkline bars themselves) `background: var(--accent)`
  (line 374). In the cyberpunk screenshot the sparkline bars render solid hot pink — reads as
  a deliberate, legible data-viz choice, not noise.
- Distinctive/preserve: none flagged specific to this card (the folder-color dots use each
  folder's *own* stored color, `row.color` inline style, `StreakCard.tsx:90` — not accent-driven,
  correctly so, since folder identity needs to stay stable regardless of theme).
- Accessibility: loading `aria-busy="true"` + labeled Skeleton (line 30); error `role="alert"`
  (line 40); each sparkline bar has a `title` tooltip with the formatted minutes (line 71) — a
  nice touch for a purely visual bar-height encoding, though a `title` attribute alone isn't
  reachable by keyboard/screen-reader in the same way `aria-label` would be; minor accessibility
  gap, not severe (the streak number and days are already announced elsewhere on the card).
- Responsive: none component-specific
- Test file: `DashboardView.test.tsx`, "Streak card" describe block (lines 254-276). **Uses
  `.closest("div")`** at line 263: `screen.getByText("Streak").closest("div")!`. This walks up
  from the `.eyebrow` span to its nearest ancestor `<div>` — with the current markup that's
  reliably the `.card.streakCard` wrapper because `.eyebrow` is a direct child `<span>` of the
  card `<div>`, but a Card-primitive extraction that introduces an extra wrapping `<div>` (e.g.
  a `<Card><CardBody>` split) would change which `<div>` `.closest("div")` resolves to and could
  silently break or accidentally-pass this assertion. **Flag for Phase 4**: either fix this test
  to query by role/testid before the primitive swap, or make sure the primitive's DOM keeps
  `.eyebrow` as a direct child of the outermost card `<div>`.
- Design-move tags: [Card primitive: HIGH] (exact `.card` shell instance) ·
  [spacing-scale conformance: clean] · [accent restraint: LOW/fine]
- Issues found (severity): none blocking; see test-safety flag above (relevant to Phase 4 planning,
  not a visual bug)
- Redesign status: TODO

---

## TasksCard (`webapp/src/views/dashboard/TasksCard.tsx`)

- Route: subcomponent of DashboardView, fourth card (bottom-right of grid)
- Related files: `dashboard.module.css` (`.card`, `.tasksCard`, `.cardHead`, `.srsDue`,
  `.srsDueLabel`), `views/tasks/DashboardTasksWidget.tsx` (imported, **not** part of this batch —
  belongs to the `tasks` batch; only its dashboard-facing wrapper is audited here per the ledger's
  "don't touch other batches" rule), `lib/notifications.ts`, `hooks/useFlashcardsDueCount.ts`
- Screenshots: populated (2 tasks, no due-cards banner) in `-light`/`-dark`/`-dark-cyberpunk`;
  empty state ("No tasks yet…", rendered by `DashboardTasksWidget`, out of this batch's scope but
  visible) in `-dark-empty-onboarding`
- Header: `.cardHead` — a `.eyebrow` + `.link` pair in a flex row (`justify-content:
  space-between`, dashboard.module.css:67-72), a card-internal variant of the eyebrow pattern
  seen elsewhere, with a "View all →" action tacked on. This is the one card in the batch that
  already puts a small action next to its label — worth noting as a precedent if design-move #5
  (header action-affordance) gets picked up at the page level too.
- Card usage: `.card .tasksCard` — this card's `.tasksCard` modifier only changes `gap: var(--s-2)`
  (line 260) from the base `.card`; still counts as one of the exact-shell family.
- Spacing: `.srsDue` `padding: 10px 12px` (line 268) — both values off-scale (nearest: `--s-2`=8/
  `--s-3`=12 respectively; 12px matches `--s-3` exactly but is hardcoded, 10px doesn't match
  anything). `.srsDueLabel` `gap: 6px` (line 278) — off-scale, nearest `--s-1`=4 or `--s-2`=8.
- Accent usage: `.srsDue` background `var(--accent-soft)` (line 271) — the due-flashcards banner
  is accent-tinted; not visible in the captured screenshots (dueCount was 0 in the populated
  fixture) — worth a follow-up screenshot with `dueCount > 0` before sign-off since it's a
  distinct visual state not yet captured.
- Distinctive/preserve: the once-per-day SRS due-cards browser notification
  (`notifyDueCardsOncePerDay`, TasksCard.tsx:30-34) — functional, not visual, no redesign impact.
- Accessibility: `Icon name="layers"` next to the due-count text is decorative-adjacent (no
  `aria-hidden` set on it directly, unlike CommandBar's icon) — minor inconsistency, low severity.
- Responsive: none component-specific
- Test file: `DashboardView.test.tsx`, "Tasks card" describe block (lines 278-309) — role/text
  queries only, no `.closest()`.
- Design-move tags: [Card primitive: HIGH] (`.tasksCard` shell) ·
  [header action-affordance: MEDIUM] (`.cardHead`'s label+link pattern is the closest existing
  precedent for a header-with-action, worth reusing rather than inventing a new shape) ·
  [spacing-scale conformance: 2 off-scale values in `.srsDue`/`.srsDueLabel`]
- Issues found (severity):
  - **Low — `.srsDue` (due-flashcards banner) not captured in any screenshot.** Fixtures used
    `dueCount: 0` for the populated screenshots; the banner (`.srsDue`, accent-tinted, line
    263-274) was never visually confirmed. Source reading says it should look consistent with
    the rest of the card (`--r-md` radius, `--fs-sm` text) but this should get an actual capture
    before Phase 5 sign-off.
- Redesign status: TODO

---

## AIActionsCard (`webapp/src/views/dashboard/AIActionsCard.tsx`)

- Route: subcomponent of DashboardView, fifth card (sits below Next Exam / Streak in the left,
  wider grid column, since the grid is `1.35fr 1fr` — confirmed in the live render)
- Related files: `dashboard.module.css` (`.card`/`.aiCard`, `.aiActions`, `.aiBtn`, `.aiIcon`,
  `.weakTopics`, `.weakTopicPill`)
- Screenshots: populated (4 action buttons + 2 weak-topic pills) in `-light`/`-dark`/
  `-dark-cyberpunk`; weak-topics row absent (conditionally rendered, `AIActionsCard.tsx:138`) in
  `-dark-empty-onboarding` since fixtures were emptied
- Header: `.eyebrow` "ASK LEARNORA AI" + `.sub` description line, no PageHeader
- Card usage: `.card .aiCard` — `.aiCard` modifier sets `gap: 0` (line 286), otherwise the exact
  shell — 4th exact/near-exact instance of the shell within this one file's card family (see
  design-move #1 tally at the bottom of this document)
- Spacing: `.aiActions` `gap: var(--s-3)` / `margin-top: var(--s-4)` (lines 288-293, on-scale);
  `.aiBtn` `padding: 14px` (line 300) — off-scale (nearest `--s-3`=12 or `--s-4`=16, 14 is
  exactly between); `.weakTopics` `gap: var(--s-1)` / `margin-top: var(--s-4)` (lines 328-333,
  on-scale); `.weakTopicPill` `padding: 4px 10px; margin: 2px` (lines 342-343) — all three values
  off-scale except the 4px (`--s-1`, but still hardcoded rather than `var(--s-1)`); also uses a
  raw `0.75rem` for font-size (line 344) instead of the `--fs-*` token scale used everywhere else
  in this file (compare `.pill`'s `font-size: var(--fs-xs)`, line 179) — this is the one spot in
  the whole batch where a font-size token was skipped, not just a spacing one.
- Accent usage: `.aiBtn:hover` → `border-color: var(--accent-ring); background:
  var(--accent-soft)` + `transform: translateY(-1px)` (lines 316-320); `.aiIcon` `color:
  var(--accent-text)` (line 324) — icons are accent-colored even at rest, not just on hover,
  confirmed in all 3 populated screenshots (calendar/target/brain/file-text icons all render in
  the active accent color).
- Distinctive/preserve: the "Quiz me" action intentionally does *not* auto-send (drops an
  unfinished prompt into the chat composer instead, per the code comment at lines 45-50) — a
  product decision, not a visual one, no redesign impact, but worth knowing why that one button
  behaves differently if a redesign ever touches the AI-actions grid's interaction model.
- Accessibility: buttons are plain `<button type="button">` with icon + text label as children
  (no separate `aria-label` needed since the text is visible) — fine. `generate.isPending` swaps
  the "Plan my week" label to "Generating…" (line 122) with `disabled` set — good, though there's
  no `aria-busy` on the button itself during generation; minor, low severity.
- Responsive: `.aiActions` is a fixed `grid-template-columns: 1fr 1fr` (line 290) with no
  narrower-viewport override specific to this card (relies on the outer 860px single-column
  breakpoint to give it more width, but within the card itself the 2-column button grid never
  collapses to 1 column even on a narrow card) — not verified at mobile widths in the captured
  screenshots (1440px only).
- Test file: `DashboardView.test.tsx`, "AI actions card" describe block (lines 312-448) — the
  largest describe block in the file, all role/text queries, no `.closest()`. Covers: plan
  generation + navigation, chat "What next?", unsent "Quiz me" prompt, command-bar-adjacent send
  flow, regenerate-confirmation dialog, and weak-topics rendering.
- Design-move tags: [Card primitive: HIGH] (`.aiCard` shell, 4th instance) ·
  [spacing-scale conformance: MEDIUM] (3 off-scale spacing values + 1 skipped font-size token —
  the single worst offender file-wide for this move) · [accent restraint: MEDIUM] (icons
  accent-colored at rest, not just interaction-state — a stronger/more constant accent presence
  than NextExamCard's countdown-only touch)
- Issues found (severity): none blocking; see spacing-scale notes above (candidate cleanup list
  for Phase 4, not a visual bug — the clamp/off-scale values still look fine in the render, this
  is a maintainability finding, not a "looks wrong" finding)
- Redesign status: TODO

---

## OnboardingBanner (`webapp/src/views/dashboard/OnboardingBanner.tsx`)

- Route: subcomponent of DashboardView, rendered between the grid and SessionHistoryCard, only
  for a zero-data account that hasn't dismissed it (localStorage `onboarding_dismissed`)
- Related files: `dashboard.module.css` (`.onboardingBanner`, `.onboardingHead`, `.dismissBtn`,
  `.onboardingActions`), `components/Button.tsx`, `components/Icon.tsx`
- Screenshots: visible only in `DashboardView-dark-empty-onboarding.png` (the other 4 screenshots
  use populated fixtures, which correctly suppress it — confirmed the suppression logic works
  live, not just in source)
- Header: no PageHeader; uses a plain `<h3>👋 Welcome to Learnora!</h3>` (line 46) inside
  `.onboardingHead`, a two-column flex (title+copy vs. dismiss button)
- Card usage: `.onboardingBanner` (lines 411-420) is a **byte-for-byte duplicate** of the 6-line
  glass-shell block used by `.card` and `.historyCard`, just with different padding
  (`20px 24px` vs. `.card`'s `clamp(20px, 3vw, 28px)`) — this is the clearest, most literal piece
  of evidence in the whole batch for design-move #1: three declarations (`.card`, `.historyCard`,
  `.onboardingBanner`) all write out
  `background: var(--glass-bg); backdrop-filter: blur(var(--glass-blur))
  var(--glass-saturate); -webkit-backdrop-filter: ...; border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); box-shadow: var(--glass-inner), var(--glass-inner-bottom),
  var(--shadow-md);` verbatim (dashboard.module.css lines 43-48, 464-469, 414-419).
- Spacing: `padding: 20px 24px` (line 412) — both values are individually on-scale
  (`--s-5`=20, `--s-6`=24) but hardcoded rather than `var(--s-5) var(--s-6)` — textbook
  design-move #3 case (individually-valid values that should still be tokenized).
  `margin-bottom: var(--s-6)` (line 413, on-scale, tokenized correctly). `.onboardingHead`
  `gap: var(--s-4)` (line 426, on-scale). `.onboardingActions` `gap: var(--s-3)` /
  `margin-top: var(--s-4)` (lines 456-458, on-scale).
- Accent usage: `.dismissBtn:hover` → `background: var(--accent-soft); color:
  var(--accent-text); border-color: var(--accent-ring)` (lines 449-452) — hover-only, restrained.
- Distinctive/preserve: none flagged
- Accessibility: dismiss button has `aria-label="Dismiss"` (OnboardingBanner.tsx:55); the two
  action buttons ("Create study material" / "Add a task") have visible text labels plus
  decorative icons — good.
- Responsive: `.onboardingHead` is `flex` with `justify-content: space-between` and no explicit
  breakpoint — at narrow widths the title block and the 42px dismiss button will start competing
  for space (not verified beyond 1440px in the captures).
- Test file: `DashboardView.test.tsx`, "Onboarding banner" describe block (lines 451-511) —
  role/text queries throughout, no `.closest()`.
- Design-move tags: [Card primitive: HIGH — best evidence in batch] (exact byte-for-byte shell
  duplication) · [spacing-scale conformance: HIGH — best evidence in batch] (on-scale values,
  hardcoded instead of tokenized, the cleanest example of "why bother" for this move)
- Issues found (severity): none blocking
- Redesign status: TODO

---

## SessionHistoryCard (`webapp/src/views/dashboard/SessionHistoryCard.tsx`)

- Route: subcomponent of DashboardView, rendered last (below OnboardingBanner, above CommandBar)
- Related files: `dashboard.module.css` (`.historyCard`, `.logList`, `.logItem`, `.logMinutes`,
  `.logTimestamp`), `useLocalSessions.ts`, `analytics.ts` (`formatFocusTime`)
- Screenshots: populated (2 log rows) in `-light`/`-dark`/`-dark-cyberpunk`; empty state ("No
  sessions yet…") in `-dark-empty-onboarding`
- Header: plain `<h2>{t("header_history")}</h2>` (line 16) — "Recent focus sessions" — styled at
  `.historyCard h2` (dashboard.module.css:473-478: `font-family: var(--font-head); font-size:
  var(--fs-lg); font-weight: 700`), a *smaller* heading treatment than the page's own `<h1>`
  (`--fs-2xl`) — correctly scaled as a card-level heading, not a second page header.
- Card usage: `.historyCard` (lines 463-471) — the **third** byte-for-byte duplicate of the
  6-line glass-shell block (see OnboardingBanner entry above for the exact text). Additionally,
  `.logItem` (lines 486-501, each individual row in the list) is a **near-duplicate fourth
  instance**: same `background: var(--glass-bg)` / `border: 1px solid var(--glass-border)` /
  `box-shadow: var(--glass-inner), ...` pattern, but with two drifts from the canonical block:
  (1) `border-radius: var(--r-lg)` instead of `--r-xl` (a smaller radius, appropriate for a
  smaller element — probably intentional), and (2) `backdrop-filter: blur(16px)` /
  `-webkit-backdrop-filter: blur(16px)` (lines 495-496) — **hardcoded `16px` instead of
  `var(--glass-blur)`**, unlike every other glass surface in this batch. If `--glass-blur`'s
  value is ever changed as part of the token pass, this one row-level surface will silently stop
  matching every card around it. Concrete, fixable drift — good evidence that manual duplication
  has *already* started diverging, strengthening the case for a Card primitive with a
  variant/size prop rather than continued hand-copying.
- Spacing: `.logList` `margin: var(--s-4) 0 0` (line 483, on-scale); `.logItem` `padding: 16px
  20px` (line 492) — both values individually on-scale (`--s-4`=16, `--s-5`=20) but hardcoded,
  same pattern as OnboardingBanner; `gap: var(--s-3)` (line 490, on-scale, correctly tokenized);
  `margin-bottom: var(--s-3)` (line 493, on-scale, correctly tokenized). So this one selector
  mixes tokenized and hardcoded-but-on-scale values in the same declaration block — the clearest
  single-selector illustration of design-move #3's inconsistency.
- Accent usage: `.logMinutes` (e.g. "40m Focus") `color: var(--accent-text)` (line 504) — one
  touch per row, restrained even with several rows visible.
- Distinctive/preserve: none flagged
- Accessibility: empty state is a plain `<li>` with descriptive text (line 20-22) rather than a
  dedicated `EmptyState` component (worth checking whether `components/` has a shared
  `EmptyState` this could adopt — flagged for the `components` batch, not actionable here).
- Responsive: `.logItem` has `flex-wrap: wrap` (line 491) so the timestamp wraps under the label
  on narrow widths rather than overflowing — good, confirmed sensible even without a live narrow
  capture.
- Test file: `DashboardView.test.tsx`, "Recent focus sessions" describe block (lines 514-560).
  **Uses `.closest("div")`** at line 528: `screen.getByText("Recent focus sessions").closest
  ("div")!`. Same risk profile as StreakCard's — walks from the `<h2>` text up to the nearest
  ancestor `<div>`, currently `.historyCard` itself since the `<h2>` is a direct child. A Card
  primitive that wraps children in an extra `<div>` (e.g. `<Card><CardHeader>` internals) would
  change what this resolves to. **Second and last `.closest()` instance in this batch's test
  file** — combined with StreakCard's, that's the full set the ledger's ground rules warned about.
- Design-move tags: [Card primitive: HIGH — best evidence in batch, plus the `.logItem` drift is
  a concrete argument for a primitive *now* before more drift accumulates] ·
  [spacing-scale conformance: HIGH — clearest single-selector example of the inconsistency]
- Issues found (severity):
  - **Low/maintainability — `.logItem`'s hardcoded `blur(16px)` vs. `var(--glass-blur)`
    elsewhere.** Silent drift risk if the token value changes later.
- Redesign status: TODO

---

## Design-move tally for this batch (feeds DESIGN_MOVES.md's "Evidence batches" fields)

1. **Card primitive** — Confidence: **HIGH**, confirmed. Exact 6-line glass-shell block appears
   verbatim 3x (`.card`, `.historyCard`, `.onboardingBanner`) plus a drifted 4th instance
   (`.logItem`, wrong blur source) all within `dashboard.module.css` alone. `.card` itself is then
   reused by 5 of the 6 grid/standalone cards (Next Exam, Focus, Streak, Tasks, AI Actions).
   CommandBar is a deliberate non-member (different shape, preserve). This is the single
   strongest batch in the audit so far for this move.
2. **PageHeader primitive** — Confidence: **HIGH**, one clean canonical instance
   (`DashboardView`'s `.pageHeader` + `<h1>`), title-only, no actions slot present or obviously
   missing.
3. **Spacing-scale conformance** — Confidence: **MEDIUM-HIGH**. Counted 9 hardcoded-px
   declarations across `dashboard.module.css` + `commandBar.module.css`: `.card`/`.historyCard`
   padding (`clamp(20px,3vw,28px)`), `.pill` (`3px 10px`), `.srsDue` (`10px 12px`),
   `.aiBtn` (`14px`), `.weakTopicPill` (`4px 10px`), `.onboardingBanner` (`20px 24px`),
   `.logItem` (`16px 20px`), plus CommandBar's `bottom: 28px` / `gap: 12px` / `padding: 10px
   18px` / `.input padding: 6px 0`. Of these, several (`onboardingBanner`, `.logItem`'s
   padding) are individually on-scale values that were simply never tokenized — cheap, safe
   fixes. Others (`.srsDue`, `.pill`, `.weakTopicPill`, most of CommandBar) are genuinely
   off-scale and need a judgment call (snap to nearest token vs. keep as documented
   micro-adjustment).
4. **Accent restraint** — Confidence: **MEDIUM** (upgraded from the design doc's starting
   "LOW/exploratory" based on this batch). Counted ~15 distinct accent-colored touches across the
   full dashboard (stat numbers x3, countdown, 2 link states, 2 button hover states, streak bar,
   srsDue background, dismissBtn hover x1, logMinutes, examCard gradient wash, CommandBar icon +
   button + 2 glow states, AIActionsCard icons at rest). None look bad in isolation (checked in
   both default-teal and cyberpunk-pink live renders), but the *density* — especially
   CommandBar's always-on glow plus AIActionsCard's at-rest-colored icons plus NextExamCard's
   triple accent stack (countdown + link + gradient wash) — is worth a deliberate design
   decision rather than continued organic growth as more views get audited.
5. **Header action-affordance** — Confidence: **LOW**, as scoped. DashboardView's own
   PageHeader has no obvious missing action. TasksCard's `.cardHead` (eyebrow + "View all →"
   link) is the batch's best existing precedent for what a header-with-action could look like if
   this move gets picked up elsewhere.
6. **Empty/loading/error polish** — Confidence: structurally **HIGH** (NextExamCard and
   StreakCard both implement all 3 non-happy-path states with consistent `.emptySm`/`aria-busy`/
   `role="alert"` treatment; OnboardingBanner and SessionHistoryCard's empty states read fine).
   One inconsistency found: **FocusCard has no explicit empty-state copy** (just renders zeros).
   Visual quality (not just presence) was checked directly in the `-dark-empty-onboarding` and
   `-dark-loading` screenshots and reads calm/consistent, not broken.

## Test-safety flags for Phase 4 (Card/PageHeader primitive migration)

Two `.closest("div")` calls found in `DashboardView.test.tsx`, both walking from a text node up
to the nearest ancestor `<div>`:
- Line 263 (StreakCard): `screen.getByText("Streak").closest("div")!`
- Line 528 (SessionHistoryCard): `screen.getByText("Recent focus sessions").closest("div")!`

Both currently resolve correctly because the text node's parent is a direct child of the
outermost card `<div>`. Any Card-primitive implementation that introduces an intermediate
wrapper `<div>` (e.g. a `<CardBody>` or padding wrapper) between the card's own subcomponents
and the text being queried will silently change what these two assertions target — they will not
necessarily fail loudly, they may just start asserting against the wrong, wrongly-scoped element.
**Recommendation for Phase 4**: rewrite both to `getByRole`/`getByTestId` scoping before or as
part of the primitive swap, don't rely on the current DOM depth surviving it.

**Sharper version of this constraint from the parallel source-only audit, worth stating
explicitly: `<Card>` must render a `div` as its root element, full stop — no polymorphic
`as`/`component` prop.** Line 528's `.closest("div")` climbs from the `<h2>` and then calls
`within(history).getByRole("listitem")` (singular). If `<Card>` ever rendered `section`/
`article` instead of `div`, the climb would miss the card entirely and land on `main.view`, at
which point `getByRole("listitem")` matches *every* list on the page and throws — a hard
failure, not a silent one like line 263's. An extra *inner* wrapper div is survivable; a
non-div root is not.

Also worth noting from that same pass: `OnboardingBanner`'s `.dismissBtn`
(dashboard.module.css:433-447) is a 42px icon button that re-declares the glass bg/border/
inner-shadow shell on its own — a third near-copy of the same "glass icon button" shape found
independently in the exams and library batches (design-move #7, icon-button primitive).
