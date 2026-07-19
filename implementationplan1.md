# Learnora Frontend — Implementation Plan

> Based on codebase audit of `index.html`, `style.css`, `js/main.js`, `js/ui.js`, `js/router.js`, `js/ai.js`, `js/timer.js`

---

## 1. Critical Bugs

### 1.1 `UI.escapeHTML is not a function` — Upload crash

| | |
|---|---|
| **What** | Clicking "Process Material" throws `Upload Failed: UI.escapeHTML is not a function`, killing the upload flow. |
| **Root cause** | [main.js L242, L246, L252, L1395](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/main.js#L242) call `UI.escapeHTML(...)`, but the UI module exports the function as `esc()`, not as a method on the `UI` object. `esc` is imported on line 1, but the toast code (added in the Phase 3-4 UX revamp) used the wrong name. |
| **Fix** | Replace all 4 instances of `UI.escapeHTML(...)` with `esc(...)`. Both are the same XSS-safe HTML entity escaper. |
| **Files** | [main.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/main.js) |
| **Priority** | **P0 — blocking** |
| **Risk** | None. Trivial rename, no behavioral change. |
| **Phase** | Before everything else. |

### 1.2 Missing `#view-notes` scroll/overflow containment

| | |
|---|---|
| **What** | The notes reader view (`#view-notes > #notes-content.markdown-body`) renders AI-generated study content via `AI.renderMarkdown()`. The `.markdown-body` class has **no CSS definition** — it appears only in a dead-code comment at [style.css L2809](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/style.css#L2809). Long content can visually bleed outside its glass panel. |
| **Root cause** | No `overflow-wrap`, `word-break`, or `overflow` rules on `.markdown-body` or `#notes-content`. `renderMarkdown()` generates inline-styled headings, code blocks, and lists but the container has no max-height or scroll behavior. |
| **Fix** | Add a `.markdown-body` ruleset: `overflow-wrap: break-word; word-break: break-word; overflow-x: auto;`. Optionally add `max-height: 80vh; overflow-y: auto;` if you want the notes to scroll within the panel rather than extending the page. |
| **Files** | [style.css](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/style.css) |
| **Priority** | **P0** |
| **Risk** | Low. CSS-only change. |
| **Phase** | Before visual polish. |

---

## 2. UX / UI Fixes

### 2.1 Header layout structure — "11:28 AM Log Out Toggle Theme ← Back" running together

| | |
|---|---|
| **What** | On mobile (or when the sidebar is collapsed), the header wraps and the clock pill, logout icon, and theme toggle smash together without visual separation. The `← Back` button on sub-views also competes with the page title. |
| **Root cause** | `.header-right` has no base CSS definition outside the mobile media query at [style.css L3094](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/style.css#L3094). It relies solely on `.flex-gap` for layout. On mobile, `.header-right` goes `width: 100%` with `justify-content: space-between`, but the header itself switches to `flex-direction: column` and `align-items: stretch`, which makes the right-side controls stretch to full width without grouping them. The logout and theme buttons also lack `aria-label` tooltips visible on hover (they have `aria-label` but no `title`). |
| **Fix** | 1. Add a `.header-right` base rule: `display: flex; align-items: center; gap: var(--s-3); flex-shrink: 0;`. 2. On the mobile breakpoint, instead of stretching full width, right-align the controls: `justify-content: flex-end;` instead of `space-between`. 3. Add `title` attributes matching `aria-label` on the logout and theme toggle buttons for hover clarity. |
| **Files** | [style.css](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/style.css), [index.html](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/index.html) |
| **Priority** | P1 |
| **Risk** | Low |
| **Phase** | Before visual polish. |

### 2.2 Exam name — long text / special character handling

| | |
|---|---|
| **What** | The exam name input accepts strings like `!@#$%^&*() Super Long Exam Name That Goes On And On...`. No `maxlength`, no truncation on display, no validation feedback. Special characters are handled via `esc()` in rendering but there's no length guardrail. |
| **Root cause** | The `<input id="exam-name">` at [index.html L1488](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/index.html#L1488) has `required` but no `maxlength`. Calendar cells and the day-detail modal render exam names via `esc(exam.exam_name)` but have no `text-overflow: ellipsis` or truncation. |
| **Fix** | 1. Add `maxlength="120"` to `#exam-name`. 2. Add CSS truncation to exam name display contexts (calendar cells, day-detail items): `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;`. 3. Optionally add a character counter below the input. |
| **Files** | [index.html](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/index.html), [style.css](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/style.css) |
| **Priority** | P1 |
| **Risk** | Low |
| **Phase** | Before visual polish. |

### 2.3 Exam date — usability and validation

| | |
|---|---|
| **What** | The `<input type="date">` at [index.html L1495](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/index.html#L1495) has no `min` or `max` attributes. The browser's native date picker allows year values up to 275760. No inline validation for past dates. |
| **Root cause** | Missing `min` and `max` attributes, and no JS validation on submit. |
| **Fix** | 1. Set `min` dynamically in `openExamModal()` to today's date (YYYY-MM-DD). 2. Set `max` to a reasonable future date (e.g., 5 years from now). 3. Add inline JS validation in the exam form submit handler to reject past dates with an `input-error` shake + a field-level error message. |
| **Files** | [main.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/main.js), [index.html](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/index.html) |
| **Priority** | P1 |
| **Risk** | Low |
| **Phase** | Before visual polish. |

### 2.4 Quiz config modal — personality + question count UX

| | |
|---|---|
| **What** | The quiz personality `<select>` has long option labels like "Friendly Tutor (Supportive)" that truncate on mobile. The question count selector uses a `<select>` for just 3 options — a segmented control (like difficulty) would scan faster. |
| **Root cause** | Both use plain `<select>` elements. The personality options have parenthetical descriptions baked into the option text with no supporting context. |
| **Fix** | 1. Convert the question count `<select>` to a `.segmented` radiogroup (same pattern as difficulty), with labels "5 Quick", "10 Standard", "15 Deep". 2. For personality, keep the `<select>` but shorten option text to just the name ("Friendly Tutor", "Strict Coach", etc.) — the parenthetical descriptions are already the `value` attribute. 3. Optionally add a small `<p class="field-desc">` below the personality select showing a one-line description of the currently selected personality. |
| **Files** | [index.html](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/index.html), [main.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/main.js) (if wiring dynamic description) |
| **Priority** | P2 |
| **Risk** | Low |
| **Phase** | During visual polish. |

### 2.5 Folders/Courses — weak information density

| | |
|---|---|
| **What** | Folder cards show only the folder name and color. No material count, no last-modified date, no quick actions (delete, rename). |
| **Root cause** | [router.js loadFolders()](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/router.js#L183) renders minimal HTML for each folder. The API likely returns enough data but the renderer doesn't use it. |
| **Fix** | 1. In `loadFolders()`, fetch material counts per folder (or include them in the folder query). 2. Add metadata to the card: material count, creation date. 3. Add a context menu or icon buttons for rename/delete. 4. Improve the empty state with a more compelling call-to-action. |
| **Files** | [router.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/router.js), [api.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/api.js) (if query changes needed) |
| **Priority** | P2 |
| **Risk** | Medium — may require API/query changes. |
| **Phase** | After core fixes. |

---

## 3. Accessibility Fixes

### 3.1 Modal dialog semantics — missing `role="dialog"` and `aria-modal`

| | |
|---|---|
| **What** | All modal overlays (`#popup-overlay`, `#app-dialog`, `#exam-modal`, `#quiz-config-modal`, `#day-detail-modal`) are plain `<div>` elements without `role="dialog"` or `aria-modal="true"`. Screen readers cannot identify them as modal dialogs. |
| **Root cause** | The modals were built with visual behavior (backdrop blur, z-index) but not with ARIA semantics. |
| **Fix** | Add `role="dialog" aria-modal="true"` to each `.modal-overlay` div. Add `aria-labelledby` pointing to each modal's heading `<h3>`. |
| **Files** | [index.html](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/index.html) |
| **Priority** | P1 |
| **Risk** | None |
| **Phase** | Before visual polish. |

### 3.2 Focus trap — modals don't trap focus

| | |
|---|---|
| **What** | When a modal opens, the user can Tab out of it into the background page. Only `UI._dialog()` manages focus (it focuses the confirm button or input on open), but the exam, quiz config, and day-detail modals don't have focus trapping at all. |
| **Root cause** | No focus-trap implementation exists. Each modal only does `focus()` on one element but doesn't prevent Tab from leaving the modal. |
| **Fix** | Build a lightweight `trapFocus(modalElement)` utility that: 1. Queries all focusable elements inside the modal. 2. On Tab at the last element, wraps to the first. On Shift+Tab at the first, wraps to the last. 3. Returns a cleanup function to remove the keydown listener. Call it in each modal's open function and clean up on close. |
| **Files** | [ui.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/ui.js) (utility), [main.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/main.js) (wiring) |
| **Priority** | P2 |
| **Risk** | Low |
| **Phase** | After core fixes. |

### 3.3 Body scroll lock when modals are open

| | |
|---|---|
| **What** | When any modal is open, the page behind it can still scroll. This is disorienting on mobile where touch scrolling passes through the backdrop. |
| **Root cause** | No `overflow: hidden` is applied to `<body>` when modals open. |
| **Fix** | Add `document.body.style.overflow = "hidden"` when any modal opens, and restore it on close. Track the "modal stack count" to avoid premature restoration when nested modals close. |
| **Files** | [main.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/main.js), [ui.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/ui.js) |
| **Priority** | P2 |
| **Risk** | Low |
| **Phase** | After core fixes. |

### 3.4 Focus return on modal close

| | |
|---|---|
| **What** | When a modal closes, focus is not returned to the element that triggered it. |
| **Root cause** | None of the modal open functions store `document.activeElement` before opening. |
| **Fix** | In each modal open function, capture `const trigger = document.activeElement`. On close, call `trigger?.focus()`. The `UI._dialog()` already has a cleanup function — extend it. For exam/quiz/day-detail modals, add the same pattern. |
| **Files** | [ui.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/ui.js), [main.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/main.js) |
| **Priority** | P2 |
| **Risk** | Low |
| **Phase** | After core fixes. |

---

## 4. State Management / Modal Architecture

### 4.1 Multiple modals rendering simultaneously

| | |
|---|---|
| **What** | The upload failure popup, timer reset confirm, exam modal, day-detail modal, and quiz config modal can all be visible at the same time. No mutual exclusion. |
| **Root cause** | Each modal is toggled independently by adding/removing `.hidden`. There is no central "modal stack" manager. The `UI._dialog()` is self-contained but doesn't know about `exam-modal` or `quiz-config-modal`. The Escape key handler in `bindCalendar()` at [main.js L1444-1447](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/main.js#L1444) closes `exam-modal` AND `day-detail-modal` AND `popup-overlay` all at once, regardless of which is actually on top. |
| **Fix** | 1. Implement a `ModalManager` utility in `ui.js` that tracks which modals are open in a stack. 2. `ModalManager.open(id)` shows the modal, pushes to stack. 3. `ModalManager.close()` hides the top modal, pops from stack. 4. A single Escape handler calls `ModalManager.close()` instead of each modal having its own. 5. Migrate all modal open/close calls to go through the manager. |
| **Files** | [ui.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/ui.js), [main.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/main.js) |
| **Priority** | P1 |
| **Risk** | Medium — requires careful migration. The existing `UI._dialog()` is Promise-based and self-managing; the manager must not break its cleanup pattern. |
| **Phase** | Before visual polish. The scattered Escape handlers and z-index conflicts are a recurring source of bugs. |

### 4.2 Escape key routing conflicts

| | |
|---|---|
| **What** | Multiple `keydown` listeners compete for `Escape`: `UI._dialog()` adds one per dialog instance, `bindCalendar()` adds a global one for exam/day-detail/popup modals, and the AI panel likely has its own. If a `UI.confirm()` dialog is showing *over* the exam modal, pressing Escape will close **both** because the calendar handler fires independently of the dialog handler. |
| **Root cause** | `UI._dialog()` calls `e.stopPropagation()` on Escape, but the calendar handler is registered on `document` and runs on the capture or bubble phase independently. Multiple listeners on `document.addEventListener("keydown", ...)` all fire — `stopPropagation` only stops the *event object* from propagating to child/parent, not from firing other listeners on the same element. |
| **Fix** | This is solved by 4.1 (ModalManager). The single Escape handler replaces all per-modal Escape handlers. As an interim fix, the calendar Escape handler should check if `app-dialog` is currently visible and bail out if so. |
| **Files** | [main.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/main.js), [ui.js](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/ui.js) |
| **Priority** | P1 (part of 4.1) |
| **Risk** | Low if done as part of 4.1. |
| **Phase** | Before visual polish. |

---

## 5. Content / Copy Improvements

### 5.1 Confirm dialog copy and button hierarchy

| | |
|---|---|
| **What** | The timer reset confirm says "Are you sure you want to discard your current session progress?" with "Cancel" and "Reset". This is fine but the destructive action button should have stronger visual weight. |
| **Root cause** | The confirm dialog in `UI._dialog()` correctly toggles `btn-danger` vs `btn-primary` based on the `danger` flag. The timer reset passes `danger: true` at [main.js L848](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/main.js#L848). This is already implemented correctly. |
| **Fix** | No fix needed — this already works. The `danger: true` flag makes the confirm button red. Verify visually. |
| **Priority** | None — already done. |

### 5.2 Day detail modal copy

| | |
|---|---|
| **What** | The day-detail modal subtitle says "View or add exams for this day." — this is fine but generic. |
| **Fix** | Update to show the actual date in the subtitle, e.g., "Exams scheduled for July 19". The `openDayDetailModal()` function at [main.js L1388](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/js/main.js) already formats and sets the title dynamically — the subtitle could be removed or made dynamic too. |
| **Priority** | P3 |
| **Risk** | None |

### 5.3 Quiz personality option labels

| | |
|---|---|
| **What** | Options like "Sarcastic Buddy (Funny & Roasting)" are long and the parenthetical is redundant with the value. |
| **Fix** | Shorten to: "Friendly Tutor", "Strict Coach", "Sarcastic Buddy", "Academic Professor". Drop the parentheticals since the values (`Friendly Tutor`, `Strict Coach`, etc.) already match. The edge function uses these values as the persona prompt. |
| **Files** | [index.html](file:///c:/Users/kkchi/OneDrive/Desktop/study-planner-1/index.html#L1582-L1587) |
| **Priority** | P3 |
| **Risk** | None |

---

## 6. Nice-to-Have Polish

### 6.1 Segmented control visual feedback

The `.segmented-option` for difficulty (exam + quiz) uses radio buttons. The selected state styling exists but could be strengthened with a background fill and a smooth transition. Low priority.

### 6.2 Nav hierarchy review

11 top-level nav items is a lot. Consider grouping: "Study" (Timer, Tasks, Plan), "Learn" (Courses, Upload, Flashcards, Quizzes), "Track" (Dashboard, Exams), and "Settings + AI" at the bottom. This is a bigger UX decision that requires user input.

### 6.3 Toast container styling

The dynamically created `#toast-container` in the upload flow uses all inline styles. Extract to CSS for consistency.

---

## Cross-Cutting Architectural Issues

> [!IMPORTANT]
> **Shared root cause: No modal lifecycle manager.** Issues 4.1, 4.2, 3.2, 3.3, 3.4 all stem from the same architectural gap. Each modal is an independent `<div>` toggled with `.hidden`. There's no central coordination of:
> - Which modal is "on top"
> - Escape key routing
> - Focus trapping
> - Body scroll locking
> - Focus restoration
>
> Building a lightweight `ModalManager` in `ui.js` solves 5 issues in one pass.

> [!WARNING]
> **The `esc()` vs `UI.escapeHTML` mismatch pattern.** The upload toast code introduced `UI.escapeHTML()` calls that don't exist. The `esc()` function is imported as a standalone, not as a method on `UI`. Any future code that calls `UI.escapeHTML` will crash. Consider adding `escapeHTML: esc` to the `UI` export object as an alias to prevent this class of bug from recurring, OR enforce via a comment/convention that `esc()` is the only way.

---

## Phased Execution Order

### Phase A — Critical blockers (30 min)
1. **Fix `UI.escapeHTML` → `esc()`** — 4 call sites in `main.js`. Unblocks the entire upload flow.
2. **Add `.markdown-body` CSS** — overflow containment for notes reader.

### Phase B — Modal architecture (2-3 hours)
3. **Build `ModalManager`** in `ui.js`: stack, open/close, single Escape handler, body scroll lock.
4. **Migrate all modal open/close** to `ModalManager` — exam, day-detail, quiz-config, popup, app-dialog.
5. **Add `role="dialog"` + `aria-modal="true"` + `aria-labelledby`** to all modal overlays.
6. **Add focus trap** utility and wire into `ModalManager.open()`.
7. **Add focus return** on `ModalManager.close()`.

### Phase C — Form validation and UX (1-2 hours)
8. **Exam name**: add `maxlength="120"`, truncation CSS.
9. **Exam date**: dynamic `min`/`max`, past-date validation.
10. **Header layout**: add `.header-right` base styles, `title` attributes.
11. **Quiz config**: convert question count to segmented control, shorten personality labels.

### Phase D — Information density (1-2 hours)
12. **Folders**: metadata (material count, date), quick actions, better empty state.
13. **Day detail**: dynamic subtitle copy.
14. **Toast container**: extract inline styles to CSS.

### Phase E — Deep polish (optional)
15. Nav hierarchy grouping (requires design decision).
16. Segmented control animation polish.
17. Add `escapeHTML` alias on `UI` object to prevent the naming confusion from recurring.
