# Card / PageHeader Primitives

Status: CONTRACT ONLY — not yet built. Built in Phase 4, after Phase 3 design-move sign-off.

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

**BLOCKED — do not build until the move #2 decision in `DESIGN_MOVES.md` is made.** The audit
found that the app shell's `Header` already renders the section label, and the five views with
`.pageHeader` render an `<h1>` with the *same string* directly below it (identical in every
locale). Building this primitive as specified would systematise a visible double heading.
The decision — keep the per-view `<h1>`, or promote the shell header's label to `<h1>` and drop
the duplicates — determines whether this component is needed for five views or two.

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
`notes` (sticky editor toolbar), `quiz` (heading inside the panel), `terms` and `auth`
(rendered outside `AppShell`, so they supply their own page chrome).

## Migration strategy (build → prove → roll out, test-safe by construction)

1. Build both primitives targeting **zero visual delta**. Phase 2 captured no screenshots (every
   view but `terms`/`auth` is behind Supabase auth — see `DESIGN_MOVES.md` "Screenshot gap"), so
   **take the Dashboard before-shots as step 0 of Phase 4**, with a signed-in session, before
   touching any CSS. Light + dark, plus one saturated accent preset.
2. Prove on **Dashboard only**: swap `dashboard.module.css`'s `.card`/`.historyCard`/
   `.onboardingBanner`/`.pageHeader` usages for `<Card>`/`<PageHeader>`, keep every internal
   child JSX identical, run `DashboardView.test.tsx` (confirmed to contain `.closest("div")`
   calls sensitive to wrapper depth — this is the concrete safety gate).
3. Only after Dashboard's tests pass green: apply to Notes and Exams (the other two flagship
   picks), each gated on its own test run before moving to the next.
4. Roll out to the remaining 12 batches, same per-batch loop as the audit: apply → scoped
   `npm test` → screenshot diff (light+dark) → ledger row updated to VERIFIED. Any batch whose
   tests break gets a ledger note with the exact fix needed (e.g. add/remove a wrapper level)
   rather than reworking the test to fit.
5. Never touch `components/chat/*` or `components/create/*` internals unless the audit
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
| `<Card>` must render a **`div`** root — no polymorphic `as` prop | `DashboardView.test.tsx:263,528` | `:528` climbs `.closest("div")` from an `h2` then calls `getByRole("listitem")` (singular). A non-div root makes the climb reach `main` and match every list on the page. |
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

Not started.
