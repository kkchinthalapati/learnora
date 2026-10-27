# Supabase Dashboard Configuration Guide

Complete setup instructions for the Learnora settings revamp and password reset flow.

---

## 1. Auth → URL Configuration

Add the reset password page to your allowed redirect URLs:

1. Go to **Authentication** → **URL Configuration**
2. Under **Redirect URLs**, add:
   ```
   https://<your-domain>/reset-password.html
   ```
   For local development, also add:
   ```
   http://localhost:5500/reset-password.html
   http://localhost:3000/reset-password.html
   ```
3. Click **Save**

---

## 2. Auth → Email Templates

Every auth email is generated from one layout by `scripts/email-templates.mjs`,
so they match the app and the landing page. Regenerate after editing the script:

```bash
node scripts/email-templates.mjs
```

For each template: go to **Authentication** → **Email Templates**, pick the
template, set the **Subject** and paste the **Body** from the file.

| Supabase template | Subject | File |
|---|---|---|
| Confirm signup | `Confirm your Learnora email` | [`confirmation.html`](./email-templates/confirmation.html) |
| Invite user | `You're invited to Learnora` | [`invite.html`](./email-templates/invite.html) |
| Magic link | `Your Learnora sign-in link` | [`magic-link.html`](./email-templates/magic-link.html) |
| Reset password | `Reset your Learnora password` | [`password-reset-request.html`](./email-templates/password-reset-request.html) |
| Change email address | `Confirm your new Learnora email` | [`email-change.html`](./email-templates/email-change.html) |
| Reauthentication | `Your Learnora code` | [`reauthentication.html`](./email-templates/reauthentication.html) |
| Password changed (notification) | `Your Learnora password was changed` | [`password-changed.html`](./email-templates/password-changed.html) |
| Email changed (notification) | `Your Learnora email was changed` | [`email-changed.html`](./email-templates/email-changed.html) |

> **Note**: The templates use Supabase variables such as `{{ .ConfirmationURL }}`, `{{ .Token }}` and `{{ .NewEmail }}`. Supabase fills them in when it sends the email. The notification templates may need enabling first under **Authentication** → **Notifications**.

---

## 3. Auth → Settings

1. Go to **Authentication** → **Settings**
2. Under **Email Auth**:
   - ✅ Enable **Email Confirmations** (should already be enabled)
   - Set **OTP Expiry** to `3600` seconds (1 hour) for reset links
3. Under **Security**:
   - Supabase reset links are **single-use by default** — no action needed
   - Consider enabling **CAPTCHA protection** for the reset endpoint if spam is a concern

---

## 4. Edge Functions — Delete Account (Optional)

If you want the "Delete Account" button to work, deploy a `delete-account` edge function:

```bash
supabase functions deploy delete-account
```

This function should:
1. Verify the JWT from the `Authorization` header
2. Extract the user ID from the token
3. Call `supabase.auth.admin.deleteUser(userId)` using the service role key
4. Delete all user data from your tables (tasks, exams, folders, etc.)

### Example skeleton:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verify the user's JWT
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
    authHeader.replace("Bearer ", "")
  );

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401 });
  }

  // Delete user data from all tables
  await Promise.all([
    supabaseAdmin.from("tasks").delete().eq("user_id", user.id),
    supabaseAdmin.from("exams").delete().eq("user_id", user.id),
    supabaseAdmin.from("folders").delete().eq("user_id", user.id),
    supabaseAdmin.from("materials").delete().eq("user_id", user.id),
    supabaseAdmin.from("notes").delete().eq("user_id", user.id),
    supabaseAdmin.from("flashcards").delete().eq("user_id", user.id),
  ]);

  // Delete the auth user
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
```

---

## 5. Summary Checklist

| Step | Status |
|------|--------|
| Add `reset-password.html` to Redirect URLs | ⬜ |
| Customize "Reset Password" email template | ⬜ |
| Set OTP expiry to 3600s (1 hour) | ⬜ |
| Deploy `delete-account` edge function (optional) | ⬜ |

> Password reset emails are sent via Supabase's built-in mailer (no SMTP/Resend setup required). There is no post-reset "password changed" notification email — that would require a custom email provider with a verified domain, which isn't set up.

---

## Security Notes

- **Single-use links**: Supabase reset links are automatically single-use. Once the token is consumed by `onAuthStateChange(PASSWORD_RECOVERY)`, it cannot be reused.
- **Link expiry**: Controlled by the OTP Expiry setting (default 3600s = 1 hour).
- **Session invalidation**: After a password reset, the app calls `supabase.auth.signOut({ scope: 'others' })` to invalidate all other sessions.
- **HTTPS only**: Ensure your production site uses HTTPS. Reset links should never be served over HTTP.
