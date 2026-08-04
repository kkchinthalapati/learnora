# Friends Feature — Shipped Design Reference

A "Friends" social space for Learnora: track friends' study habits, view a leaderboard, add
friends via a shareable personal link that prompts the recipient to confirm before anything is
shared. The feature is implemented; this document is retained as the design and security
reference for the shipped migration and frontend.

## Grounding: what already exists

- **Migrations**: `supabase/migrations/*.sql`, timestamped snake_case names (e.g.
  `20260727000000_backend_hardening.sql`). Convention: `uuid` PKs via `gen_random_uuid()`,
  `user_id uuid references auth.users(id) on delete cascade`, RLS enabled on every table with
  `(select auth.uid()) = user_id`-style owner-only policies, `created_at timestamptz default now()`.
- **`public.profiles` table already exists** (id, email, full_name, avatar_url — confirmed via
  the `"Users can manage own profile"` RLS policy in the hardening migration), populated from
  `auth.users` on signup. Currently locked to owner-only SELECT — friends need a narrow, explicit
  carve-out to see each other's name/avatar, not a blanket policy loosening.
- **Study-habit source data**: `study_sessions` (`started_at`, `minutes`, `folder_id`,
  `timer_type`) via `webapp/src/api/sessions.ts`. Streak/sparkline logic is pure, client-side
  functions in `webapp/src/views/dashboard/analytics.ts` (`computeStreak`, `computeSparkline`,
  `STREAK_MIN_MINUTES`) — no server-side streak table today.
- **API+hook pattern** (e.g. `webapp/src/api/quizzes.ts` + `webapp/src/hooks/useQuizzes.ts`): a
  `<feature>Api` object of methods (each calling `requireUserId()` from `webapp/src/api/session.ts`
  then `supabase.from(...)`) + a hook file with a query-key factory and `useQuery`/`useMutation`
  wrappers that invalidate on success. New code should follow this exactly.
- **Routing**: `webapp/src/routes.tsx` nests signed-in routes inside `<ProtectedRoute><AppShell>`;
  param routes look like `/quiz/:quizId`. No existing token-in-URL signed-in route to model on
  directly, but `ProtectedRoute`'s `state: { from }` redirect-back pattern is reusable for
  "sign in, then land back on the invite link."
- **Nav**: `webapp/src/components/Sidebar.tsx`'s `NAV_ITEMS` array — one more entry adds a page.
- **UI primitives to reuse**: `Card` (row-list leaderboard entries via `variant="row"`),
  `PageHeader`, `Modal` (+ `components/create/CreateModal.tsx` as the reuse example), `IconButton`,
  `EmptyState`, `useToast` (`context/toast.ts`, e.g. `showToast("Copied!")`).
- **No existing invite-link/token/clipboard pattern anywhere in the app** — this feature
  introduces that utility fresh (`navigator.clipboard.writeText`, a short code column + generator).
- **No generated Supabase types** — the app hand-maintains interfaces in `webapp/src/api/types.ts`
  per table; new tables get new interfaces there, not a codegen step.

## Key architectural decision: keep RLS narrow, do cross-user reads through `SECURITY DEFINER` RPCs

Friends need to read *each other's* data (name, avatar, study stats) — something the existing
"owner-only" RLS convention doesn't support. Rather than loosening `profiles`/`study_sessions`
RLS policies (which would leak data broadly to any authenticated user, not just accepted friends),
this design adds a small number of **Postgres `SECURITY DEFINER` functions**, exposed to the
client via `supabase.rpc(...)`, that internally check friendship state and return only the
minimal fields needed:

- `resolve_friend_code(code text)` → the inviter's `{id, full_name, avatar_url}` for the "Add
  Alex as a friend?" confirm prompt — before any friendship exists.
- `request_or_accept_friend(code text)` → the one function that mutates `friendships`. Looks up
  the code's owner, then: if a reverse pending request already exists (they already sent *you*
  one), marks it `accepted` (auto-mutual-match, no duplicate row); otherwise inserts a new
  `pending` row from caller → owner. Returns the resulting status. All friendship writes go
  through this + the two siblings below — the `friendships` table itself has **no client-facing
  INSERT/UPDATE policy**, only SELECT for rows you're part of, so the business rules (no
  self-friending, no duplicate rows, mutual-match collapsing) live in one place, not scattered
  across client code + RLS.
- `respond_to_friend_request(request_id uuid, accept boolean)` → accept/decline an incoming
  pending request.
- `remove_friend(friendship_id uuid)` → delete an accepted friendship (either side can do this).
- `get_friends_leaderboard()` → for each accepted friend, aggregates `study_sessions` server-side
  (this week's focus minutes, current streak reusing the `computeStreak` day-threshold logic
  ported to SQL) and returns a ranked list — the client never queries another user's
  `study_sessions` row directly.
- `regenerate_friend_code()` → issue the caller a new code, invalidating the old link.

This keeps every other table's RLS untouched and contains all the new cross-user logic to one
migration file that's easy to review and reason about.

## Data model (new migration: `supabase/migrations/<timestamp>_add_friends_feature.sql`)

- `alter table public.profiles add column friend_code text unique not null default ...` — an
  8-char code (e.g. base32 from `gen_random_bytes`), generated once per row via a trigger on
  insert, regenerable via the RPC above. Index on `friend_code` for the lookup.
- `public.friendships`: `id uuid pk`, `requester_id uuid references auth.users`,
  `addressee_id uuid references auth.users`, `status text check in ('pending','accepted','declined')
  default 'pending'`, `created_at`, `responded_at`, `check (requester_id <> addressee_id)`,
  `unique (requester_id, addressee_id)`. RLS: `enable row level security`; one SELECT policy
  (`auth.uid() in (requester_id, addressee_id)`); **no INSERT/UPDATE/DELETE policies** — all
  writes via the RPCs, which run as the table owner and enforce the rules above.
  Indexes on `requester_id`, `addressee_id`, `status`.
- New interfaces in `webapp/src/api/types.ts`: `Friendship`, `FriendProfile` (id, full_name,
  avatar_url, friend_code), `LeaderboardEntry` (friend id/name/avatar, weekly_minutes, streak,
  rank).

## Backend workflow — Supabase CLI

1. Write the migration SQL by hand in `supabase/migrations/<timestamp>_add_friends_feature.sql`
   following the existing hardening migration's style (comment header explaining *why*, additive/
   idempotent DDL).
2. `supabase start` (or connect to the linked project) → `supabase db push` to apply it locally/
   to the linked project — this repo's existing convention (per `SUPABASE_SETUP.md`) is CLI-driven,
   ad hoc application rather than a scripted `package.json` step, so this follows that.
3. `supabase db lint` and a quick `supabase db diff` sanity check before pushing, matching the
   "ran `supabase db advisors --linked`" discipline referenced in the existing hardening migration.
4. No new edge function needed — RPCs cover all the cross-user logic Postgres-side, so
   `supabase functions deploy` is out of scope for this feature.
5. Manually smoke-test each RPC via the Supabase SQL editor or `supabase.rpc()` in a scratch
   script before wiring up the frontend.

## Frontend plan

- `webapp/src/api/friends.ts` (`friendsApi`) + `webapp/src/hooks/useFriends.ts` — same
  query-key-factory/`useQuery`+`useMutation` shape as `useQuizzes.ts`, wrapping the RPCs above
  plus a plain `friendsApi.fetchAccepted()`/`fetchPendingIncoming()` table read.
- New route `/friends` (list: your invite link + copy button, accepted friends' leaderboard,
  incoming pending requests) and a protected `/friends/add/:code` landing route (resolves the
  code via `resolve_friend_code`, shows a confirm card, calls `request_or_accept_friend` on
  confirm) — both added to `routes.tsx` inside the existing `AppShell` block; an unauthenticated
  visitor hitting the invite link gets bounced through `ProtectedRoute`'s existing `state:{from}`
  redirect-back-after-login flow, no new auth plumbing needed.
- `Sidebar.tsx`: one new `NAV_ITEMS` entry (`{ to: "/friends", icon: "users", label: "Friends" }`
  — confirm/add a `users` icon in `components/icons.tsx` if missing).
- `views/friends/FriendsView.tsx` (`PageHeader` + copyable invite link using
  `navigator.clipboard.writeText` + `showToast("Copied!")` + leaderboard as `Card variant="row"`
  entries, ranked, mirroring `StreakCard`'s visual language + `EmptyState` for zero-friends) and
  `views/friends/FriendInviteLanding.tsx` (confirm dialog for the link flow).
- Tests follow the existing pattern: `mockAuthSession`/`renderWithAuth` + MSW handlers for the
  new REST/RPC endpoints, one `.test.tsx` per new view.

## Assumptions to confirm/adjust before implementation

1. **Request+accept, not instant-add.** A visited link sends a request the link-owner must
   approve, rather than instantly creating a friendship — safer default for who can see your
   study data. Easy to relax to instant-add later if that's not the intent.
2. **Leaderboard metric = weekly focus minutes + current streak** (reusing `analytics.ts`'s
   streak definition, ported server-side). Tasks-completed/exam-prep metrics are a natural
   extension but out of MVP scope.
3. **One evergreen personal invite link per user** (regenerable), not per-invite single-use
   tokens — matches "prompt you to add them" framing better than a request-a-specific-person flow.

## Suggested build order (future sessions)

1. Migration: `friend_code` column + generator trigger, `friendships` table + RLS, the five RPCs.
   Verify entirely via SQL editor / `supabase.rpc()` scratch calls before touching the frontend.
2. `api/friends.ts` + `hooks/useFriends.ts`, with unit coverage on the query-key factory shape.
3. `FriendsView` (your link + leaderboard + pending requests) — flagship screen, prove the Card/
   PageHeader/EmptyState composition here first.
4. `FriendInviteLanding` + route wiring + Sidebar nav entry.
5. Polish: remove-friend confirm dialog, decline-request affordance, regenerate-code confirm
   (invalidates the old link — warn before doing it).
