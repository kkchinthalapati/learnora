# Error monitoring

Client errors are reported to [Sentry](https://sentry.io). The code is wired
and shipped; **reporting stays off until a DSN is configured**, which is a
deliberate property rather than an unfinished edge — see "Why it is off by
default" below.

## What is already wired

| Piece                                          | Where                                           |
| ---------------------------------------------- | ----------------------------------------------- |
| SDK init, PII scrubbing, noise filtering       | `webapp/src/lib/monitoring.ts`                  |
| Started before first render                    | `webapp/src/main.tsx`                           |
| React render-phase crashes                     | `webapp/src/components/ErrorBoundary.tsx`       |
| Unhandled promise rejections + uncaught errors | `installGlobalErrorHandlers`                    |
| Sentry ingest allowed through CSP              | `vercel.json` (`connect-src`)                   |
| Sourcemaps emitted for symbolication           | `webapp/vite.config.ts` (`sourcemap: "hidden"`) |

Note this is `@sentry/react`, not `@sentry/nextjs`: Learnora's webapp is Vite +
React, so there is no `next.config.js` and no `_app.tsx` to wrap.

## The three steps that need a Sentry account

These cannot be done from the repository — they need someone signed in to
Sentry.

### 1. Create the project and get a DSN

Sign up (the free tier is enough), then **Projects → Create Project →
React**. Copy the DSN it shows; it looks like
`https://<key>@o<org>.ingest.us.sentry.io/<project>`.

### 2. Set the DSN in Vercel

Vercel project → **Settings → Environment Variables**:

- Name: `VITE_SENTRY_DSN`
- Value: the DSN from step 1
- Environments: Production (and Preview, if you want preview crashes too)

Leave it unset in Development. Redeploy — Vite inlines `VITE_*` at build time,
so an existing deployment will not pick it up without one.

> If your DSN's ingest host is not `*.ingest.sentry.io`,
> `*.ingest.us.sentry.io` or `*.ingest.de.sentry.io`, add it to `connect-src`
> in `vercel.json`. The Content-Security-Policy blocks anything else, and a
> blocked report fails **silently** — the dashboard simply stays empty.

### 3. Create the error-rate alert

Sentry → **Alerts → Create Alert → Number of Errors**:

- Condition: `events` in the last `1 hour` is `above` a threshold you pick
- Action: send an email / Slack notification

A note on the ">5% error rate" requirement: Sentry's issue alerts count
_events_, not a percentage of sessions. A true rate needs either a
[Metric Alert](https://docs.sentry.io/product/alerts/alert-types/) on the
`failure_rate()` of transactions — which requires performance tracing, and
tracing is off here (`tracesSampleRate: 0`) — or the **Crash Free Sessions**
metric alert, which is the closest honest equivalent: alert when crash-free
sessions drop below 95%. That needs session tracking enabled, which is one
line in `monitoring.ts` (`autoSessionTracking`) and adds a small beacon per
session. Pick whichever you prefer; the count-based alert works today with
nothing further to change.

## Verifying it works

With `VITE_SENTRY_DSN` set in a deployed build, open the browser console on
the deployed app and run:

```js
setTimeout(() => {
  throw new Error("Sentry smoke test");
});
```

The `setTimeout` matters: an error thrown directly at the console prompt is
not an uncaught page error, so the global handler never sees it.

Within a minute the issue should appear in Sentry with a stack trace. If
nothing arrives, check in this order:

1. **Network tab** — is there a request to `*.ingest.*.sentry.io`? If it was
   blocked, the console shows a CSP violation: fix `connect-src`.
2. **Is the DSN actually in the bundle?** `VITE_*` vars are inlined at build
   time, so a var added after the last deploy is not there yet. Redeploy.
3. **Is it being filtered?** `ignoreErrors` in `monitoring.ts` deliberately
   drops stale-chunk errors and opaque cross-origin script errors.

## Readable stack traces

`sourcemap: "hidden"` emits `.map` files without linking them from the
bundle, so browsers never fetch them and the source is not exposed to
visitors. Sentry still needs them **uploaded** to turn minified frames into
real ones. Until they are uploaded, traces are technically present but read
like `a.b is not a function at index-4f2a.js:1:88213`.

To upload, add `@sentry/vite-plugin` with a `SENTRY_AUTH_TOKEN` (Sentry →
Settings → Auth Tokens, scope `project:releases`) set as a Vercel environment
variable. The plugin uploads the maps at build time and can delete them from
the output afterwards, which is the usual arrangement.

This is left as a deploy-config step rather than committed, because it needs a
secret this repository should not carry.

## Why it is off by default

`initMonitoring()` returns early when there is no DSN, so nothing loads,
nothing is sent, and no network call is attempted in development or in the
test suite. A monitoring tool that slows local development or fills a
dashboard with a developer's own typos gets switched off within a week, so it
costs nothing until it is deliberately turned on.

## What is not sent

- `sendDefaultPii` is `false`, so the SDK does not attach IP addresses,
  cookies or request headers.
- `beforeSend` scrubs credential-bearing URL parameters — `access_token`,
  `refresh_token`, `token`, `token_hash`, `code` — from both the query string
  **and the fragment**, in the event URL and in navigation breadcrumbs.
  Supabase returns auth tokens in the fragment, which a query-only scrub
  misses entirely.
- Performance tracing is off, so no timing beacons are sent.

Error reports still leave the user's browser for a third party, and error
messages can incidentally contain user content. That is a processor
relationship worth reflecting in the privacy policy before this is switched on
for real users.
