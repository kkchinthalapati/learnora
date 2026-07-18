# UX Revamp Progress (resume here)

Full plan: `.claude/plans/ux-revamp-plan.md` (also mirrored at `~/.claude/plans/i-need-you-to-abundant-tome.md` on the original machine).

## Status: Phase 1 complete, Phase 2.1 complete, Phase 2.2 NOT started

### Done (committed in this branch):
- **Phase 1 (all 5 items)**: `UI.confirm()` opts-object fixes in `js/ai.js` (5 call sites), "Plan my week" overwrite confirmation in `js/main.js`, `<START_TIMER>`/`<SET_THEME>` documented in AI system prompt + new quick-action chip in `index.html`, all undefined CSS vars fixed (`--primary-color`→`--primary`, `--radius-lg`→`--r-lg`, `--radius-md`→`--r-md`, `--text-color`→`--text`), Wipe Data description corrected in `index.html` + `js/main.js`.
- **Phase 2.1**: Dissolved duplicate "AI BEAST MODE STYLES" block in `style.css` — merged actually-rendering property values into the original `.ai-modal`/`.ai-bubble` rules (kept visually silent per plan constraint), added `--surface-hover`/`--surface-active` tokens to `:root` and `body.dark-theme`, deleted dead `.ai-modal.minimized`, fixed a newly-discovered invalid-CSS bug on `.ai-host-bubble` (`border: 1px solid var(--border)` → `border: var(--border)`, since `--border` is already a full shorthand).

### NOT started — pick up here:

**Phase 2.2** (next task): Unify `.correct-choice`/`.wrong-choice` colors in `style.css` (currently around line ~3201-3214, re-grep to confirm — line numbers shift as edits land) from hardcoded `#22c55e`/`rgba(34,197,94,0.1)` and `#ef4444`/`rgba(239,68,68,0.1)` to `var(--success)`/`var(--success-soft)` and `var(--danger)`/`var(--danger-soft)`. Keep all `!important` flags (required to override base choice-button class). This IS a visually-perceptible change (green/red → app's teal/coral accents) — already explicitly approved in the plan as the one intentional visual change in Phase 2, not a redesign violation.

Current rules to edit (verify via `grep -n "correct-choice\|wrong-choice" style.css` first, may have shifted):
```css
.correct-choice {
    background-color: rgba(34, 197, 94, 0.1) !important;
    border-color: #22c55e !important;
    color: #22c55e !important;
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);
}
.wrong-choice {
    background-color: rgba(239, 68, 68, 0.1) !important;
    border-color: #ef4444 !important;
    color: #ef4444 !important;
    animation: shake-error 0.5s ease-in-out;
}
```
Target:
```css
.correct-choice {
    background-color: var(--success-soft) !important;
    border-color: var(--success) !important;
    color: var(--success) !important;
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2); /* leave as-is, box-shadow glow not required by plan */
}
.wrong-choice {
    background-color: var(--danger-soft) !important;
    border-color: var(--danger) !important;
    color: var(--danger) !important;
    animation: shake-error 0.5s ease-in-out;
}
```

**Then continue sequentially through the rest of the plan** (still pending, in order):
- Phase 2.3: missing utility classes (`.mb-32`, `.pt-24`, `.btn-sm` + remove inline compensation at `js/main.js:1027`, `.pull-left`, `.text-gradient`, `.fade-in`, case-by-case checks on the rest)
- Phase 2.4: `:active`/`:disabled` states on `.btn-danger`/`.btn-warning`/`.btn-success`; delete dead CSS (`.tab-content`, `.exam-list-mini`, `.danger-zone`, `.calendar-header`); fix inline grid-template-columns on folder-detail 3-col grid and upload material-type picker
- Phase 3 (9 sub-items): empty-state unification, timer reset button styling+confirmation, timer favorite presets extended to all types, sidebar nav fixes (#plan entry, Calendar→Exams rename, AI modal visual cue), Settings fixes (header logout, export label, cancel buttons, Sign Out Others severity), Exams day-detail popover redesign, Upload fixes (file-type auto-detect, input type toggle, required-field indicator, status toast), standardize back-nav, auth-wall consistency
- Phase 4: Notifications tab rework (remove 2 fake toggles, wire up 2 real ones with permission-request UI)
- Final: browser verification pass (Playwright), syntax check, commit, push to a fresh branch (main is protected, gh not authenticated — push branch and open PR URL manually)

All work happens directly on `main` locally per this repo's established pattern, then gets pushed via a throwaway feature branch since `main` requires PRs.
