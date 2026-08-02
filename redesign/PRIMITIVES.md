# Card / PageHeader Primitives

Status: CONTRACT ONLY — not yet built. Built in Phase 4, after Phase 3 design-move sign-off.

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
  variant?: "default" | "flat" | "subtle"; // default: --r-xl glass shell; flat: no shadow
                                             // (toolbars/nested surfaces); subtle: --surface-2,
                                             // no blur (inactive/empty cells)
  padding?: "none" | "sm" | "md" | "lg";
  radius?: "lg" | "xl";
}
```

Only add compound subcomponents (`Card.Eyebrow`, `Card.Head`, etc.) if audit evidence shows the
exact same inner shape repeating verbatim in 3+ batches — do not build speculatively.

## PageHeader

```tsx
interface PageHeaderProps {
  title: string;
  eyebrow?: string;    // unused by any current view; cheap to support if move #6 wants it later
  actions?: ReactNode; // right-aligned slot; no current view uses this yet
  className?: string;  // escape hatch for one-off spacing overrides during migration
}
```

Must render the exact current DOM shape (`<div className={pageHeader}><h1>{title}</h1></div>`,
`actions` appended as a sibling only when passed) so existing `getByRole("heading", ...)`
queries are unaffected.

## Migration strategy (build → prove → roll out, test-safe by construction)

1. Build both primitives targeting **zero visual delta** vs. Phase 2's Dashboard screenshots.
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

## Build status

Not started.
