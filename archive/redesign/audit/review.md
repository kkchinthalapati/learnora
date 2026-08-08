# Review batch — 1 file

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see dashboard.md).
Source: `webapp/src/views/review/`
**This is the batch that owns the flashcard flip interaction** (the `quiz.md` stub misfiled it).

## ReviewView (views/review/ReviewView.tsx)

- Route: `/review/:deckId`
- Related files: `review.module.css` (~155 lines), `srs.ts`
- Header: **`.header`, not `.pageHeader`** (`ReviewView.tsx:296-302`) — an `h1.title` (the deck
  title) plus a `.progress` line ("Card 3 of 12"). Same title+sub shape as Library's `.header`,
  minus the actions slot. Second independent reinvention of a subtitle-bearing header; together
  with Library this makes the `sub` slot a requirement, not a nice-to-have, for the PageHeader
  primitive.
- Card usage: **1 glass-shell declaration** — `.card` (`review.module.css:69-83`), Recipe B
  (`--glass-inner` + `--shadow-sm`) but with **`border-radius: 20px` written as a literal**
  rather than `--r-lg` (which is exactly 20px). `.face` (`:94`) repeats the same literal.
  - Card primitive confidence: **LOW for this batch.** The flashcard is a 3D transform surface
    (`transform-style: preserve-3d`, two `backface-visibility: hidden` faces), not a content
    card. **Do not migrate `.card` here to `<Card>`** — the primitive would have to carry
    `preserve-3d` and the two-face structure, which is exactly the speculative complexity
    PRIMITIVES.md says not to build.
- Spacing: **4 hardcoded px**, values `8 16 40`. All on-scale, written as literals. Trivial swap.
- Accent usage: 2 references — the lightest in the app. Right call for a recall-testing screen.
- Distinctive/preserve:
  - **The flashcard flip is the preserve item.** `review.module.css:60-100`: `perspective:
    1000px` on `.scene`, `transform-style: preserve-3d` + a 0.6s cubic-bezier transition on
    `.card`, `backface-visibility: hidden` on `.face`, `rotateY(180deg)` on `.back`. The file
    comment (`:1-7`) notes this is the one part of the app with no CSS-module precedent.
    Any change to `.card`'s box model risks breaking the 3D context.
  - `prefers-reduced-motion` at `:151` — verify it actually neutralises the 0.6s flip and does
    not merely disable a secondary transition, because a reduced-motion user still needs the
    card to *change faces*, just not spin.
- Accessibility: the two faces carry `aria-hidden="false"` / `aria-hidden="true"` and are
  toggled on flip (asserted at `ReviewView.test.tsx:139-146`), and the flip control has an
  accessible name ("Flip card to see the answer"). This is a well-built interaction.
- Responsive: no width breakpoints; `max-width: 600px` centred column plus `min-height: 300px`
  on the scene. Only `prefers-reduced-motion`.
- Test file: `ReviewView.test.tsx`. **Two `.closest("[aria-hidden]")` queries** (`:141`, `:144`)
  — attribute-based, so **unaffected by class-name swaps**, but they *are* structure-sensitive:
  they require that the nearest ancestor carrying an `aria-hidden` attribute is the face
  element. Do not add an `aria-hidden` wrapper between the text and `.face`.
- Design-move tags: [card-primitive: LOW — do not migrate] [pageheader-primitive: MEDIUM — with
  `sub`] [spacing-scale: LOW] [accent-restraint: LOW] [header-actions: LOW]
  [empty-loading-polish: LOW]
- Issues found (severity):
  - **LOW — `border-radius: 20px` hardcoded twice** (`:75`, `:94`) where `--r-lg` is the exact
    same value. Only literal radius in the app; pure token swap, zero visual delta.
  - **LOW — verify `prefers-reduced-motion` fully neutralises the flip transition** rather than
    leaving a shortened spin.
- Redesign status: TODO
