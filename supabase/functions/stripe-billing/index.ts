/* Checkout and billing-portal sessions for the signed-in student.
 *
 * Follows `learnora-ai`'s shape exactly: the caller's JWT is forwarded into a
 * per-request Supabase client so RLS decides what they can see, and the CORS
 * allowlist is convenience rather than the security boundary — the JWT gate is.
 *
 * This function creates Stripe *sessions* and nothing else. It never grants
 * Pro: entitlement changes only ever come from `stripe-webhook`, which runs
 * with the service-role key. That separation is the whole design. If this
 * function were compromised the worst it could do is create a checkout page.
 *
 * Deploy:
 *   supabase functions deploy stripe-billing
 *   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
 *   supabase secrets set STRIPE_PRICE_MONTHLY=price_...
 *   supabase secrets set STRIPE_PRICE_ANNUAL=price_...
 *
 * Until those secrets exist the function answers 503 with
 * `{ notConfigured: true }`, which the client turns into "billing isn't set up
 * yet" rather than a scary error. The whole app runs fine in that state; every
 * account is simply free. */

import Stripe from "npm:stripe@17.5.0";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://learnora.app",
  "https://www.learnora.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

function allowedOrigins(): string[] {
  const configured = Deno.env.get("ALLOWED_ORIGINS");
  return configured
    ? configured.split(",").map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = allowedOrigins();
  const ok =
    allowed.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(
  body: unknown,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

/* A return URL is reflected into Stripe and then into the student's browser,
   so it has to be one of ours. An open redirect here would let someone send a
   phishing link that genuinely originates from a Stripe checkout page. */
function safeReturnUrl(raw: unknown): string {
  const fallback = `${allowedOrigins()[0]}/app/settings`;
  if (typeof raw !== "string") return fallback;
  try {
    const url = new URL(raw);
    const ok =
      allowedOrigins().includes(url.origin) ||
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(url.origin) ||
      /^http:\/\/localhost:\d+$/.test(url.origin);
    return ok ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return json(
      {
        error: "Billing isn't set up on this deployment yet.",
        notConfigured: true,
      },
      503,
      cors,
    );
  }

  // --- Who is asking (the real gate) ------------------------------------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing or invalid authorization token." }, 401, cors);
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized. Please log in." }, 401, cors);
  }

  let payload: { action?: string; price?: string; returnUrl?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400, cors);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" });
  const returnUrl = safeReturnUrl(payload.returnUrl);

  /* The profile read uses the caller's own client, so RLS guarantees we can
     only ever look at their row — there is no user id in the request body to
     get wrong or to tamper with. */
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .maybeSingle();

  let customerId: string | null = profile?.stripe_customer_id ?? null;

  try {
    if (!customerId) {
      /* Created here rather than in the webhook so the portal works even for
         someone who abandoned checkout. `metadata.supabase_user_id` is what
         the webhook uses to find its way back to this account — it is the only
         link between the two systems, and Stripe echoes it on every event. */
      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      /* Written with the caller's client, which the billing-columns trigger
         will silently reject — deliberately. The webhook writes the real
         value with the service role on the first event; this call exists only
         so a deployment that later relaxes the trigger still records it, and
         costs nothing when it is a no-op. */
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    if (payload.action === "portal") {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return json({ url: session.url }, 200, cors);
    }

    if (payload.action === "checkout") {
      const priceId =
        payload.price === "annual"
          ? Deno.env.get("STRIPE_PRICE_ANNUAL")
          : Deno.env.get("STRIPE_PRICE_MONTHLY");
      if (!priceId) {
        return json(
          {
            error: "That plan isn't available on this deployment yet.",
            notConfigured: true,
          },
          503,
          cors,
        );
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${returnUrl}?checkout=success`,
        cancel_url: `${returnUrl}?checkout=cancelled`,
        allow_promotion_codes: true,
        /* Repeated on the subscription as well as the session: the events that
           matter most (`customer.subscription.*`) do not carry the checkout
           session, so without this the webhook would have to make an extra
           API call to work out who the subscription belongs to. */
        subscription_data: { metadata: { supabase_user_id: user.id } },
        metadata: { supabase_user_id: user.id },
      });
      return json({ url: session.url }, 200, cors);
    }

    return json({ error: "Unknown action." }, 400, cors);
  } catch (err) {
    console.error("[stripe-billing] failed", err);
    return json(
      { error: "Could not start a billing session. Please try again." },
      502,
      cors,
    );
  }
});
