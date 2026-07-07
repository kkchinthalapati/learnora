/**
 * Supabase Edge Function: password-changed-notify
 *
 * Sends a branded security notification email to the user after
 * a successful password change. Can be triggered:
 *   1. Client-side: called from reset-password.html or settings after
 *      a successful supabase.auth.updateUser({ password }).
 *   2. Database webhook: triggered by an auth.users row update (advanced).
 *
 * Environment secrets required:
 *   - RESEND_API_KEY: API key for Resend (https://resend.com)
 *   - SUPPORT_EMAIL: (optional) defaults to support@learnora.app
 *
 * Deploy: supabase functions deploy password-changed-notify
 */

const SUPPORT_EMAIL_DEFAULT = "support@learnora.app";

// Read the branded HTML template at build time (inlined for edge function)
function buildEmailHtml(userName: string, changeDate: string, supportEmail: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#0a0414;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0a0414;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:480px;width:100%;background:linear-gradient(135deg,rgba(20,10,40,0.9),rgba(10,4,20,0.95));border-radius:20px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 16px 48px rgba(0,0,0,0.5);">
<tr><td align="center" style="padding:40px 32px 24px;">
  <h1 style="margin:0;font-size:28px;font-weight:800;letter-spacing:-0.02em;background:linear-gradient(135deg,#d845f8,#8b9bf5);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Learnora</h1>
</td></tr>
<tr><td align="center" style="padding:0 32px 16px;">
  <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#34b88a,#00f0ff);line-height:64px;text-align:center;margin:0 auto;">
    <span style="font-size:28px;">🔒</span>
  </div>
</td></tr>
<tr><td style="padding:0 32px 16px;">
  <h2 style="margin:0 0 12px;color:#ffffff;font-size:22px;font-weight:700;text-align:center;">Password Changed Successfully</h2>
  <p style="margin:0 0 8px;color:#a698ba;font-size:15px;line-height:1.6;">Hi <strong style="color:#ffffff;">${userName}</strong>,</p>
  <p style="margin:0 0 20px;color:#a698ba;font-size:15px;line-height:1.6;">Your Learnora password was successfully changed on <strong style="color:#ffffff;">${changeDate}</strong>. All other active sessions have been signed out for your security.</p>
</td></tr>
<tr><td style="padding:0 32px 24px;">
  <div style="background:rgba(255,42,95,0.1);border:1px solid rgba(255,42,95,0.2);border-radius:12px;padding:16px 20px;">
    <p style="margin:0;color:#ff2a5f;font-size:14px;font-weight:600;line-height:1.5;">⚠️ Didn't make this change?</p>
    <p style="margin:8px 0 0;color:#a698ba;font-size:14px;line-height:1.5;">
      If you did not change your password, your account may be compromised. Please contact us immediately at
      <a href="mailto:${supportEmail}" style="color:#d845f8;text-decoration:underline;">${supportEmail}</a>
      to secure your account.
    </p>
  </div>
</td></tr>
<tr><td style="padding:0 32px;"><hr style="border:none;height:1px;background:rgba(255,255,255,0.08);margin:0;" /></td></tr>
<tr><td style="padding:24px 32px 32px;">
  <p style="margin:0;color:#6e6082;font-size:12px;line-height:1.5;text-align:center;">
    © Learnora — Your calm study workspace<br />This is an automated security notification.
  </p>
</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { userEmail, userName } = await req.json();

    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: "userEmail is required" }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const supportEmail = Deno.env.get("SUPPORT_EMAIL") || SUPPORT_EMAIL_DEFAULT;
    const displayName = userName || "Student";
    const changeDate = new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    });

    const htmlBody = buildEmailHtml(displayName, changeDate, supportEmail);

    // Send via Resend API
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Learnora <noreply@learnora.app>`,
        to: [userEmail],
        subject: "Your Learnora password was changed",
        html: htmlBody,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Resend API error:", errorBody);
      return new Response(
        JSON.stringify({ error: "Failed to send notification email" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
