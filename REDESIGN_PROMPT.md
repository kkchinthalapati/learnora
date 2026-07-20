# Learnora — Full Visual/UX Redesign Prompt

Paste this whole file as your prompt to Claude Code on another machine to pick up the deferred full redesign of this app. It's self-contained — the assistant reading it has no memory of the session that produced it.

## Background

This repo (`study-planner`, product name **Learnora**) went through a production-readiness audit. The audit found both correctness bugs and design-system issues. The correctness bugs (2 Critical, 6 High) have already been fixed and merged into `main` as of this writing. **This file scopes the separate, deferred piece: the full visual/UX redesign.** Don't re-fix the items marked "already fixed" below — verify they're still fixed if anything looks off, but they're not the target of this work.

## Product Understanding (so you don't have to re-derive it)

**Core purpose:** Learnora is a single-user, Supabase-backed study workspace combining manual planning (tasks, exam calendar, focus timer) with an AI pipeline that turns uploaded materials into notes/flashcards/quizzes, plus an AI chat assistant and an AI weekly planner. Everything organizes around per-course **Folders**.

**Primary users:** Individual students, secondary/university level (age-gated at 13+, exam-driven vocabulary, course/folder organization, no classroom/teacher features).

**Main journeys** (hash routes): Dashboard → Folders/Upload → Notes/Flashcards/Quizzes (AI-generated study content) → Exams calendar → Weekly AI plan → Timer → AI chat (persistent floating assistant) → Settings.

**Tech stack:** Static HTML/CSS/vanilla JS (ES modules, no build step, no framework), Supabase (Postgres + Auth + Storage + Edge Functions) as the backend. Files: `index.html` (full app shell), `style.css` (single stylesheet, token-based design system via CSS custom properties in `:root`/`body.dark-theme`), `js/{main,router,ui,api,ai,timer,supabase}.js`.

## Explicit instruction for this task

Follow the same discipline as the original audit: **understand before acting, plan before major changes, ask questions when you need to.** This is a real redesign of a live product with real user data — don't just start rewriting screens. Specifically:

1. Read the current codebase fresh (don't trust this document's file:line citations blindly — they may have drifted; verify before relying on them).
2. Write a short **Product Understanding Summary** confirming/updating the one above.
3. Propose a redesign plan and get it approved before implementing — use plan mode if your tooling supports it.
4. Preserve all existing functionality and business logic. This is a visual/UX pass, not a rewrite of what the app does.
5. Validate changes in an actual browser (screenshot before/after, both light and dark theme) — this app has no automated test suite.

## Goal

Aim for a clean, professional, high-quality product experience comparable to Linear, Stripe, Notion, and Vercel — but don't copy their appearance blindly, and don't erase Learnora's existing branding/domain-specific workflows (e.g. the AI chat's distinct glass/purple-accent styling, the exam-difficulty color coding, the flashcard flip interaction).

## What's left for this pass

The small, mechanical design-system inconsistencies (empty states, duplicate toasts, misleading utility class names, a couple of copy/bug fixes) have already been cleaned up — see "Already fixed" below. **What's left is the actual visual redesign**: information hierarchy, spacing/typography rhythm, navigation/discoverability, forms/validation polish, loading/empty/error state *design* (not just consistency — actual quality), accessibility, responsiveness, and general "does this look like a professional product" polish across every view. There's no pre-made checklist for this part — that's the point of doing a fresh visual audit (see Suggested approach below) rather than working off a stale list.

## Already fixed — don't re-do this work

- Weekly-plan/exam date logic: UTC-timezone week-key bug, stale-exam AI context, exam-modal date bounds, day-detail modal date display — all fixed (`localDateStr`/`mondayOfWeek` helpers in `js/ui.js`).
- Task due dates: `tasks.due_date` column, due-date badges/sorting on the task list — added.
- Weekly plan view: rebuilt as a 7-day week strip with today/past styling, scoped skeleton loader, real empty state — done (may still be a good visual reference/candidate for further redesign polish, but the structure/data-flow is sound).
- AI chat modal: migrated onto the app's `ModalManager` (focus-trap, scroll-lock, Escape-to-close); fixed unreadable text in light theme (now uses `--glass-bg-strong`/`--glass-bg` tokens instead of hardcoded dark rgba values); replaced the fake "streaming" cursor with an honest "thinking" dots indicator (the backend edge function returns one complete response, not a real token stream — see `learnoraedgefunctionlogic.ts` if you're ever asked to make it "really" stream, that's a separate backend architecture project, not a frontend redesign task).
- Splash screen wordmark: was invisible (undefined `--gradient-primary` token), now fixed.
- Quiz-attempt save failures, swallowed fetch errors across `api.js`, folder-delete Storage cleanup, keyboard-accessible exam editing — all fixed as correctness/a11y work, not visual, but you'll be touching some of the same views.
- Empty states inside folder-detail (materials/decks/quizzes lists) now use the shared `.empty-state-sm` class instead of one-off markup.
- Task-delete "Undo" toast now goes through the real `UI.showToast()` system instead of a hand-rolled inline-style element (bottom-right now, matching every other toast, not bottom-center).
- `.opacity-70`/`.opacity-60` renamed to the honest `.text-muted` everywhere (~25+ call sites) — it only ever set `color`, never actual opacity.
- Mislabeled "Checking permission status..." notification text and the dead `resettingPass` variable (uncaught `ReferenceError` on a failed password reset) — both fixed.

## Suggested approach

1. Do a fresh visual audit — screenshot every view in both themes, note what feels dated/inconsistent (spacing, typography scale, color usage, component variety) rather than relying on this document's memory of specific issues.
2. Decide on a small number of core design moves (e.g. tighten the spacing scale, pick a more restrained accent-color usage, standardize card/panel treatments) rather than redesigning every screen independently — consistency matters more than any single screen looking perfect.
3. Sequence: design-system/token cleanup first (spacing, empty states, toasts — the items listed above), then apply it view-by-view.
4. Get sign-off on the direction (a couple of screens) before applying it everywhere.
