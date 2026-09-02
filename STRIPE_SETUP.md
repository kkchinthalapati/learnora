# Learnora Pro — Stripe setup

Everything is built. This is the checklist to switch it on.

Until you finish it the app runs exactly as before: every account reads as
`free`, the Pro features show their upgrade invitation, and clicking Upgrade
returns a polite "billing isn't set up on this deployment yet" instead of an
error. Nothing is broken by the keys being absent.

---

## 1. Apply the migration

```bash
supabase db push
```

`supabase/migrations/20260902000000_add_pro_subscriptions.sql` adds the plan
columns to `profiles`, a `stripe_events` idempotency table, and — the important
part — a trigger that **silently reverts any attempt by a signed-in user to
change their own plan**. `profiles` has an owner-can-manage RLS policy, which is
right for `full_name` and catastrophic for `plan`; RLS is row-level and cannot
say "this row but not this column", so a trigger does it. Only the service role
(which lives exclusively in the webhook function) can write those columns.

## 2. Create the product in Stripe

In the Stripe Dashboard → Products, create one product ("Learnora Pro") with two
recurring prices:

| Price | Interval | Amount | Copy in the app |
| --- | --- | --- | --- |
| Monthly | month | £5.99 | `PRICES` in `webapp/src/lib/entitlements.ts` |
| Yearly | year | £49.00 | same |

Copy each price id (`price_...`). If you change the amounts, update
`PRICES` in `entitlements.ts` too — Stripe is the source of truth for what is
actually charged, and that array only exists so the paywall can render before a
network call. If the two disagree, Stripe wins and the array is the bug.

## 3. Deploy the two functions

```bash
supabase functions deploy stripe-billing
supabase functions deploy stripe-webhook --no-verify-jwt
```

`--no-verify-jwt` on the webhook is required, not optional: Stripe does not send
a Supabase JWT, so the gateway's default check would reject every event before
it reached the handler. The handler does its own, stronger check — Stripe's
signature over the raw request body.

## 4. Set the secrets

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_PRICE_MONTHLY=price_...
supabase secrets set STRIPE_PRICE_ANNUAL=price_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...     # from step 5
```

`STRIPE_SECRET_KEY` never reaches the browser. The client only ever receives a
URL to navigate to.

## 5. Point Stripe at the webhook

Stripe Dashboard → Developers → Webhooks → Add endpoint:

```
https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook
```

Subscribe to exactly these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Copy the signing secret it gives you (`whsec_...`) into
`STRIPE_WEBHOOK_SECRET` from step 4, then redeploy the webhook function so it
picks the secret up.

## 6. Check it end to end

With Stripe in test mode:

```bash
stripe listen --forward-to https://<ref>.supabase.co/functions/v1/stripe-webhook
```

Then in the app: Settings → Plan → Upgrade to Pro → pay with `4242 4242 4242
4242`. You should land back on `/app/settings?checkout=success`, see the "welcome
to Pro" toast, and have the plan flip within a few seconds. Confirm in the
database:

```sql
select plan, plan_status, plan_renews_at, stripe_subscription_id
from profiles where id = '<your user id>';
```

Then cancel from Settings → Plan → Manage billing and confirm
`plan_cancel_at_period_end` becomes true while `plan` *stays* `pro` until the
period ends.

---

## What is deliberately not here

**No CSP change.** Checkout is a full-page redirect to Stripe's own hosted page,
not embedded Elements, so `js.stripe.com` never loads inside our origin and
`vercel.json`'s policy stays as tight as it is. If you later switch to embedded
Elements you will need `https://js.stripe.com` in `script-src` and `frame-src`,
and `https://api.stripe.com` in `connect-src`, on the `/app/(.*)` block — but do
not add them speculatively.

**No billing UI of our own.** Cards, invoices, tax, dunning and cancellation all
go to Stripe's billing portal. Rebuilding that is a lot of work whose best
possible outcome is parity with something that is already compliant and
localised.

**No client-side enforcement as a security boundary.** `useEntitlements` decides
what to *show*. The edge functions re-derive the plan from the database on every
call, because a value in the browser is not a payment.

---

## The plan model

Defined once, in `webapp/src/lib/entitlements.ts`. Two rules shaped it, and both
are easy to violate later under revenue pressure:

1. **Nothing that already shipped free becomes paid.** Tasks, exams, the timer,
   flashcards, quizzes, notes, spaced repetition, the study room, friends — free
   forever. Taking working features away from students who already rely on them
   is how you lose the trust this product runs on.
2. **The free tier has to be genuinely good.** Pro is leverage on top of a
   complete product, not a product held hostage.

Pro sells the two things nothing else in this category can do — knowing when you
are free, and knowing what your studying is worth — plus headroom on the AI:

| Feature | Free | Pro |
| --- | --- | --- |
| Exam Trajectory (forecast + what the next hour is worth) | — | ✓ |
| Calendar import (`.ics` → real timetable) | — | ✓ |
| Auto-scheduled days | — | ✓ |
| Study blocks pushed back to your calendar | — | ✓ |
| Notebooks | 3 | unlimited |
| AI generations per day | 25 | 400 |
| Everything else | ✓ | ✓ |

### Statuses

`past_due` deliberately keeps working. A card that expires on the 3rd should not
delete a student's exam forecast during exam week; Stripe retries for days, and
a few days of unpaid access costs far less than breaking someone's revision on a
billing hiccup. `ENTITLED_STATUSES` in `entitlements.ts` and `ENTITLING` in
`stripe-webhook/index.ts` must stay in step — they encode the same rule on both
sides of the wire.

### Server-side quota enforcement

`learnora-ai` reads `profiles.plan` for the caller and picks its limits from it
(`isProUser` / `checkAndLogRateLimit`). Two separate ceilings, on purpose:

- a **burst** limit (30 per 10 min free, 90 per 10 min Pro) that exists to
  protect Learnora's shared provider quota from a runaway client, and
- a **daily allowance** (25 free, 400 Pro) that is the actual product boundary.

Raising one to sell a plan should never quietly weaken the other, which is why
they are not the same number. All four are overridable without a redeploy:
`AI_RATE_LIMIT_MAX`, `AI_RATE_LIMIT_MAX_PRO`, `AI_DAILY_LIMIT_FREE`,
`AI_DAILY_LIMIT_PRO`. The daily window resets at midnight UTC — a machine
boundary rather than a calendar promise, so a traveller never sees their
allowance reset twice in a day.

The limiter still **fails open** on a database error, which was a deliberate
choice before this change and stays one: a rate limiter that takes the AI
offline because a side table had a bad moment is a worse outcome than a burst
slipping through. `isProUser` fails to *free* rather than open — the worst case
there is a paying user briefly held to the free ceiling, rather than the ceiling
not existing at all.

Redeploy it after the migration so it can see the new columns:

```bash
supabase functions deploy learnora-ai
```

---

## Where the code lives

| Piece | File |
| --- | --- |
| Plan, features, quotas, prices | `webapp/src/lib/entitlements.ts` |
| Reading the plan; checkout and portal calls | `webapp/src/api/billing.ts` |
| `useEntitlements`, `useSubscription`, checkout mutations | `webapp/src/hooks/useSubscription.ts` |
| `<ProGate>`, `<ProBadge>`, `useProAction` | `webapp/src/components/ProGate.tsx` |
| The upgrade screen | `webapp/src/components/PaywallModal.tsx` |
| Settings → Plan | `webapp/src/views/settings/BillingTab.tsx` |
| Checkout / portal session creation | `supabase/functions/stripe-billing/index.ts` |
| The only thing that can grant Pro | `supabase/functions/stripe-webhook/index.ts` |
| Columns, guard trigger, idempotency table | `supabase/migrations/20260902000000_add_pro_subscriptions.sql` |

