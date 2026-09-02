# Audit — `6693c81` "dynamic landing page", plus the limits/customization questions

**Date:** 2026-09-02 · **Scope:** `6693c81` in full, with supporting checks
against Batch 5 (`a981676`), Batch 6 (`e48b671`) and the billing commit
(`9c906ac`) where the landing page makes claims about them.

**Health baseline:** `npx tsc -p tsconfig.app.json --noEmit` clean;
`vitest run` — 177 files, 2215 tests, all passing. Nothing below is a broken
build or a failing test. Every finding is a wiring, truthfulness or
single-source-of-truth problem.

---

## 1. Blocking — the page is not shipped and cannot be reached

`6693c81` adds `landing.html` (702 lines) and nothing else. Three separate
things each independently prevent it from ever being served:

1. **It is not in the build.** `scripts/build.sh`'s `VANILLA_PATHS` is an
   explicit copy list, and `landing.html` is not on it, so `dist/` never
   contains the file. The script's own header states the rule: *"Adding a
   file to the vanilla app means adding it here."*
2. **There is no route to it.** `vercel.json` rewrites `/` →
   `/api/home` and catches everything else with `/:path*` →
   `/api/not-found`. There is no `/landing` (or any) rewrite pointing at it.
3. **Nothing links to it.** No file in the repo references `landing.html`.

Net effect: the commit is inert in production. `/` still serves the older
`homeHtml()` in `api/_site-content.js`.

**Fix:** add `landing.html` to `VANILLA_PATHS`, and decide the route — either
a `/landing` rewrite, or repoint `/` at it and retire `homeHtml()`. The second
is the one that matters commercially; note that `homeHtml()` also serves the
`text/markdown` variant for agents (`llms.txt`, `Accept:` negotiation), so
that path has to survive whichever way this goes.

## 2. Blocking — every call to action on the page is a dead link

Six CTAs point at `index.html` (`landing.html:498, 508, 625, 642, 659, 668`,
plus the footer at `:678`). Root `index.html` is **also** absent from
`VANILLA_PATHS` — deliberately, because the app moved to `/app/` and the
legacy shell only redirects (`js/router.js`'s `CUTOVER_ROUTES`). In
production, `/index.html` falls through the catch-all to `/api/not-found`.

So on the current build, "Sign In", "Get Started Free", "Upgrade to Pro",
"Get Annual Plan" and "Start Free Today" all land on a 404.

**Fix:** point all six at `/app/`, which is what `api/_site-content.js:92,109`
already does. "Upgrade to Pro" should go to `/app/settings/billing` so the
checkout intent survives the click.

## 3. High — the hero contradicts the page and the codebase

`landing.html:511-513` renders a placeholder panel reading *"📊 Trajectory
forecasting — coming soon"* — directly under a headline selling trajectory as
the reason to use Learnora, and directly above a Pro plan card that charges
£5.99/month for it.

Trajectory is not coming soon; it shipped in Batch 5. `webapp/src/lib/trajectory.ts`
(42 tests), `useTrajectory.ts`, `TrajectoryView.tsx`, `TrajectoryChart.tsx`,
route `/trajectory`, gated Pro via `ProGate`. The one placeholder on the page
is telling visitors the headline feature does not exist yet.

**Fix:** a screenshot of the real `TrajectoryChart`, or drop the panel. Do not
ship "coming soon" copy for a feature you are charging for.

## 4. High — pricing and quota copy is hardcoded, against an explicit invariant

`webapp/src/lib/entitlements.ts` opens by stating why it exists: *"so a
marketing page, a paywall modal and the code that enforces it can never
disagree about it."* `landing.html` hardcodes all of it — `$0`, `£5.99`,
`£49.99`, "Save 30%", "25/day", "400/day", "3 notebooks" — and is a static
file that cannot import the module.

Today the numbers happen to match `QUOTAS` and `PRICES`. They will drift on
the first price change, and the drift is already visible one layer over:

| Claim | `entitlements.ts` | `STRIPE_SETUP.md:34` | `landing.html` |
| --- | --- | --- | --- |
| Annual price | £49.99 (`amountPence: 4999`) | **£49.00** | £49.99 |

One of those two docs is wrong about what a customer is charged. Stripe is the
real source of truth and neither file is checked against it.

Also on the page: `$0` for Free next to `£` everywhere else — mixed currency
in one pricing table.

**Fix:** reconcile `STRIPE_SETUP.md` with `entitlements.ts` now. For the page,
either generate the plan cards server-side from the same table (`/api/home`
already renders HTML in Node and could import a shared JSON), or add a test
that fails when the constants and the marketing copy disagree.

## 5. Medium — unverifiable and dead-link content

- `landing.html:667` — *"Join thousands of students"*. Nothing in the repo
  supports a user count, and the app's own tone everywhere else is
  deliberately honest (see `TRAJECTORY.md`'s "Where the honesty is").
  A claim that cannot be substantiated is also an ASA problem in the UK.
- `landing.html:683-684` — `About` and `Blog` link to `#`. `about.html` exists
  and ships; there is no blog.
- No `og:` / `twitter:` meta tags. The two links on the page are Discord and
  Instagram — the exact places a shared link renders as a preview card, and it
  will render bare.
- Social links are emoji with `title` only (`:691-692`); use `aria-label`.

## 6. Medium — the page forks the design system

`landing.html` defines its own palette, its own type scale and its own
`Outfit` + `Plus Jakarta Sans` Google Fonts load in a 480-line inline
`<style>`, sharing nothing with `style.css`, `design-system.md`, or the
React app's tokens. Two consequences: a brand change now has to be made
twice, and the marketing page's dark-only glassmorphism does not match what a
visitor sees when they land in the app — where Batch-era work gave them
`AppearanceTab`'s light/dark/system modes.

Not blocking. Worth knowing before this page becomes the front door.

---

## The three product questions

### "AI limits, reasonable, and they must be different for each feature"

**Current state:** limits exist and are genuinely enforced server-side — this
is better than it looks from the client. `supabase/functions/learnora-ai/index.ts`
runs a burst limit (30/10min free, 90 Pro) and a daily allowance (25 free, 400
Pro) counted from midnight UTC out of `ai_request_log`, re-deriving the plan
from `profiles` on every call rather than trusting the browser. All four
numbers are secret-overridable without a redeploy.

**The gap is exactly the one identified:** there is **one** pool. A quiz
generation, a 30-page PDF upload and a one-line chat message each cost the
student exactly one unit, despite differing by ~100× in tokens. A student who
uploads four PDFs has spent the same allowance as one who asked four
questions. The client never shows the meter either — `quotaUsage()` is
exported and tested but called from nowhere in the app, so the first a
student knows of the limit is being refused at 11pm.

**Cheap, because the data is already there:** `ai_request_log` already stores
`mode` (`index.ts:574`), and the modes are already distinct — `chat`
(default), `quiz`, `plan`, `flashcards`, `notes`, `rewrite`. Per-feature
limits are a `Record<mode, number>` and a second `count` with `.eq("mode", …)`.
No schema change.

A starting table, sized so a real student never hits it and a script does:

| Feature (mode) | Free / day | Pro / day | Why |
| --- | --- | --- | --- |
| Chat (`chat`) | 30 | 300 | Cheapest call; the one that should feel unlimited |
| Flashcards (`flashcards`) | 10 | 100 | Long JSON output, one per deck |
| Quiz (`quiz`) | 10 | 100 | Same shape as flashcards |
| Notes / rewrite | 15 | 150 | Mid-cost, high-frequency while writing |
| Study plan (`plan`) | 5 | 40 | Weekly by nature; 5/day is already generous |
| **File uploads** | **5 files / 30MB** | **40 files / 300MB** | The genuinely expensive one, and currently unlimited |
| Global ceiling | 60 | 500 | Backstop above the per-feature sum |

Uploads are the real hole: the only limit today is per-file size, defined
three times independently (`api/studyPackage.ts:70`, `views/notes/NotesAiSidebar.tsx:44`,
`context/ChatProvider.tsx:70` — all 10MB, all separate constants), with no
daily count and no total-bytes cap. One student can upload a hundred 10MB
PDFs a day within every limit that exists.

**Also worth doing at the same time:** the count-then-insert in
`checkAndLogRateLimit` is not atomic, so concurrent requests can both pass the
check; and there is no meter in the UI. The second matters more than the first.

### "Customization — full, with your entire choice"

Mostly already built, and worth knowing before more is scoped.
`views/settings/AppearanceTab.tsx` ships dark/light/system, five fonts
(including OpenDyslexic), three text sizes, three sidebar treatments,
background textures and accent presets, plus a full `CustomThemeStudio.tsx`
for hand-picked colours. `DashboardCustomizeModal` covers card layout.

Genuine gaps, in order:

1. **None of it syncs.** `lib/appearance.ts` and `lib/settings.ts` are
   `localStorage` only (`learnora_mode`, `learnora_theme`, `learnora_font`,
   `learnora_settings`). Phone and laptop are two different-looking apps, and
   clearing site data resets everything. `profiles` already carries
   `timezone`, so a `preferences jsonb` column is the natural home.
2. **The marketing page and the vanilla shell ignore themes entirely** (see
   finding 6) — a light-mode user gets a dark front page.
3. No import/export or share of a custom theme, which is the thing that makes
   a theme studio spread on Discord.

### "New 'trajectory' feature"

Already shipped and documented (`TRAJECTORY.md`); see finding 3. If the ask
is for something *beyond* it, `TRAJECTORY.md`'s own "Known limits" names the
honest next one: no syllabus coverage model, so the forecast cannot account
for exam topics the student has never made a card about.

---

## Two billing defects found while checking the page's claims

Neither is in `6693c81`, both are in `9c906ac`, and both are silent
"paid but not upgraded" paths in `supabase/functions/stripe-webhook/index.ts`:

1. **`resolveUserId` returning `null`** (`:148`) logs and returns without
   throwing. The event was already claimed in `stripe_events` before
   processing, and the function returns 200 — so Stripe never retries, and
   the claim row makes any redelivery a no-op. The customer is charged and
   never upgraded, with only a log line. Compare the `catch` block at `:221`,
   which correctly *releases* the claim before returning 500. This path
   should throw so it takes that route.
2. **`applySubscription`'s `.update().eq("id", userId)`** (`:156-173`) does
   not check how many rows it touched. Postgres returns success for zero
   rows, so a stale or wrong `supabase_user_id` in Stripe metadata applies
   nothing and reports no error. Add `.select("id")` and throw on an empty
   result.
