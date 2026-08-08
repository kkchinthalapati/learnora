# Notes batch — 3 renderable files (+ 1 shared subcomponent audited alongside)

Status: AUDITED — 2026-08-02. Combines two independent passes: this session's live-rendered
audit (screenshots below) and a parallel source-only pass (dev account) that independently found
the same `#6b7ee8` bug and spacing issues, plus two small additions folded in below (an
aria-live accessibility check on save-status, and a breakpoint-coordination note).
Source: `webapp/src/views/notes/`

Rendering: **live, via Playwright against the real running Vite dev server** (not source-only),
same technique as `redesign/audit/dashboard.md`. No `.env`/live Supabase credentials exist in
this repo; reached the notes route anyway by:
1. Seeding `localStorage["sb-mlvgqwqiynpwpwzqufdf-auth-token"]` with a shaped-correctly fake
   session (future `expires_at`, no network call needed for `getSession()`), plus the
   `learnora_mode` / `learnora_theme` / `learnora_accent` / `learnora_sidebar` / `learnora_bg` /
   `learnora_font` / `learnora_size` appearance keys `lib/appearance.ts` reads via `Storage.get`
   (which `JSON.parse`s the raw string — **values must be `JSON.stringify`d before
   `localStorage.setItem`**, e.g. `"dark"` with quotes, not the bare string `dark`; got this wrong
   on the first pass, which silently fell back to the default dark/teal for every "light" capture
   until fixed — worth calling out since it's an easy trap for the next batch too). Confirmed via
   `readStoredAppearance()` (`lib/appearance.ts:112-119`) that `learnora_mode` is read *before*
   `learnora_theme` (`THEME_KEY`), so both were seeded to be safe.
2. Intercepting `**/rest/v1/**`, `**/auth/v1/**`, `**/functions/v1/**` with Playwright
   `page.route`, returning fixtures shaped like `NotesView.test.tsx`'s and
   `NotesAiSidebar.test.tsx`'s own MSW handlers (same entity names/shapes: `materials` — single
   object via `?id=eq.` for `useMaterial`, matching `materialsApi.fetchById`'s `.maybeSingle()`
   contract of "object or `null`", not an array; `notes` — array filtered by `?material_id=eq.`,
   plus a `PATCH` handler for autosave; `folders` — array, used by the Create-dialog folder
   picker the AI sidebar's quick-action cards open) and `functions/v1/learnora-ai` (the edge
   endpoint `callEdge` posts to, returning `{ text }`).
3. One addition beyond the dashboard technique: Playwright's `fill()`/`click()` auto-scrolls the
   target into view before interacting, which nudged the whole page's scroll position for the
   AI-conversation capture (this view's own container is `height: calc(100vh - var(--s-8))`, not
   the window, so a stray scroll leaves the sticky toolbar clipped at the very top of the
   viewport). Fixed by forcing `window.scrollTo(0, 0)` immediately before the final screenshot.

Screenshots captured (`redesign/screenshots/notes/`):
- `NotesView-light.png` — light, default accent (teal), populated note, AI sidebar idle
- `NotesView-dark.png` — dark, default accent, populated note, AI sidebar idle
- `NotesView-dark-cyberpunk.png` — dark, `cyberpunk` accent preset, populated note
- `NotesView-dark-readonly-empty.png` — dark, default accent, material with **zero notes rows**
  (the generation-still-pending state: read-only Quill, disabled toolbar, disabled Save, "Notes
  aren't ready to edit yet" status text)
- `NotesView-dark-not-found.png` — dark, default accent, `material: null` (deleted-elsewhere
  state — `NotesView`'s own `EmptyState` branch, not `NotesEditorPane`)
- `NotesView-dark-ai-conversation.png` — dark, default accent, one exchange sent through the AI
  sidebar with a reply containing an `INSERT_INTO_NOTE` tag — captures the user/AI chat bubbles,
  the inserted text landing live in the document, the save-status flipping to "Unsaved changes"
  as a result, and the "Added to your notes." toast, all in one frame
- `NotesView-dark-loading.png` — dark, default accent, REST responses held open 8s (skeleton
  shimmer block, `aria-busy="true"` on `<main>`)

---

## NotesView (`webapp/src/views/notes/NotesView.tsx`)

- Route: `/notes/:materialId` (protected, inside `AppShell`) — confirmed in `webapp/src/routes.tsx:75`
- Related files: `notes.module.css` (`.view`, `.loadError`), `components/EmptyState.tsx`,
  `components/Skeleton.tsx`, `components/Button.tsx`, `hooks/useMaterials.ts` (`useMaterial`),
  `hooks/useNotes.ts` (`useNotesByMaterial`)
- Screenshots: `NotesView-dark-loading.png` (loading branch), `NotesView-dark-not-found.png`
  (not-found branch); the happy path renders nothing of its own (hands off to
  `NotesEditorPane` immediately, line 61-69) so it doesn't own a distinct visual in the populated
  screenshots
- Header: **no PageHeader, no toolbar either** — this is the thin route-level wrapper the
  ledger's "Notes uses a toolbar instead of PageHeader" note is *about*, but the toolbar itself
  lives one component down in `NotesEditorPane`, not here. This file's three non-happy-path
  branches (loading/error/not-found) each just wrap content in a bare `<main className=styles.view}>`
  with no heading at all.
- Card usage: none — `.view` here is layout-only (reused from the same class as
  `NotesEditorPane`, see that entry)
- Spacing: none component-specific beyond `.view` (see `NotesEditorPane` below, which owns that
  class's declaration)
- Accent usage: none directly (EmptyState's "Back to Library" button is `variant="primary"`,
  accent-colored via `Button.tsx`, but that's the shared Button primitive, not this file)
- Distinctive/preserve: the code comment (lines 10-19) explaining the Library/SubjectDetailPage
  split precedent and the AI sidebar's Step-25 dependency history — documentation, not a visual
  decision, no redesign impact
- Accessibility: loading state has `aria-busy="true"` on `<main>` (line 28) with a labeled
  `<Skeleton label="Loading your notes">`; error state uses `role="alert"` (line 37) — confirmed
  live in the loading screenshot (skeleton shimmer, no flash of unstyled content)
- Responsive: none component-specific; inherits `.view`'s breakpoint (see `NotesEditorPane`)
- Test file: `NotesView.test.tsx` — role/text queries throughout
  (`screen.findByText`, `getByRole("button", {name: "Back to Library"})`,
  `document.querySelector(".ql-editor")` for editor-content assertions since Quill's contenteditable
  root isn't otherwise addressable by role). **No `.closest()` or other DOM-depth-sensitive
  queries found in this file** — a clean result, unlike `DashboardView.test.tsx`'s two instances.
- Design-move tags: [PageHeader primitive: N/A — this file has neither a PageHeader nor a
  toolbar; it's a pure loading/error/redirect gate] · [empty/loading/error polish: HIGH] (all 3
  non-happy-path states present, consistent `aria-busy`/`role="alert"`/`EmptyState` usage,
  confirmed to read calmly in the live captures)
- Issues found (severity): none blocking
- Redesign status: TODO

---

## NotesEditorPane (`webapp/src/views/notes/NotesEditorPane.tsx`)

- Route: not routed on its own — mounted by `NotesView` once material+notes have resolved
  (`NotesView.tsx:62-68`), keyed on `materialId` so switching documents remounts fresh
- Related files: `notes.module.css` (`.view`, `.toolbar`, `.toolbarLeft`, `.toolbarRight`,
  `.title`, `.status`, `.statusUnsaved/.statusSaved/.statusFailed`, `.splitLayout`,
  `.editorPane`), `components/RichTextEditor.tsx` (Quill wrapper, own module CSS,
  **`components/` batch — out of scope, referenced only**), `hooks/useNotes.ts`
  (`useUpdateNoteHtml`), `lib/markdown.ts` (`renderMarkdown`)
- Screenshots: this is the composed page in all 7 captures (the toolbar+split-pane shell is what
  every screenshot actually shows)
- Header: **confirms the ledger's preserved decision** — this view uses a sticky `.toolbar`
  (`notes.module.css:39-53`: `position: sticky; top: 0; z-index: 10`, a flex row with a
  Back-button + title on the left and a save-status + Save button on the right,
  `NotesEditorPane.tsx:142-165`) instead of the canonical `.pageHeader`/`<h1>` pattern seen on
  Dashboard. This is correct and intentional for a split-pane editor — there is no page title in
  the `<h1>` sense, the toolbar *is* the header, and it needs to stay sticky above a scrolling
  document. Confirmed live in every screenshot: the toolbar sits flush at the top of `.view`,
  scrolls independently of the two panes below it. **Not a gap — preserve as-is per
  DESIGN_MOVES.md move #2's note and the ledger's explicit instruction.**
- Card usage: `.editorPane` (`notes.module.css:95-108`) is a **near-exact instance of the same
  6-line glass-shell block** documented in `dashboard.md`'s Card-primitive evidence: `background:
  var(--glass-bg); backdrop-filter: blur(var(--glass-blur)) var(--glass-saturate); (+ -webkit-);
  border: 1px solid var(--glass-border); border-radius: var(--r-xl); box-shadow: var(--glass-inner),
  var(--glass-inner-bottom), var(--shadow-sm);` — the only drift from dashboard's `.card` is the
  last shadow layer (`--shadow-sm` here vs. `--shadow-md` on dashboard's `.card`/`.historyCard`),
  a legitimate size-appropriate variant, not an error. This is the **fifth** near-identical
  instance of the pattern found across the audit so far (dashboard had 4). `.toolbar`
  (`notes.module.css:39-53`) is a **partial/lighter member of the same family**: it has
  `background: var(--glass-bg)` and `backdrop-filter: blur(12px)` (hardcoded, not
  `var(--glass-blur)` — see Spacing below) but **no `border`, no `box-shadow`**, i.e. it's a
  blur-only glass surface, not the full shell. Worth naming as a distinct lighter variant if a
  Card primitive grows a "bar"/"toolbar" style prop rather than trying to force it through the
  same shape as `.editorPane`.
- Spacing: `.view` (lines 10-18) `padding: var(--s-6)` [on-scale] but `height: calc(100vh -
  var(--s-8))` mixes a viewport calc with a token — fine, not a spacing violation, just noting the
  pattern. `.splitLayout` (lines 20-26) `gap: 24px` and `margin-top: 16px` — **both individually
  on-scale values (`--s-6`=24, `--s-4`=16) written as raw px instead of `var()`** — the same
  "on-scale but not tokenized" pattern `dashboard.md` flagged as the cleanest design-move #3
  evidence (`.onboardingBanner`, `.logItem`). `.toolbar` (line 47) `padding: 12px 24px` — again
  both individually on-scale (`--s-3`=12, `--s-6`=24) but hardcoded. `.toolbar`'s
  `backdrop-filter: blur(12px)` (lines 50-51) is **hardcoded instead of `var(--glass-blur)`** —
  the same silent-drift risk `dashboard.md` flagged for `SessionHistoryCard`'s `.logItem`
  (`blur(16px)` there); now confirmed as a second, independent instance of the identical mistake
  in a different batch, strengthening the case that this is a recurring copy-paste drift rather
  than a one-off.
- Accent usage: `.title` (materialTitle text) `color: var(--accent-text)` (line 71) — a single,
  restrained touch (the document's own title, not a decorative flourish). No other accent in this
  file's own CSS; `.statusUnsaved/.statusSaved/.statusFailed` correctly use semantic
  `--warning`/`--success`/`--danger` tokens (lines 83-93), not accent — consistent with the
  ledger's exam-difficulty precedent of keeping status semantics off the accent system.
- Distinctive/preserve: the autosave/save-status state machine (2s debounce, flush-on-unmount,
  "acknowledge a no-op manual save instead of doing nothing") is thoroughly commented as a direct
  port of `js/editor.js`'s behaviour — functional, not visual, no redesign impact, but the
  **flush-on-unmount behaviour is worth knowing about before any redesign touches this
  component's lifecycle** (e.g. wrapping it in a transition/animation library that delays
  unmount could interact with the ref-based flush).
- Accessibility: save-status `<span>` swaps `role` between `"status"` and `"alert"` depending on
  whether the state is `"failed"` (line 152) — a nice touch, live-region semantics that match
  severity. `RichTextEditor`'s own read-only handling (`readOnly={!note}`, `placeholder`) is a
  `components/` concern, out of scope here. (Cross-checked by the parallel source-only audit,
  which flagged this same span as worth verifying carries an `aria-live` region since it's the
  only feedback a save happened — confirmed here: `role="status"`/`role="alert"` both imply an
  implicit live region per ARIA spec, so this is already covered without an explicit
  `aria-live` attribute.)
- Responsive: `@media (max-width: 900px)` (notes.module.css:28-37, 110-114) collapses
  `.splitLayout` from a row to a column (editor pane above, AI sidebar below) and drops `.view`'s
  fixed height to `auto`; `.editorPane` gets `min-height: 55vh` so it doesn't collapse to nothing
  before the sidebar. Not verified at a narrow viewport in the captured screenshots (all taken at
  1440px) — same follow-up gap `dashboard.md` noted for its own 860px breakpoint, worth a batched
  narrow-viewport pass before Phase 5 sign-off rather than repeating this note per-batch.
  **Cross-batch note (from the parallel source-only audit): this 900px breakpoint is shared only
  with the `plan` batch** — everything else uses 768/860/1024, see design-move #8.
- Test file: `NotesView.test.tsx` (the same file — `NotesEditorPane` has no separate test file;
  its behaviour is exercised through `NotesView`'s route-level tests) — role/text queries plus
  one direct DOM query, `document.querySelector(".ql-editor")` (`editorEl()` helper, line 85-87),
  which is necessary because Quill's contenteditable root has no accessible role of its own to
  query by. **No `.closest()` calls.** Covers: autosave-after-debounce, manual-save-on-unchanged-
  doc, failed-save, flush-on-unmount, markdown-fallback-when-html-empty — thorough state-machine
  coverage.
- Design-move tags: [Card primitive: HIGH] (`.editorPane`, near-exact 5th instance of the shell
  across the audit; `.toolbar` as a lighter partial variant worth naming separately) ·
  [spacing-scale conformance: HIGH] (3 more on-scale-but-hardcoded values, plus a second
  independent instance of the hardcoded-`blur(12px)`-instead-of-token drift `dashboard.md` first
  flagged) · [PageHeader primitive: N/A, confirmed preserved toolbar pattern — see Header note
  above, this is the ledger's "Notes deliberately uses a toolbar" instance made concrete]
- Issues found (severity):
  - **Low/maintainability — `.toolbar`'s `backdrop-filter: blur(12px)` hardcoded instead of
    `var(--glass-blur)`.** Second confirmed instance of this exact drift pattern (see
    `dashboard.md`'s `SessionHistoryCard.logItem` note); if `--glass-blur`'s value changes, this
    toolbar silently stops matching every other glass surface in the app.
- Redesign status: TODO

---

## NotesAiSidebar (`webapp/src/views/notes/NotesAiSidebar.tsx`)

- Route: not routed — docked beside the document in `NotesEditorPane`'s `.splitLayout`
  (`NotesEditorPane.tsx:178-185`), mounted with the same `key={materialId}` as the pane so a
  document switch also resets this panel's conversation (deliberate — see the file's own header
  comment, lines 37-42, on why this diverges from the vanilla app's shared `AI.chatHistory`)
- Related files: `notesSidebar.module.css`, `components/chat/ChatMessage.tsx` (`ChatMessageBubble`
  — **`components/chat/` is the ledger's explicit "never touch without a specific flag" zone**;
  reused here for rendering, not modified, so no redesign-scope conflict, just noting it's a
  cross-batch dependency), `components/chat/chat.module.css` (only for `.filePill`/`.removeFile`,
  the attached-file pill above the input dock), `context/createModal` (the "Quiz me"/"Flashcards"
  cards open the shared Create dialog, out of scope), `lib/notesChatPrompt.ts`, `lib/actionTags.ts`,
  `api/ai.ts` (`callEdge`)
- Screenshots: idle state (3 quick-action cards + greeting + 3 suggestion chips, empty feed) in
  `-light`/`-dark`/`-dark-cyberpunk`; active conversation (user bubble, AI bubble, inserted text,
  toast) in `-dark-ai-conversation.png`
- Header: no PageHeader/toolbar — `.intro` (greeting "Study with me" + subtext, lines 356-367 in
  the TSX) is a card-internal intro block, the same kind of small pattern `dashboard.md` noted for
  `.eyebrow` labels — not a PageHeader candidate, a different, smaller shape.
- Card usage: **this one small file contains three visually distinct "surface" declarations**,
  worth naming individually rather than lumping into one Card-primitive tally:
  1. `.card` (the quick-action cards — Quiz me/Flashcards/Podcast, `notesSidebar.module.css:39-54`)
     — a **flat surface**, not glass at all: `background: var(--surface-2)` (not `--glass-bg`),
     `border: 1px solid var(--glass-border-subtle)` (the "-subtle" border variant), no
     `backdrop-filter`, no `box-shadow`. Genuinely a different shape from the Card-primitive
     family being tracked elsewhere in this audit — a plain bordered tile, not a glass panel.
  2. `.chat` (the panel wrapping the whole conversation column, lines 118-127) — **partial glass**:
     `background: var(--glass-bg)` (the real glass token) but **no `backdrop-filter` and no
     `box-shadow`** at all, unlike every full glass shell tracked so far
     (dashboard's `.card`, this batch's own `.editorPane`). A third distinct variant within one
     file: full-glass (`.editorPane`, in the sibling CSS module), no-glass-flat (`.card`), and
     glass-bg-without-blur-or-shadow (`.chat`). If a Card primitive ships with shell variants,
     this file alone would need at least two of them (flat + bg-only), on top of the full-glass
     variant `.editorPane` needs — genuinely useful evidence for how many variants the primitive
     needs to support, not just whether one is needed.
  3. `.dock` (the input row, lines 210-220) — another flat surface, `background: var(--surface-2)`,
     `border: 1px solid var(--glass-border-subtle)`, `border-radius: 22px` (own custom near-pill
     radius, not `var(--r-pill)`=999px or any `--r-*` token — see Spacing).
- Spacing: high count of on-scale-but-hardcoded and genuinely-off-scale values in this file — the
  worst concentration found in the audit so far:
  - `.panel` `gap: 16px` (line 24, on-scale `--s-4` but hardcoded)
  - `.cards` `gap: 10px` (line 35, **off-scale** — between `--s-2`=8 and `--s-3`=12)
  - `.card` `gap: 8px` (line 42, on-scale `--s-2` hardcoded), `padding: 14px 12px` (line 43,
    14 is **off-scale** — between `--s-3`=12/`--s-4`=16 — 12 matches `--s-3` but hardcoded)
  - `.cardIcon` `width/height: 34px` (lines 75-76, icon-badge size, non-issue like dashboard's
    `.folderDot`), `border-radius: 10px` (line 77, **off-scale** — between `--r-xs`=8/`--r-sm`=12)
  - `.cardHead` `gap: 6px` (line 90, **off-scale**), `strong` `font-size: 0.92rem` (line 96,
    **a raw rem value with no `--fs-*` token match** — `--fs-sm`=13px≈0.8125rem,
    `--fs-base`=15px=0.9375rem; 0.92rem=14.72px sits between them, evidently hand-tuned rather
    than pulled from the scale)
  - `.cardDesc` `margin-top: 2px` (line 101, off-scale, sub-token micro-adjustment)
  - `.badge` `font-size: 0.7rem` (line 110, **second raw-rem token skip in this file**),
    `padding: 2px 6px` (line 111, off-scale), `border-radius: 10px` (line 112, off-scale, same
    non-token radius as `.cardIcon`)
  - `.chat` `padding: 20px` (line 123, on-scale `--s-5` hardcoded)
  - `.intro` `gap: 12px` (line 131, on-scale `--s-3` hardcoded)
  - `.avatar` `width/height: 36px` (icon-badge, non-issue)
  - `.greeting` `font-size: 1.05rem` (line 150, **third raw-rem token skip** — 1.05rem=16.8px,
    between `--fs-md`=16px and `--fs-lg`=18px)
  - `.subtext` `margin: 2px 0 0` (line 156, off-scale)
  - `.suggestions` `gap: 8px` (on-scale `--s-2` hardcoded), `margin-top: 16px` (on-scale `--s-4`
    hardcoded)
  - `.suggestion` `padding: 7px 12px` (line 172, **7px off-scale**, 12px matches `--s-3`
    hardcoded), `font-size: 0.82rem` (line 174, **fourth raw-rem token skip** —
    0.82rem=13.12px, essentially `--fs-sm`=13px hand-retyped as a slightly different rem value
    rather than referencing the token)
  - `.feed` `padding-right: 8px` (on-scale `--s-2` hardcoded), `margin: 16px 0 20px` (both
    on-scale `--s-4`/`--s-5` hardcoded), `gap: 16px` (on-scale `--s-4` hardcoded)
  - `.dock` `padding: 6px 8px` (line 216, **6px off-scale**, 8px matches `--s-2` hardcoded),
    `border-radius: 22px` (line 217, **off-scale**, custom near-pill value not `var(--r-pill)`)
  - `.input` `padding: 8px 4px` (line 230, **both off-scale**)
  This file alone accounts for **4 separate raw-rem font-size skips** (`0.92rem`, `0.7rem`,
  `1.05rem`, `0.82rem`) on top of a dozen-plus off-scale/hardcoded spacing values — by far the
  densest concentration of design-move #3 evidence found in the audit so far, ahead of
  `dashboard.md`'s `AIActionsCard` (which had 1 font-size skip). Confidence for this move should
  move from MEDIUM toward HIGH once library/exams corroborate.
- Accent usage: `.cardIcon` background `var(--accent-soft)` + color `var(--accent-text)` (lines
  78-79, quick-action icon badges); `.avatar` same pairing (lines 144-145, bot avatar);
  `.card:focus-visible` outline `var(--accent)` (lines 62-64); `.suggestion:hover` border-color
  `var(--accent-ring)` (line 189); `.dock:focus-within` border-color `var(--accent-ring)` (line
  223); `.iconBtn:hover` background `var(--accent-soft)` + color `var(--accent-text)` (lines
  263-264); `.sendBtn` background `linear-gradient(135deg, var(--accent), #6b7ee8)` (line 276)
  and hover state (lines 283-288). Seven distinct accent touches in one file — a real data point
  for design-move #4, though most are restrained (hover/focus-only, or a small icon badge).
  **One is not restrained and is a genuine bug, not a style-taste question**: `.sendBtn`'s base
  gradient (`notesSidebar.module.css:276`) hardcodes its second color stop as `#6b7ee8` (a fixed
  indigo) instead of a token. `components/chat/chat.module.css:118-125` documents, in its own
  comment, that the **exact same `#6b7ee8` hardcoded value was previously used for the workspace
  chat's `.userBubble` and was deliberately replaced with `var(--accent-hover)`** because it
  "looked intentional under the default teal/indigo pairing, but every other accent preset
  (Hacker's green, Sunset's orange, …) painted this bubble half in a colour that had nothing to
  do with the theme the student picked." That fix was never carried over to this sidebar's send
  button, which still has the identical problem today — confirmed by reading the two files side
  by side, this is not a hypothesis. **This is the strongest, most concrete single finding in the
  batch**: a known, already-fixed-elsewhere bug reintroduced by a different component copying the
  old pattern. Recommend porting the same fix (`var(--accent-hover)` in place of `#6b7ee8`) as
  part of whichever pass touches this file next, independent of the broader Card/PageHeader
  primitive work.
- Distinctive/preserve: this panel deliberately does **not** execute action tags other than
  `INSERT_INTO_NOTE` (file header comment, lines 30-35, and the fallback copy at
  `NotesAiSidebar.tsx:259`, "I tried to run an app action, but this panel can't") — a product/AI-
  behavior decision, not visual, but worth knowing before any redesign touches the chat bubble
  styling shared with `components/chat/`, since the *text* this panel shows on a stripped action
  tag is bespoke to this file and would need to stay bespoke. The auto-growing textarea
  (`NotesAiSidebar.tsx:154-168`, resetting `height` to `"auto"` before reading `scrollHeight` so
  it can shrink back down, not just grow) is the "resize" behavior referenced in this batch's
  brief — it is **not** a user-draggable panel-resize handle (no such control exists in this
  component or its CSS); it is a self-resizing single-row-by-default textarea capped by
  `.input`'s `max-height: 120px`. Confirmed this is what PR #45 ("Fix the notes AI sidebar's
  broken input box and give it real edit access") actually shipped, via `git log --oneline --
  webapp/src/views/notes/NotesAiSidebar.tsx`.
- Accessibility: the feed is `role="log" aria-live="polite" aria-label="Conversation about this
  document"` (`NotesAiSidebar.tsx:383-388`) — correct choice for a growing chat transcript; the
  textarea has `aria-label="Ask about this document"` (line 440) rather than a visible `<label>`,
  fine given the placeholder communicates the same thing visually; the attach button uses
  `Icon`'s own `label` prop (`label="Attach a file"`, line 417) rather than a manually-authored
  `aria-label` — consistent with how `Icon.tsx` is used elsewhere in the app (per the dashboard
  audit's note on `CommandBar`'s `aria-hidden="true"` icon vs. TasksCard's unlabeled one, this
  file gets it right). `.input:focus { outline: none }` (`notesSidebar.module.css:239-241`) removes
  the browser's default focus ring from the textarea itself, relying on the parent `.dock`'s
  `:focus-within { border-color: var(--accent-ring) }` (lines 222-224) as the only visible focus
  indicator — a real but subtle indicator (a 1px border color shift, not a full outline); low-
  severity, worth a `box-shadow` ring added to `.dock:focus-within` if accessibility polish
  becomes an approved move, not blocking.
- Responsive: `@media (max-width: 900px)` (lines 295-301) — `.panel` becomes `flex: 1 1 auto;
  width: 100%; min-height: 60vh`, i.e. the sidebar drops below the editor pane and claims most of
  the viewport height rather than shrinking to fit — matches `.splitLayout`'s column collapse in
  the sibling CSS module. Not verified at a narrow viewport in the captures (1440px only), same
  outstanding follow-up noted for the other two files in this batch.
- Test file: `NotesAiSidebar.test.tsx` — role/text queries throughout (`getByLabelText`,
  `getByRole("button", {name: ...})`, `findByText`), plus the same
  `document.querySelector(".ql-editor")` pattern `NotesView.test.tsx` uses, for the same reason
  (Quill has no role to query the document text by). **No `.closest()` calls.** Coverage is
  thorough and security-conscious: document-context fencing against prompt injection, action-tag
  stripping, `INSERT_INTO_NOTE` extraction-then-strip, failed-exchange history exclusion,
  Create-dialog pre-ticking from both quick-action cards. None of this is DOM-depth-sensitive, so
  none of it is at risk from a Card-primitive swap the way `dashboard.md`'s two `.closest("div")`
  calls are.
- Design-move tags: [Card primitive: HIGH — but multi-variant] (three distinct surface shapes in
  one file: flat/`.card`, glass-bg-only/`.chat`, flat-pill/`.dock` — strong argument the eventual
  primitive needs variants, not just one shape) · [spacing-scale conformance: HIGH — densest
  evidence in the audit so far, 4 font-size-token skips alone] · [accent restraint: MEDIUM] (7
  touches, mostly restrained, but the `.sendBtn` gradient is the one exception and it's a bug, not
  a taste call) · [empty/loading/error polish: N/A for this file] (no dedicated empty state for
  the chat feed itself — an empty conversation just shows the intro+suggestions, which already
  reads as the "empty state," confirmed live)
- Issues found (severity):
  - **Medium — `.sendBtn`'s gradient hardcodes `#6b7ee8` instead of `var(--accent-hover)`
    (`notesSidebar.module.css:276`).** Confirmed via `components/chat/chat.module.css:118-125`'s
    own comment that this exact pattern was already identified as a cross-preset bug and fixed in
    the sibling workspace-chat component; this file still has the pre-fix version. Concrete,
    scoped, one-line fix — flag for the next pass that touches this file, independent of the
    broader primitive rollout.
  - **Low/maintainability — dense off-scale/hardcoded spacing and 4 raw-rem font-size values**,
    see Spacing above; none look visually broken in the live captures (checked default + cyberpunk),
    this is a token-hygiene finding, not a "looks wrong" finding.
- Redesign status: TODO

---

## Design-move tally for this batch (feeds DESIGN_MOVES.md's "Evidence batches" fields)

1. **Card primitive** — Confidence: **HIGH**, confirmed, and this batch adds a new dimension the
   dashboard batch didn't surface: `.editorPane` is a near-exact 5th instance of the full 6-line
   glass shell, but `NotesAiSidebar` alone contains three *other*, genuinely different surface
   shapes (flat/`.card`, glass-without-blur-or-shadow/`.chat`, flat-pill/`.dock`) that a single
   Card primitive can't represent without variants. Recommend the eventual primitive ship with at
   least a `variant="glass" | "flat" | "subtle"` (or similar) prop rather than one fixed shape.
2. **PageHeader primitive** — Confirms the ledger's pre-existing note: Notes uses a sticky
   `.toolbar` instead, and it's the right call for a split-pane editor (no page-level `<h1>` makes
   sense here; the toolbar needs `position: sticky`, a PageHeader doesn't). Recorded here as
   preserved-not-a-gap, not counted as a PageHeader-primitive data point either way.
3. **Spacing-scale conformance** — Confidence: raised to **HIGH** on the strength of this batch,
   specifically `notesSidebar.module.css`, which has the densest concentration found so far: over
   15 hardcoded-but-individually-on-scale or genuinely-off-scale spacing values, plus **4 separate
   raw-rem font-size values with no `--fs-*` token match** (`0.92rem`, `0.7rem`, `1.05rem`,
   `0.82rem`) in one file. Two independent instances of the identical
   hardcoded-`blur(Npx)`-instead-of-`var(--glass-blur)` drift now exist across two different
   batches (`dashboard.md`'s `SessionHistoryCard.logItem`, this batch's `.toolbar`).
4. **Accent restraint** — Confidence: **MEDIUM**, consistent with dashboard's finding. Most
   touches in this batch are hover/focus-only or small icon badges and read fine in both default
   and cyberpunk captures. The one exception is not a restraint question at all: `.sendBtn`'s
   hardcoded `#6b7ee8` is a **confirmed bug**, not a design-taste judgment call — see the
   NotesAiSidebar entry above. Recommend tracking that fix separately from whatever this move
   eventually decides about accent density.
5. **Header action-affordance** — N/A for this batch; there is no PageHeader here to add an
   action slot to (see move #2 above).
6. **Empty/loading/error polish** — Confidence: structurally **HIGH**, consistent with dashboard.
   `NotesView` implements all 3 non-happy-path states (loading/error/not-found) with
   `aria-busy`/`role="alert"`/`EmptyState`; `NotesEditorPane`'s read-only "notes aren't ready yet"
   state is a fourth, distinct non-happy-path treatment specific to this batch (a document that
   exists but has no note row yet) and it's handled cleanly — placeholder text inside a disabled
   Quill instance, disabled Save button, explicit status text, all confirmed in
   `NotesView-dark-readonly-empty.png`.

## Test-safety flags for Phase 4 (Card/PageHeader primitive migration)

**Clean batch — zero `.closest()` or other DOM-depth-sensitive queries found** across
`NotesView.test.tsx` and `NotesAiSidebar.test.tsx`. Both files query exclusively by role/label/text,
with one necessary exception in both (`document.querySelector(".ql-editor")`) that reaches into
Quill's contenteditable root specifically because it has no ARIA role to query by — that pattern is
orthogonal to a Card-primitive swap (Quill's own DOM doesn't change), so it's not a risk for Phase 4
the way `dashboard.md`'s two `.closest("div")` calls are. **No action needed for this batch's tests
before a primitive swap.**
