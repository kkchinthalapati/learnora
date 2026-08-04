# Daily-Use Feature Ledger

Living document, same spirit as `REACT_MIGRATION.md`/`REDESIGN_LEDGER.md`:
tracks a specific initiative — making Learnora adapt to a student's actual
habits and pull them back in daily — across sessions, so a different
session can resume without re-deriving context from the conversation.
Update the ledger as items close or new ones open; don't leave it stale.

**Started:** 2026-08-04. **Last updated:** 2026-08-04.

---

## Shipped

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Push notifications + PWA installability | ✅ Built, ⚠️ not deployed | See `PUSH_NOTIFICATIONS.md`. Manifest, service worker, subscribe/unsubscribe flow, and a scheduled `send-push-reminders` edge function are all written and tested. **Nothing is live yet** — VAPID keys, Supabase secrets, and cron scheduling are manual steps a human runs, same posture as the friends migration. Do that before expecting real pushes to fire. |
| 2 | Adaptive Weekly Plan (weak topics + last-week adherence) | ✅ Done, live once merged | `lib/planAdherence.ts` + `api/aiPlan.ts`'s `loadAdaptiveContext`. No deploy step beyond the normal merge — everything here is pure frontend/edge-function-request logic, no new secrets or schema. |
| 3 | Friends (social accountability: invite link, leaderboard, streaks) | ✅ Already shipped | Turned up already fully built (migration `20260803000000_add_friends_feature.sql` + full frontend) when re-checked this session — `FRIENDS_FEATURE.md`'s "design doc, not yet implemented" framing was stale. Don't re-build this; if `FRIENDS_FEATURE.md` still says otherwise, that file is the thing to correct, not the code. |

## Backlog (pitched, not started)

Original pitch this ledger tracks — see conversation history for the full
reasoning behind each, condensed here to what's actionable:

- **Adaptive AI persona/tone.** `PreferencesTab`'s tutor/coach/buddy/professor
  picker is a static dropdown — doesn't learn from how the student actually
  responds to the AI (short replies → maybe drop to "short" conciseness
  automatically; ignored coach-mode nudges → soften the tone).
- **Smart timer defaults.** Pomodoro/countdown lengths are fixed presets, not
  tuned to which session lengths a given student actually completes vs.
  abandons (`study_sessions` already has this — nothing reads it for this).
- **Flashcard weak-spot signal.** `computeWeekAdherence`/`loadAdaptiveContext`
  only use quiz-derived weak topics (`quiz_attempts.weak_topics`). Cards with
  low `ease_factor` or frequent lapses in `flashcards` are a second,
  currently-unused weak-spot signal that could feed the same planner prompt.
- **Calendar import/export.** Exams and plan blocks live only inside
  Learnora; a `.ics` export (or Google Calendar sync) would put them where a
  student's actual schedule lives instead of a second silo.
- **Multi-device push management UI.** The `push_subscriptions` schema
  already supports several devices per user, but there's no "push is on for
  these 3 devices" list — only the current device's own toggle state.
- **Per-user timezone.** Documented as a known limitation in
  `PUSH_NOTIFICATIONS.md` — exam-reminder timing and the daily cron are UTC
  today, off by up to a day for a student far from UTC. No stored timezone
  column exists anywhere in the schema yet (the friends leaderboard takes one
  as an RPC argument, but nothing persists it).

## How to pick this back up

1. Read this ledger top to bottom before touching anything — it's the
   authoritative "what's actually done" list; feature docs elsewhere
   (`FRIENDS_FEATURE.md` being the cautionary example) can drift stale.
2. Check off / update a row the moment something changes state — don't let
   this become another stale doc.
3. For the backlog items: none are scoped in detail yet (unlike
   `FRIENDS_FEATURE.md`'s full design doc before that feature was built) —
   treat each as a pitch to scope, not a ready-to-build spec.
