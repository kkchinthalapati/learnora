# End-to-end critical path

36 scenarios that answer one question: **is Learnora still usable?**

These are a thin, slow layer above the ~2400 Vitest specs, not a second copy of
them. A Vitest spec proves a component behaves; these prove a student can sign
in, pay, generate, quiz, and be told the truth when something breaks — in a real
browser, driving the real app.

## Running them

```bash
cd webapp
npm run test:e2e:install    # once — downloads Chromium
npm run test:e2e            # the whole suite
npm run test:e2e -- --project=desktop     # 31 desktop scenarios
npm run test:e2e -- --project=mobile      # 5 phone-viewport scenarios
npm run test:e2e:ui         # watch them run, step through failures
```

The dev server starts automatically (`playwright.config.ts`'s `webServer`), so
nothing else needs to be running first.

On a machine that already has a Chromium build (a CI image, a sandbox), skip the
download and point at it:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```

## How the backend is faked, and why

`src/lib/supabase.ts` hard-codes one project URL, and every call the app makes
goes through it — PostgREST, GoTrue, and the three edge functions. One
`page.route` glob therefore catches the entire backend, which is what
`support/mockBackend.ts` does.

That boundary buys three things a live Supabase cannot:

1. **Determinism.** No shared state between runs, no ordering surprises.
2. **Safety.** No test account writing rows into the production project. Nothing
   under the Supabase origin is ever allowed to `continue()` — an unrecognised
   endpoint is answered with an empty result and recorded in `backend.unhandled`,
   never forwarded.
3. **The failures.** Half of these tests are about what happens when the server
   answers 429, answers 500, or never answers at all. You cannot ask a real
   backend for those on demand.

The mock implements the subset of PostgREST the app actually uses — `eq`/`gte`/
`lte`/`in`/`is` filters, `order`, `limit`, exact counts over `HEAD`, and the
`vnd.pgrst.object+json` single-row shape. Anything beyond that is a deliberate
omission; add to it when a feature needs it.

Two details worth knowing:

- **The daily AI limit is enforced, not asserted.** The mocked `learnora-ai`
  counts rows in `ai_request_log` since midnight UTC and answers 429 past the
  plan's allowance, exactly as the real edge function does. The rate-limit tests
  therefore exercise the app's handling of a real limit rather than a fixture
  that returns 429 on cue.
- **Sign-in is driven through the form**, never injected into `localStorage`.
  The session shape is supabase-js's private business; a fixture that guessed it
  would keep passing after an upgrade changed it while real sign-in broke.

## What is covered

| Area | Scenarios | File |
| --- | --- | --- |
| Auth — signup, login, password reset, logout | 4 | `critical-path.spec.ts` |
| Rate limiting — free ceiling, Pro ceiling, midnight reset | 3 | `critical-path.spec.ts` |
| Stripe — upgrade, cancel via portal | 2 | `critical-path.spec.ts` |
| Quizzes — create, take, feedback, save attempt, results | 5 | `critical-path.spec.ts` |
| Grade forecast — range, weak topics, how to improve | 3 | `critical-path.spec.ts` |
| AI grounding — knows history, admits gaps, states confidence | 3 | `critical-path.spec.ts` |
| Errors — offline, empty form, slow network, 500, AI failure | 5 | `critical-path.spec.ts` |
| Data safety — draft survives reload, stale session | 2 | `critical-path.spec.ts` |
| Guardrails — consent gate, wrong password, delete re-auth, deep link | 4 | `critical-path.spec.ts` |
| Mobile — tap targets, no sideways scroll, fit, nav, quiz | 5 | `mobile.spec.ts` |

## What these tests do *not* claim

The AI tests assert that the app **hands the model this student's real numbers**
— accuracy, named topics, evidence strength — not that the reply is good. A
mocked model cannot demonstrate answer quality, and a test that pretended
otherwise would be testing the fixture. Grounding is the part the app is
responsible for, so grounding is what is asserted.

## Adding a scenario

Earn its place. This suite is the slowest feedback loop in the repo, so a new
test belongs here only if it covers a journey whose failure would make the
product unusable, and only if a Vitest spec genuinely cannot express it.
