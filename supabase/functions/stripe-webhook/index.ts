/* The only thing in this system that can grant Pro.
 *
 * Follows `send-push-reminders`' machine-caller shape: no user JWT, because
 * there is no user — Stripe calls this. The service-role client is what lets it
 * write the billing columns that the `profiles` trigger blocks for everybody
 * else, and the signature check is what makes that safe. No CORS: a browser
 * has no business here.
 *
 * Two properties this file has to hold, both of which are easy to lose:
 *
 *   1. **Verified.** The body is checked against Stripe's signature before a
 *      single field of it is read. Without that, anyone who learns this URL can
 *      POST themselves a subscription.
 *   2. **Idempotent.** Stripe guarantees at-least-once delivery and retries for
 *      three days, so every event arrives more than once eventually. Each event
 *      id is recorded in `stripe_events` and a repeat is dropped.
 *
 * Deploy (note `--no-verify-jwt`: Stripe does not send a Supabase JWT, and the
 * default gateway check would reject every event before it reached this code):
 *
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 *   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
 *   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
 */

import Stripe from "npm:stripe@17.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

type PlanStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "none";

/** Stripe's status vocabulary is wider than ours. Anything we do not recognise
 *  maps to a state that grants nothing — an unknown status is not a licence. */
function toPlanStatus(status: string): PlanStatus {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "incomplete":
      return status;
    case "incomplete_expired":
    case "unpaid":
      return "canceled";
    default:
      return "none";
  }
}

/* Which statuses actually turn the features on. Kept in step with
   `ENTITLED_STATUSES` in webapp/src/lib/entitlements.ts — a past-due card
   should not delete someone's revision plan mid-exam-week. */
const ENTITLING: PlanStatus[] = ["active", "trialing", "past_due"];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("[stripe-webhook] missing STRIPE_SECRET_KEY/WEBHOOK_SECRET");
    return json({ error: "not configured" }, 503);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "missing signature" }, 400);

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" });

  /* The raw text, not a parsed body: the signature is over the exact bytes
     Stripe sent, so parsing first and re-serialising would fail verification
     for any payload whose key order or number formatting differs. */
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      raw,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed", err);
    return json({ error: "invalid signature" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  /* Claim the event before doing any work. The primary key on `stripe_events`
     makes this a single atomic test-and-set, so two concurrent redeliveries
     cannot both get through — which a select-then-insert would allow. */
  const { error: claimError } = await supabase
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });
  if (claimError) {
    /* 23505 is unique_violation: already processed. Anything else is a real
       database problem, and returning non-2xx asks Stripe to retry — which is
       what we want, since we have not applied the event. */
    if (claimError.code === "23505") {
      return json({ received: true, duplicate: true }, 200);
    }
    console.error("[stripe-webhook] could not claim event", claimError);
    return json({ error: "storage failure" }, 500);
  }

  /** Find the account this event belongs to.
   *
   * The metadata we stamped at checkout is the fast path. The customer id is
   * the fallback, and it matters: a subscription created from the Stripe
   * dashboard by hand carries no metadata at all. */
  async function resolveUserId(
    metadataUserId: string | undefined,
    customerId: string | null,
  ): Promise<string | null> {
    if (metadataUserId) return metadataUserId;
    if (!customerId) return null;
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    return data?.id ?? null;
  }

  async function applySubscription(sub: Stripe.Subscription): Promise<void> {
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const userId = await resolveUserId(
      sub.metadata?.supabase_user_id,
      customerId,
    );
    if (!userId) {
      console.error("[stripe-webhook] no account for subscription", sub.id);
      return;
    }

    const status = toPlanStatus(sub.status);
    const periodEnd = sub.items.data[0]?.current_period_end;

    const { error } = await supabase
      .from("profiles")
      .update({
        /* The plan column is the *entitlement*, not what they bought: a
           cancelled subscription is still `plan: 'free'` here even though the
           Stripe product is Pro, so every read in the app can trust one
           column instead of re-deriving the rule. `plan_status` keeps the
           detail for the billing screen. */
        plan: ENTITLING.includes(status) ? "pro" : "free",
        plan_status: status,
        plan_renews_at: periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : null,
        plan_cancel_at_period_end: sub.cancel_at_period_end ?? false,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
      })
      .eq("id", userId);

    if (error) throw new Error(error.message);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        /* The session itself carries no subscription status worth trusting —
           it can complete before the first invoice settles. Re-reading the
           subscription is one API call and removes a whole class of
           "paid but not upgraded" support tickets. */
        if (session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          await applySubscription(await stripe.subscriptions.retrieve(subId));
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
      case "invoice.paid": {
        /* Payment events do not carry the subscription's new status, so we
           re-read it rather than guessing from the invoice. */
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null;
        };
        const subRef = invoice.subscription;
        if (subRef) {
          const subId = typeof subRef === "string" ? subRef : subRef.id;
          await applySubscription(await stripe.subscriptions.retrieve(subId));
        }
        break;
      }

      default:
        /* Everything else is acknowledged and ignored. Returning 200 for
           events we do not handle stops Stripe retrying them for three days
           and burying the ones that matter. */
        break;
    }
  } catch (err) {
    console.error("[stripe-webhook] handler failed", event.type, err);
    /* Release the claim so Stripe's retry can actually re-run the handler —
       otherwise the idempotency record we wrote above would make every retry
       a no-op and the subscription would never be applied. */
    await supabase.from("stripe_events").delete().eq("id", event.id);
    return json({ error: "handler failure" }, 500);
  }

  return json({ received: true }, 200);
});
