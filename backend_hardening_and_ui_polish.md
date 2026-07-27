# Backend Hardening & UI Polish Walkthrough (2026-07-27)

This document summarizes two sessions of work: (1) three flashcard/quiz/timer fixes, (2) a backend hardening pass against the live Supabase project, and (3) a first UI polish pass. Companion to `learnora_bug_fixes.md`.

---

## Part 1 — Flashcards, Quizzes, Dashboard Timer

### 1. No way to delete or regenerate a flashcard deck

- **Problem:** Deleting a material didn't remove its flashcard deck, and there was no button anywhere to delete or regenerate one.
- **Root Cause:** `flashcard_decks` is only linked to a folder, not a material, so material deletion correctly leaves the deck alone — but nothing ever let you remove a deck manually. `Decks` had no `delete()` method at all.
- **Fix:**
  - Added `Decks.delete(id)` in `js/api.js` (relies on `flashcards.deck_id` being `ON DELETE CASCADE`, confirmed against the live schema).
  - Added a 🗑 delete button to every deck card (main Flashcards tab and folder workspace view), wired through `Router.deleteDeck()` in `js/router.js`.
  - Added `AI.generateFlashcards(materialId, folderId)` in `js/ai.js` — reuses the material's already-saved notes (same trick as quiz generation) instead of re-uploading the file — plus a "+ New Deck" button in the folder workspace view.

### 2. No way to delete a quiz

- **Problem:** Quizzes accumulated forever with no cleanup option.
- **Root Cause:** `Quizzes.delete(id)` already existed in `js/api.js` but was never called from any UI — it was reachable only through the account-wide "delete all data" flow.
- **Fix:** Added a 🗑 delete button to every quiz card (main Quizzes tab and folder workspace view), wired through `Router.deleteQuiz()`.

### 3. Dashboard "Start a focus session" always resumes the last timer

- **Problem:** No quick way to jump straight into a specific timer length from the dashboard.
- **Fix:** Added three quick-start pills (20m / 45m / 90m, matching the timer page's existing Light Study/Exam Cram/Deep Work presets) to the dashboard's Focus card. Clicking one forces pomodoro mode, applies that duration, and starts the timer immediately. The original "Start a focus session →" button is unchanged and still just resumes wherever you left off.

**Files touched:** `js/api.js`, `js/ai.js`, `js/router.js`, `js/main.js`, `index.html`, `style.css`.

---

## Part 2 — Backend Hardening (live Supabase project)

The app talks directly to production (`mlvgqwqiynpwpwzqufdf.supabase.co` — see `js/supabase.js`), so this was done carefully: ran `supabase db advisors --linked` for a real findings list, wrote a migration, **dry-ran it inside a rolled-back transaction against production first**, then pushed for real via `supabase db push --linked`.

### Findings & fixes

| Issue | Fix |
| --- | --- |
| 16 foreign-key columns with no covering index (folders, materials, notes, flashcard_decks, flashcards, quizzes, quiz_attempts, study_sessions, tasks, exams) — every list/fetch was full-table-scanning | Added `CREATE INDEX` for each |
| ~27 RLS policies calling `auth.uid()` directly, re-evaluated per row | Rewrote via `ALTER POLICY ... USING ((select auth.uid()) = user_id)` — same access rules, cheaper query plan |
| `handle_new_user()` — a dead-stub auth trigger (its real body is commented out in `supabase_auth_trigger.sql`) — was still publicly callable via `/rest/v1/rpc/handle_new_user` by `anon` and `authenticated` | Revoked `EXECUTE` from `anon`, `authenticated`, and `PUBLIC` (Postgres grants `PUBLIC` by default on function creation — had to revoke that explicitly too). Trigger still fires on signup; only the public RPC path was closed. |
| `user_id` was nullable on `folders`, `materials`, `notes`, `flashcard_decks`, `flashcards` (unlike every newer table) — a null there means a row RLS makes invisible to everyone, forever | Added `NOT NULL` after confirming zero existing null rows |
| Local `supabase/migrations/` didn't match remote — one migration (the auth trigger) had been applied straight to production outside the CLI | Pulled its exact SQL from `supabase_migrations.schema_migrations.statements` and added it locally so `db push`/`db pull` agree with remote again |

**Migrations added:** `supabase/migrations/20260719020000_auth_user_trigger.sql` (backfilled), `20260727000000_backend_hardening.sql`, `20260727010000_revoke_public_exec_handle_new_user.sql`.

**Verified:** re-ran `supabase db advisors --linked` after pushing — all of the above are clear.

### Still open (needs the Supabase dashboard, not the CLI)

- **Leaked password protection** is disabled under Authentication → Providers → Password. Not exposed in this project's `config.toml`, so it wasn't touched — one-click toggle in the dashboard.

### Noted, not acted on

- The `profiles` table and its `handle_new_user` trigger are dead code — the app stores name/DOB in `auth.users` metadata instead (see `js/api.js` `signup()`) and never reads/writes `profiles`. Left alone since dropping schema is a separate, bigger decision.

---

## Part 3 — UI Polish (first pass)

**How it was actually seen, not guessed:** installed Playwright + Chromium locally, served the static site, and bypassed the login gate entirely client-side — set `localStorage.learnora_invite_access` before navigation (otherwise `main.js` redirects to `coming-soon.html`), then toggled `#auth-wall`/`#main-app`/`.view-section` visibility directly in the page. No login, no production data touched. Animations were disabled before each screenshot so they weren't caught mid-fade.

That surfaced three concrete "generic AI SaaS" patterns, all fixed:

### 1. Background "liquid blobs"

- **Problem:** Four large (450–650px), blurred, animated, colorful circles drift behind every screen at 0.28–0.4 opacity (even higher in dark mode) — read as a loud, generic glassmorphism wash rather than ambient tone.
- **Fix:** `style.css` — reduced opacity (0.35→0.14 light, 0.4→0.16 dark), increased blur so edges are softer, replaced one blob's hardcoded `#d845f8` with `var(--danger)` so it respects the active theme. The mechanism (and the `data-bg-texture` customization option) is untouched — only the default intensity changed.

### 2. The floating "Turbo AI" button

- **Problem:** A 60px perfect circle, gradient fill using a hardcoded independent color (`#7b8ef0`, ignoring the user's theme), with an infinite pulsing glow animation — the textbook generic "AI chat FAB."
- **Fix:** `.ai-trigger-btn` in `style.css` — changed to a squircle (`border-radius: var(--r-lg)` instead of `50%`), replaced the hardcoded gradient stop with theme tokens, moved the pulse animation to hover-only (calm when idle).

### 3. Login screen's marketing panel

- **Problem:** Hardcoded independent blue gradient background (`#3a4ec4`/`#2a3570`/`#121830`, ignoring theme), centered headline, and a 2×2 grid of icon-in-rounded-square feature tiles ("Focus timer", "Task manager", "Exams", "AI study assistant") — a generic landing-page pattern bolted onto a login form.
- **Fix:** `.auth-visual`/`.visual-features`/`.feature-icon` in `style.css` — background now derives from `var(--accent-glow)` plus neutral dark tones; feature list restructured from a centered icon-grid into a left-aligned plain list with small inline emoji markers (no boxes).

### 4. Small bug found along the way

- **Problem:** The timer page's "Subject" dropdown clipped "Unassigned" to "Unassigne" — it shared a 96px `.small-input` class meant for numeric fields.
- **Fix:** Scoped width override for `#active-folder-select`/`#active-task-select`.

**Explicitly not touched:** the in-app color/font/background-texture customizer mechanism itself (`--custom-accent`, `data-font-family`, `data-bg-texture`) — it's intentional and was left as-is; only default/base values were adjusted.

### Left for a follow-up pass

- Sidebar nav still uses raw emoji as icons — swapping in a real icon set touches every nav/button reference across the app and felt too large to do blind in one pass.
- Flashcards/Quizzes/Folders views were only ever seen empty (no real login/data) — a full typography and spacing pass on their populated states hasn't been visually verified yet.

**Files touched:** `style.css` only.

---

## How to re-verify visually

The screenshots for this pass were taken with a throwaway Playwright script (not committed — it lived in a scratch directory), roughly:

```bash
cd study-planner
python3 -m http.server 8934 &
npm install playwright --no-save && npx playwright install chromium
```

Then a small Node script: navigate to `http://localhost:8934/index.html`, set `localStorage.learnora_invite_access = "1"` via `page.addInitScript` (before navigation, or `main.js` redirects to `coming-soon.html`), reload, then in `page.evaluate` hide `#auth-wall`, show `#main-app`, and toggle whichever `.view-section` you want visible. Disable animations first (`*, *::before, *::after { animation: none !important; transition: none !important; }` via `page.addStyleTag`) so the screenshot isn't caught mid-fade. No login or production data needed. Ask if you'd like this turned into a permanent script in the repo instead of a one-off.
