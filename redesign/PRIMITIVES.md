# Card / PageHeader Primitives

Status: APPROVED, BUILDING NOW (Phase 4, started 2026-08-03). Phase 3 signed off both the
contract below and the PageHeader decision (see PageHeader section).

**Revised 2026-08-02 against Phase 2 audit evidence.** The variant names below changed: the
pre-audit guess was `default | flat | subtle`, but the codebase's actual split is two elevation
tiers used consistently (see `DESIGN_MOVES.md` move #1 for the declaration counts). Sections
marked "audit says" record what the evidence forced; everything else is unchanged.

## Location

`webapp/src/components/Card.tsx` + `Card.module.css`
`webapp/src/components/PageHeader.tsx` + `PageHeader.module.css`

Same flat convention as existing `Button.tsx`/`EmptyState.tsx`. Add `Card.test.tsx` /
`PageHeader.test.tsx` (or extend an existing shared-primitives test file if one exists).

## Card

Shell-only, not a compound header/body/footer API. Observed variance across views (dashboard's
cardHead+link, library's hover-reveal actions, notes' `overflow:hidden` requirement for Quill,
exams' `--r-lg` vs dashboard's `--r-xl` radius) is too wide to prescribe a rigid API without
more evidence. Views keep composing their own internal children exactly as today, just inside
`<Card>` instead of `<div className={styles.card}>` — this is what keeps JSX child structure
(and therefore `.closest()`-based test queries) unchanged during migration.

```tsx
interface CardProps extends ComponentPropsWithRef<"div"> {
  variant?: "panel" | "elevated" | "row" | "subtle";
  // panel    (DEFAULT): --r-lg + box-shadow: --glass-inner, --shadow-sm.  23 declarations.
  // elevated:           --r-xl + --glass-inner, --glass-inner-bottom, --shadow-md.  6.
  // row:                list row — --r-lg, --glass-inner + --shadow-sm, blur 16px.  2 verbatim
  //                     copies (tasks.taskItem, dashboard.logItem).
  // subtle:             --surface-2 / --glass-bg + --glass-border-subtle, no blur, no shadow.
  padding?: "none" | "sm" | "md" | "lg";
  radius?: "lg" | "xl";
  hoverElevation?: boolean; // four hand-rolled implementations today, three different targets
}
```

**Audit says — `panel` is the default, not `elevated`.** The pre-audit assumption was that
dashboard's `--r-xl`/`--shadow-md` shell was the norm. It is not: that recipe appears 6 times
(dashboard ×3, library ×2, settings ×1) against 23 for the `--r-lg`/`--shadow-sm` recipe across
10 modules. Defaulting to `elevated` would mean passing an explicit variant at four call sites
out of five.

**Audit says — `hoverElevation` is real and currently inconsistent.** `Button.secondary`,
`Header.iconBtn` and `settings.card` all escalate to `--shadow-md`; `library.card` escalates to
`--shadow-lg`. Pick one scale in the primitive rather than preserving the discrepancy.

**Audit says — two one-off hybrids exist and should stay one-offs.** `settings.card`
(inner-bottom + `--r-lg` + `--shadow-sm`) and `notes.editorPane` (inner-bottom + `--shadow-sm`).
Neither justifies a fifth variant; give them a `className` override at the call site.

**Audit says — the floating tier is out of scope for `Card`.** Modal, MiniTimer, CommandBar and
chat's panel share a `--shadow-lg` fixed-position recipe, but they are positioned surfaces with
their own z-index and sizing concerns. Do not fold them in.

Only add compound subcomponents (`Card.Eyebrow`, `Card.Head`, etc.) if audit evidence shows the
exact same inner shape repeating verbatim in 3+ batches — do not build speculatively.
**Audit result: no inner shape met that bar.** Dashboard's `.eyebrow` + `.cardHead` + `.link`
trio is the closest, and it is confined to one batch. Build shell-only, as planned.

## PageHeader

**Decision made 2026-08-03 (see DESIGN_MOVES.md move #2): drop the duplicate h1s.** The shell's
`Header.tsx` `.title` element (currently a `<p>`) becomes the page's real `<h1>`. Dashboard,
Tasks, Exams, Timer, and Settings lose their `.pageHeader`/`<h1>` block entirely — they do
**not** get a `<PageHeader>` in its place, the shell now covers that role. `<PageHeader>` gets
built only for views that show something the shell cannot: Library (subtitle + actions — already
has this shape hand-rolled, see move #5). Notes' sticky toolbar is its own thing, not migrated to
this primitive.

**Correction found during Phase 6/Review — Review is NOT a second consumer, contrary to this
section's original plan.** The reasoning above assumed Review's `.header` `<h1>{deckTitle}</h1>`
duplicated the shell's own heading the same way Library's did. It does not: `sectionLabel.ts`
returns the generic `"Library"` for every `isLibrarySection` route (`/library`, `/notes/:id`,
`/quiz/:id`, `/review/:deckId`) — the shell's `<h1>` on `/review/:deckId` literally says
"Library", not the deck's name. Review's own `<h1>` is the page's *only* heading that names what
the student is actually reviewing; migrating it through `<PageHeader>` (whose `title` renders as
a `<p>`, per the correction below) would silently delete that heading rather than fix a
duplicate. This is the same pattern already recorded for Quiz's in-panel heading — see "Do not
migrate these headers" below, which now includes `review` alongside `quiz` for the identical
reason. No code changed for this batch; see PRIMITIVES.md's Build status and the ledger's review
footnote.

```tsx
interface PageHeaderProps {
  title: string;
  sub?: ReactNode;     // AUDIT-DRIVEN ADDITION — two views independently built one
                       // (library.headerSub, review.progress), as does the shell Header.
  eyebrow?: string;    // unused by any current view; cheap to support if move #6 wants it later
  actions?: ReactNode; // right-aligned slot
  className?: string;  // escape hatch for one-off spacing overrides during migration
}
```

**Audit says — `actions` already exists in the codebase.** `library.module.css:23-44` +
`LibraryView.tsx:78-84` is a `justify-content: space-between` header with a right-hand action
slot. It is a proven pattern to generalise, not a speculative slot (see move #5).

**Audit says — `eyebrow` has zero call sites; `sub` has three.** The contract had these
backwards. Keep `eyebrow` if it is free, but `sub` is the one the codebase is asking for.

Must render the exact current DOM shape (`<div className={pageHeader}><h1>{title}</h1></div>`,
`actions` appended as a sibling only when passed) so existing `getByRole("heading", ...)`
queries are unaffected.

**Do not migrate these headers** — audited and confirmed deliberate, each for its own reason:
`notes` (sticky editor toolbar), `quiz` and `review` (heading inside the panel/section — the
shell's own `<h1>` on these routes is the generic "Library" label, so the view's own heading is
not a duplicate and must stay a real `<h1>`), `terms` and `auth` (rendered outside `AppShell`,
so they supply their own page chrome).

## Migration strategy (build → prove → roll out, test-safe by construction)

1. Build both primitives targeting **zero visual delta**. Before-shots for Dashboard/Notes/Exams
   already exist (`redesign/screenshots/`, captured live during Phase 2) — reuse those rather
   than recapturing; only `terms`/`auth`/the other 12 batches need a first capture, done as each
   is touched rather than all up front.
2. Prove on **Dashboard**: (a) swap `dashboard.module.css`'s `.card`/`.historyCard`/
   `.onboardingBanner` usages for `<Card>`, keeping every internal child JSX identical; (b)
   **drop** `dashboard.module.css`'s `.pageHeader`/`<h1>` block entirely per the move #2
   decision — Dashboard does not get a `<PageHeader>`, the shell's now-promoted `<h1>` covers
   it. Run `DashboardView.test.tsx` (confirmed to contain `.closest("div")` calls sensitive to
   wrapper depth, and `getByRole("heading", ...)` queries that must still resolve against the
   shell's `<h1>` post-move) — this is the concrete safety gate.
3. Promote `Header.tsx`'s `.title` from `<p>` to `<h1>` as part of the same change (it's the
   thing Dashboard's dropped `<h1>` is being replaced by) — one PR, not two, since removing the
   per-view h1 without the promotion would leave zero h1s on the page.
4. Only after Dashboard's tests pass green: apply to Notes (Card only — Notes keeps its own
   toolbar, not touched) and Exams (Card + drop its `.pageHeader` the same way as Dashboard's),
   each gated on its own test run before moving to the next.
5. Build `<PageHeader>` itself once Library is reached in Phase 6 (its first real consumer) —
   no flagship screen in Phase 4/5 actually uses it, per the move #2 decision.
6. Roll out to the remaining 12 batches, same per-batch loop as the audit: apply → scoped
   `npm test` → screenshot diff (light+dark) → ledger row updated to VERIFIED. Any batch whose
   tests break gets a ledger note with the exact fix needed (e.g. add/remove a wrapper level)
   rather than reworking the test to fit. Batches with a `.pageHeader` (Tasks, Timer, Settings)
   drop it the same way as Dashboard/Exams, not migrate it to `<PageHeader>`.
7. Never touch `components/chat/*` or `components/create/*` internals unless the audit
   specifically flags card-shell duplication inside them.
   **Audit result: the `create/` condition is met** — `create/MaterialPanel.module.css`
   re-declares a card shell rather than composing one (2 glass shells, 12 accent refs). This
   unlocks the exception; it does not oblige anyone to use it. `components/chat/*` remains
   fully out of scope.

## Test-safety constraints (Phase 2 audit — treat as non-negotiable)

Gathered from every test file in the app. These are the exact places where a class-name or
wrapper change breaks a test:

| Constraint | Source | Why |
|---|---|---|
| `<Card>` must be able to render a **`div`** root — `as` may only add `"section"`, never `button`/`li` | `DashboardView.test.tsx:263,528` | `:528` climbs `.closest("div")` from an `h2` then calls `getByRole("listitem")` (singular). Any call site without an explicit `as="section"` must stay a div, or the climb reaches `main` and matches every list on the page. (Extended 2026-08-03 for Settings — see Build status.) |
| Per-section wrappers must stay **`<section>`** | `SubjectDetailPage.test.tsx:100` | It is the `within()` root for the whole file. |
| Choice rows and list rows must stay **`<li>`** | `QuizReview.test.tsx:83`, `LibraryView.test.tsx:261,264,533,541` | Same — `within()` roots. A `<Card>` *inside* the `<li>` is fine. |
| Form controls must stay wrapped in **`<label>`** | `create/MaterialPanel.test.tsx:80` | `.closest("label")`. |
| Flashcard faces must be the nearest **`aria-hidden`** ancestor | `ReviewView.test.tsx:141,144` | Do not add an `aria-hidden` wrapper between the text and `.face`. |
| MiniTimer dock must keep **`role="status"`** | `TimerView.test.tsx:526` | Scoped past the toast container, which shares the role. |
| Sidebar collapsed class must keep the substring **`collapsed`** | `AppShell.test.tsx:237,242,247,264,267` | The only literal class-name match in the app (`toMatch(/collapsed/)`). A *rename* breaks it; a swap does not. |
| Difficulty / urgency / today modifiers must keep producing **distinct class strings** | `ExamsView.test.tsx:103,191,211`, `TasksView.test.tsx:331` | Differential assertions (`not.toEqual`, `new Set().size === 3`). Collapsing the modifiers into one class driven by a custom property breaks them. |

Everything else queries by role, text or attribute and is unaffected by class-name swaps.
There are **no snapshot tests** in the app.

## Build status

**Done, 2026-08-03.** `Card.tsx`/`Card.module.css` built (`webapp/src/components/`), with
tests in `primitives.test.tsx`. Applied to all of Dashboard's card instances (`.card`,
`.historyCard`, `.onboardingBanner` → `<Card variant="elevated">`).

**Move #2 (PageHeader/duplicate-h1) also completed in the same change** — turned out to be
inseparable from the Dashboard proof: `Header.tsx`'s `.title` is global, so promoting it to
`<h1>` without also dropping every other view's own competing `<h1>` would have created new
literal-duplicate headings on routes this pass didn't touch. Discovered via `routes.test.tsx`
(`getMultipleElementsFoundError`) after the Dashboard-only version passed its own tests but
broke the app-wide table. Fixed by dropping the per-view `<h1>` on all 5 originally-scoped
routes (Dashboard, Tasks, Exams, Timer, Settings) plus two the audit hadn't separately flagged
but which turned out to have the identical bug once tested against the real shell: Library's
top-level `/library` route and `/plan` (`t("header_plan")` literally matches `sectionLabel.ts`'s
hardcoded string for that route). Both keep their title as **styled text, not a heading** — the
shell's `<h1>` is now the page's only one; a real `<PageHeader>` component (with Library's
subtitle+actions slot) is still Phase 6 work, this pass only removed the duplicate.
Subject/notes/quiz/review pages under Library are untouched — their own headings show
genuinely different text (a folder/document/deck name), not a duplicate of the shell's label.

**Verification**: `npm test` 933/933 (927 baseline + 6 new Card tests), `tsc -b` clean,
`oxlint` clean, `prettier --check` clean. Live-rendered via Playwright against all 7 touched
routes (screenshots in `redesign/screenshots/phase4-verify/`) — confirmed exactly one `<h1>`
per route with the correct text, and Dashboard's Card-migrated surfaces render pixel-identical
to the Phase 2 baseline screenshots.

**Extended to Exams and Notes, 2026-08-03 (Phase 5)** — the other two flagship screens:
- **Exams**: `.container` → `<Card variant="panel" padding="lg">`. Clean, exact match (the
  audit's own characterization of `.container` as "panel with a radius/shadow drift" was
  right: `--r-lg` + `--glass-inner`/`--shadow-sm` **is** the panel recipe, not a drift from
  elevated). `.iconBtn`/`.cell`/`.overflowBadge`/`.empty` deliberately left CSS-only — none
  match the current variant contract cleanly (icon buttons are a separate primitive, move #7,
  not yet built; `.cell`'s 8px blur was already flagged by the audit as "looks deliberate," not
  drift to fix; `.overflowBadge`'s `--r-xs` and `.dock`-style near-pill radii don't fit the
  `lg`/`xl` radius prop without adding a case with no second instance yet to justify it).
- **Notes**: `.editorPane` → `<Card variant="elevated" padding="none">`, with a residual
  `.editorPane.editorPane` doubled-selector override for its one-off `--shadow-sm` (see the
  contract's "two one-off hybrids" note above) — doubled specificity so the override doesn't
  depend on cross-file CSS Modules injection order. `overflow: hidden` (load-bearing for
  Quill) stays in the residual class. `NotesAiSidebar`'s three surfaces (`.card`/`.chat`/
  `.dock`) deliberately NOT migrated: `.card` is a real `<button>` (Card is div-only, no
  polymorphic `as`), and `.chat`/`.dock` don't match the panel/elevated/row/subtle recipes as
  built (different background token, non-standard radius) — forcing them would mean bespoke
  per-instance overrides eroding the primitive's coherence, not a genuine fit.

**Verification (Exams + Notes)**: `npm test` 933/933, `tsc -b`/`oxlint`/`prettier --check`
clean, live-rendered via Playwright (`redesign/screenshots/phase5-verify/`) confirming exam
difficulty colour-coding and the AI sidebar render unchanged.

**Phase 6 round 1 — Tasks and Timer, 2026-08-03**:
- **Tasks**: `.inputCard` → `<Card variant="panel" padding="none" className={styles.inputCard}>`
  with a residual `padding: var(--s-5)` override (20px, off the `none`/`sm`/`md`/`lg` scale).
  `.item`/`.empty`/`.dashTask` deliberately NOT migrated: `.item` is a `<li role="checkbox">`
  inside a `<ul>` — Card is div-only, swapping would break list semantics — and `.empty`/
  `.dashTask` don't match the variant contract without ad hoc overrides (same reasoning as
  Notes' AI sidebar above).
- **Timer**: `.panel` → `<Card variant="panel" padding="lg" className={styles.panel}>`, an
  exact match, zero residual override needed.

**Verification (Tasks + Timer)**: `npm test` 933/933, `tsc -b`/`oxlint`/`prettier --check` clean.

**Phase 6 round 2 — Settings, 2026-08-03**: all 8 `.card` instances across 6 files (AccountTab
×2, DangerTab ×1, NotificationsTab ×1, PreferencesTab ×2, AppearanceTab ×1, SecurityTab ×2)
migrated to `<Card>`. On inspection every instance turned out to be a
`<section aria-labelledby="...">` landmark, not a div/section mix as the Phase 2 audit's stub
assumed — forcing them to `<div>` would have dropped the landmark role and its `aria-labelledby`
association app-wide.

**Contract change: `Card` gained a narrow `as?: "div" | "section"` prop, default `"div"`.**
This is a deliberate, scoped extension, not a reversal of the "no polymorphic `as`" constraint
in the table below — that constraint exists specifically because `DashboardView.test.tsx:528`
climbs `.closest("div")`, which only requires that *div stays available*, not that it's the only
option. `button`/`li` targets (NotesAiSidebar's `.card`, Tasks' `.item`) remain permanently
excluded — `as` is `"div" | "section"` only, by type, not a general polymorphic-component prop.
A `Card.test.tsx` case (`primitives.test.tsx`) confirms `as="section"` keeps the
`aria-labelledby` landmark: `getByRole("region", { name: ... })` resolves and the DOM tag is
`SECTION`.

Every instance mapped cleanly to `<Card as="section" variant="elevated" radius="lg" padding="lg"
aria-labelledby="...">` (`elevated` because `settings.card`'s own recipe — inner-bottom shadow +
`--r-lg` + `--shadow-sm` — is one of the two documented one-off hybrids above, and `elevated`'s
inner-bottom base needed less residual override than `panel` would have). The one-off
`--shadow-sm` (vs. `elevated`'s default `--shadow-md`) stays a residual `.card.card` doubled-
selector override in `settings.module.css`, same technique as Notes' `.editorPane`. `DangerTab`'s
`.dangerCard` modifier (red border-color only) composes unchanged via `className`.

**Verification (Settings)**: `npm test` 934/934 (933 + 1 new `as="section"` Card test), `tsc -b`/
`oxlint`/`prettier --check` clean. Live-rendered via Playwright across all 6 tabs (screenshots in
`redesign/screenshots/phase6-verify/`) — confirmed correct glass-panel styling on every section,
the Danger Zone's red left-border accent, Notifications' toggle switches, Preferences' dropdowns,
and Appearance's theme-preset grid, all pixel-matching the pre-migration render.

**Phase 6 round 3 — `<PageHeader>` built + Library, 2026-08-03.** Library was the primitive's
declared first consumer (see PageHeader section above), so it's built now rather than
speculatively earlier:

```tsx
interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
}
```

**Contract correction vs. the original spec above: `title` renders as a plain `<p>`, not an
`<h1>`.** The spec's "must render `<h1>{title}</h1>`" line predates the move #2 correction
(shell's `Header` now supplies the page's one `<h1>`; five-plus views' own `<h1>` was dropped
specifically to kill a duplicate heading). Building `PageHeader` to spec as written would have
reintroduced that exact bug on Library. `eyebrow`/`title`/`sub` all render as styled `<p>`
elements inside a wrapper div; `actions` renders as a direct sibling (not wrapped in an extra
div) so the DOM shape matches what Library's hand-rolled `.header` already had, pixel-for-pixel.

Wired into `LibraryView.tsx`, replacing its hand-rolled `.header`/`.title`/`.headerSub` (now
deleted from `library.module.css`). Also migrated `SubjectDetailPage.tsx`'s `Section` wrapper
(`.workspaceSection`) to `<Card as="section" variant="elevated" padding="md">` — exact match,
zero residual override (`padding: clamp(20px, 3vw, 28px)` **is** `padding-md`'s literal value).

**Left CSS-only, same reasoning as prior rounds**: the four `.card` grid tiles (FoldersPanel,
MaterialsPanel, FlashcardsPanel, QuizzesPanel) are all `<li>` roots — list semantics, same
exclusion as Tasks' `.item`. `.iconBtn` is move #7 (glass icon button), not yet built. `.newCard`/
`.newCardBtn` (dashed "new folder" tile) and `.dueBanner` (a `<p>`) don't match any variant
recipe. `.backLink` is an `<a>` with a separately-flagged LOW hardcoded-blur drift, unrelated to
Card. `.tabs` (the tablist container) uses `--r-md`, which isn't one of Card's `lg`/`xl` radius
options — a single-instance, low-value fit, left alone.

**Verification (Library)**: `npm test` 936/936 (934 + 2 new PageHeader tests), `tsc -b`/
`oxlint`/`prettier --check` clean. Live-rendered via Playwright (`redesign/screenshots/
phase6-verify/library.png`, `library-subject.png`) — confirmed the header/subtitle/action row
and all three workspace-section cards render identically to the pre-migration layout.

**Phase 6 round 4 — Plan, 2026-08-03.** All three `<div>`-rooted glass shells migrated to
`<Card variant="panel" padding="none">`, each with a residual `.x.x { padding: ...; }` doubled-
selector override (all three used a two-value `padding` — `var(--s-5) var(--s-6)` or a `clamp(…)
28px` pair — that doesn't match any single-value Card padding preset): `.summaryCard` (title +
Generate/Regenerate button row), `.summary` (the AI-generated week summary), `.emptyState` (the
"No plan yet" empty state). All three matched the `panel` recipe exactly otherwise (`--r-lg` +
`--glass-inner`/`--shadow-sm`), so no radius override was needed. `.dayCard` stayed CSS-only,
same `<li>`-rooted list-semantics exclusion as Tasks'/Library's row cards — its hardcoded
`blur(16px)` drift (flagged by the audit, third instance app-wide) is untouched, unrelated to
this migration. The audit's "MEDIUM — no page heading" finding was already resolved as a side
effect of Phase 4's move #2 correction (the `/plan` route was one of the two routes found to have
a duplicate `<h1>` bug beyond the five originally scoped) — Plan has had the shell's `<h1>` since
that round, so no `<PageHeader>` was added here.

**Verification (Plan)**: `npm test` 936/936, `tsc -b`/`oxlint`/`prettier --check` clean.
Live-rendered via Playwright (`redesign/screenshots/phase6-verify/plan-empty.png`,
`plan-with-data.png`) — confirmed the summary card, AI-summary panel, and empty-state card all
render identically to the pre-migration layout, both with and without a generated plan.

**Phase 6 round 5 — Quiz, 2026-08-03.** `.panel` — the shared shell for every QuizRunner/
QuizReview state (5 call sites: no-usable-questions, finished, in-progress, no-attempt-yet,
review) — migrated to `<Card variant="panel" padding="lg" className={styles.panel}>`. Exact
match on every axis (`--r-lg` + `--glass-inner`/`--shadow-sm`, padding `var(--s-6)` **is**
`padding-lg`'s literal value), so `.panel` in `quiz.module.css` shrank to just
`position: relative` (kept for layout safety; no absolutely-positioned child currently depends on
it) plus the untouched `.panel h1` descendant rule, which still applies since `.panel` stays a
real className on the Card.

`.reviewQuestion` (the per-question card inside the review list) deliberately **NOT** migrated:
it's an `<article>` root, and Card only supports `div`/`section` — extending `as` again for a
single, one-off instance (vs. Settings' 6-file/8-instance pattern that justified the `section`
addition) would be contract creep without the cross-batch evidence the primitive's build rules
require. Left CSS-only, unchanged.

**Verification (Quiz)**: `npm test` 936/936, `tsc -b`/`oxlint`/`prettier --check` clean.
Live-rendered via Playwright (`redesign/screenshots/phase6-verify/quiz-runner.png`,
`quiz-review.png`) — confirmed the host bubble, choice list, and both correct/incorrect review
states render identically to the pre-migration layout.

**Phase 6 round 6 — Review, 2026-08-03. No code migration — documentation-only round.**
Investigated Review as PageHeader's planned second consumer and found the plan itself was wrong
(see the PageHeader section's correction above): its `<h1>{deckTitle}</h1>` is not a duplicate of
the shell's heading, so migrating it would have deleted the page's one real heading. `.card`/
`.face` (the flashcard flip) were already flagged LOW confidence / do-not-migate by the Phase 2
audit — a 3D transform surface (`preserve-3d`, two `backface-visibility` faces), not a content
card, confirmed unchanged on inspection. `.header` is a plain layout wrapper (width + margin),
not a glass shell — no Card candidate there either. Net result: this batch has zero Card/
PageHeader migration work, which is itself a valid, evidence-based outcome (same class of
finding as Notes' AI sidebar or Tasks' `.item`), not a gap. The two LOW-severity hardcoded
`border-radius: 20px` literals (`:75`, `:94`, exactly equal to `--r-lg`) stay as an open,
separately-tracked token-conformance finding — same treatment as the blur-drift findings left
untouched in prior rounds, unrelated to Card/PageHeader and out of scope here.

**Phase 6 round 7 — Terms, 2026-08-03. No migration — found and fixed a stale evidence citation.**
`.header` is a standalone-document header (the route sits outside `AppShell`, so it supplies its
own page chrome) — correctly N/A for `<PageHeader>`, already documented above. `.tocBox` and
`.backBtn` were the audit's two LOW-confidence `subtle`-variant candidates; on inspection neither
is a clean fit: `.tocBox` uses `background: var(--glass-bg)` where the `subtle` variant (in
`Card.module.css`) sets `--surface-2` — a translucent-glass vs. solid-flat distinction that's
visibly different by design in both themes (see `themes.css`/`tokens.css`), not an incidental
gap. `.tocBox`'s padding (`--s-5`, 20px flat) also doesn't match any Card padding preset. Forcing
it through `subtle` would need two residual overrides on a single, LOW-confidence instance — the
same "eroding the primitive's coherence, not a genuine fit" call already made for NotesAiSidebar.
Left both CSS-only.

**Found in the process: the `subtle` variant's own doc comment miscited its evidence.** It named
three sources (`terms.tocBox`, `notesSidebar.card`, `exams.overflowBadge`); only
`notesSidebar.card` actually uses `--surface-2` — both `terms.tocBox` and `exams.overflowBadge`
use `--glass-bg` instead (and `overflowBadge` also uses `--r-xs`, not a Card radius option),
which is exactly why both were independently left CSS-only in their own rounds. Corrected the
comment in `Card.module.css` so a future session doesn't reach for `subtle` on either of those
two expecting a clean match. No test/behavior change — comment-only.

**Verification (Terms)**: comment-only change to a shared file — `tsc -b`/`oxlint`/
`prettier --check` clean; full suite not re-run since no `.tsx`/behavioral file changed.

**Phase 6 round 8 — Auth, 2026-08-03. No migration — confirmed, no code changed.** Re-verified
the audit's do-not-migrate call against current source rather than trusting it blindly (the same
check that caught Terms' stale citation last round): `.card` (`auth.module.css:48-58`) still
uses `--glass-bg-strong` (not `--glass-bg`, and not `--surface-2`), a hardcoded `blur(36px)`, and
sets no `border-radius` of its own at all — radius and outer shadow are owned by the parent
`.layout` (`--r-2xl` + `--shadow-lg` + `overflow: hidden`), a load-bearing two-part split-screen
construction. None of Card's four variants match this recipe, and the container/panel split
can't be expressed through a single `<Card>` without restructuring the layout for one call site.
`.brandHeader` is a signed-out brand lockup, correctly N/A for `<PageHeader>` (routes render
outside `AppShell`, same as Terms). No issues found — the audit called this "the most internally
consistent batch in the app," confirmed still true.

**Verification (Auth)**: no source changed; `npm test src/views/auth` 28/28 passing (unaffected,
run to confirm no drift since the Phase 2 audit).

**Not yet done**: the remaining 2 batches' Card migration (shell, components — chat stays N/A),
and the three NotesAiSidebar surfaces (part of the components/notes work).
