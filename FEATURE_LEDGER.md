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
| 4 | Flashcard weak-spot signal | ✅ Done | Added `fetchWeakDecks` to feed low ease-factor flashcard decks into `aiPlan.ts` |
| 5 | Per-user timezone | ✅ Done | Added `timezone` to `public.profiles` and integrated into the `PreferencesTab` settings. |
| 6 | Smart timer defaults | ✅ Done | `sessionsApi.fetchAverageSessionLengths` overrides `draftConfig` in `TimerProvider.tsx` if users habitually use different durations. |
| 7 | Calendar import/export | ✅ Done | Added `.ics` export generating utility from `api/exams` and `api/aiPlan` and embedded download UI in `PreferencesTab`. |
| 8 | Multi-device push management UI | ✅ Done | Updated `NotificationsTab` to fetch all subscriptions and provide a 'Revoke' button to manage and untether other devices remotely. |
| 9 | Adaptive AI persona/tone | ✅ Done | Wired `aiPersona` + `aiConciseness` from user settings into `buildSystemContext` — each persona now maps to a distinct VOICE instruction block in the chat system prompt. Coach mode gives direct accountability nudges; buddy mode goes casual; professor mode goes formal; tutor mode stays patient and explanatory. Conciseness preference drives response length instructions (2–4 / 2–6 / comprehensive). |
| 10 | Automated persona drift | ✅ Done, session-local | `lib/personaDrift.ts` observes re-asks, brief messages, and connected follow-ups during the current chat session, then adds a conservative coaching nudge. It never overwrites an explicit persona setting or persists raw conversation text. |

## Backlog (pitched, not started)

All ledger-scoped items are now shipped. A future, larger iteration could add a backend analysis loop for cross-session signals and account-level learning; that remains deferred because the current implementation intentionally keeps behavior session-local and private.

## How to pick this back up

1. Read this ledger top to bottom before touching anything — it's the
   authoritative "what's actually done" list; feature docs elsewhere
   (`FRIENDS_FEATURE.md` being the cautionary example) can drift stale.
2. Check off / update a row the moment something changes state — don't let
   this become another stale doc.
3. For the backlog items: none are scoped in detail yet (unlike
   `FRIENDS_FEATURE.md`'s full design doc before that feature was built) —
   treat each as a pitch to scope, not a ready-to-build spec.
