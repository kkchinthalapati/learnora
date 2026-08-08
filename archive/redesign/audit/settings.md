# Settings batch — 8 files

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see dashboard.md).
Source: `webapp/src/views/settings/`
Note: includes AppearanceTab / CustomThemeStudio — the accent-preset picker itself. Preserve
the 13 presets + custom studio functionality; this is UI chrome around it, not the token system.

## SettingsView + tabs (views/settings/)

- Route: `/settings` (the first route cut over from the vanilla `#settings` hash route)
- Related files: `settings.module.css` (~480 lines), `appearance.module.css`,
  `notifications.module.css`, `security.module.css`, and 6 tab components
  (Account, Appearance, Preferences, Notifications, Security, Danger) + `CustomThemeStudio.tsx`
- Header: HAS `.pageHeader` canonical pattern — `settings.module.css:421-431`, used at
  `SettingsView.tsx:78`. Rule body is byte-identical to dashboard's, exams', tasks' and timer's.
  **Five identical copies of the same 10-line rule is the PageHeader primitive's whole case.**
- Card usage: **3 glass-shell declarations**, and one of them is a *fourth* distinct recipe:
  - `.card` (`settings.module.css:180-192`) — `--r-lg` + `--glass-inner`,
    `--glass-inner-bottom`, `--shadow-sm`. Neither Recipe A nor Recipe B: it takes A's
    inner-bottom and B's radius/shadow.
  - `.card:hover` (`:194-196`) — escalates to `--shadow-md`, same hover-elevation idea Library
    implements differently (Library goes to `--shadow-lg`).
  - `appearance.module.css` contributes 2 more glass surfaces for the preset picker.
  - Card primitive confidence: **HIGH** — settings is the most card-dense screen in the app
    (one card per settings group), and the hover-elevation behaviour appearing here *and* in
    Library, at two different shadow levels, is direct evidence that elevation belongs in the
    primitive with a defined scale rather than being re-guessed per view.
- Spacing: **29 hardcoded px across the batch** (8 in `settings.module.css`, 19 in
  `appearance.module.css`, 2 in `notifications.module.css`, 0 in `security.module.css`).
  `appearance.module.css` is the **worst single offender in the app**: distinct values
  `2 3 4 6 8 10 11 12 14 16 18 20` — `11px` and `18px` appear nowhere else in the codebase.
  `security.module.css` is fully on-token and is the model the others should match.
- Accent usage: **25 references in `appearance.module.css` — tied with Library for heaviest**,
  which is expected and correct here: this tab *is* the accent picker, so accent density is the
  subject matter, not decoration. `settings.module.css` itself is a restrained 9.
- Distinctive/preserve:
  - **The 13 accent-preset swatches** (`appearance.module.css:197-276`) hardcode 26 hex values
    as `linear-gradient(135deg, …)` pairs plus solid fallbacks. These are **correct as
    literals** — they are previews of the presets themselves and must not resolve through
    `--accent`, or every swatch would render identically. Explicitly recording this so a later
    "replace hex with tokens" pass does not break the picker.
  - `border: 2px solid #fff` at `:197` on the selected swatch is the one that *is* worth a
    look: a fixed white ring against a light-theme background is low-contrast. See Issues.
  - The 13 presets + Custom Theme Studio functionality is on the preserve list.
- Accessibility: 6 `:focus-visible` rules in `appearance.module.css` — tied with Library for
  the most explicit focus handling. Swatches are keyboard-reachable. `security.module.css` is
  clean and token-conformant throughout.
- Responsive: `@media (max-width: 768px)` at `settings.module.css:~` (tab strip → stacked) plus
  `prefers-reduced-motion` in both `settings` and `appearance`. 768px matches the shell,
  Header and Sidebar breakpoints — correctly coordinated.
- Test file: one per tab (`SettingsView`, `AccountTab`, `AppearanceTab`, `PreferencesTab`,
  `NotificationsTab`, `SecurityTab`, `DangerTab`, `CustomThemeStudio`) — 8 test files, the
  best-covered batch. **No `.closest()` and no `.className` assertions.**
  `AppearanceTab.test.tsx:12` writes `document.body.className = ""` in a `beforeEach`, which is
  test setup for the theme class, not a structural assertion. **Safe for class-name swaps.**
- Design-move tags: [card-primitive: HIGH] [pageheader-primitive: HIGH] [spacing-scale: HIGH]
  [accent-restraint: N/A — accent is the subject matter here] [header-actions: LOW]
  [empty-loading-polish: LOW]
- Issues found (severity):
  - **MEDIUM — `appearance.module.css` is the worst spacing-scale offender in the app.**
    19 hardcoded px including `11px` and `18px`, which exist nowhere else. Contrast with
    `security.module.css` in the same batch, which is fully on-token.
  - **LOW — selected-swatch ring is a hardcoded `#fff`** (`appearance.module.css:197`). Against
    the light theme's pale background this is a near-invisible selection indicator. The rest of
    the app expresses selection with `--accent-ring`. Worth checking in light mode specifically.
  - **LOW — a fourth card recipe.** `.card` mixes Recipe A's inner-bottom with Recipe B's
    radius and shadow, and hover-elevates to a different level than Library's equivalent.
- Redesign status: TODO
