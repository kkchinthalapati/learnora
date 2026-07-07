You are a senior full-stack developer. You have full access to the Learnora codebase in this repository. Your task is a complete settings page revamp + professional password reset flow.

## CONTEXT
Stack: Vanilla JS + HTML/CSS, Supabase (auth + DB), deployed on Vercel. Use Supabase's built-in auth where possible. Email is handled via SMTP integration (already configured or use Supabase's built-in email).

---

## TASK 1 — Settings Page Revamp

Redesign the settings page to look and feel like a professional SaaS product (reference: Linear, Vercel, Notion). Requirements:

- Clean sidebar or tabbed navigation (Account, Security, Notifications, Danger Zone)
- "Account" tab: display name, profile picture, associated email with a "Change Email" button
- "Security" tab: Change Password section + active sessions if applicable
- "Danger Zone" tab: Delete account option (with confirmation)
- Consistent card-based layout, proper spacing, loading states, inline success/error feedback
- Mobile responsive
- Match existing Learnora design system (colors, fonts, radius, shadows)

---

## TASK 2 — Change Email Feature

In the Account tab, add a "Change Email" flow:
- Button opens a modal: "Enter your new email address"
- On submit: call `supabase.auth.updateUser({ email: newEmail })` — Supabase will send a confirmation email to the NEW address
- Show inline success: "Confirmation email sent to [email]. Check your inbox."
- Handle errors (invalid email, same as current, rate limiting)

---

## TASK 3 — Professional Password Reset Flow

Implement this full flow:

### 3a. "Forgot Password" on login page
- Add "Forgot your password?" link below the login form
- Clicking opens a simple page/modal: enter email → submit
- Call `supabase.auth.resetPasswordForEmail(email, { redirectTo: '<your-site>/reset-password.html' })`
- Show: "If an account exists for that email, we've sent a reset link. Check your inbox."
- Create `reset-password.html` if it doesn't exist

### 3b. reset-password.html
- On page load: extract `access_token` + `type=recovery` from URL hash
- If missing/invalid: show error "This link is invalid or has expired. Request a new one."
- Show form: New Password + Confirm New Password
- Validation:
  - Must not be empty
  - Min 8 characters
  - Must not match current password (Supabase will reject this anyway — show a friendly message)
  - New password and confirm must match
- On submit: call `supabase.auth.updateUser({ password: newPassword })`
- On success: redirect to login with toast "Password updated successfully. Please sign in."

### 3c. Post-reset confirmation email
- After successful password reset, send a security notification email to the user
- Use Supabase Edge Function or your existing SMTP setup
- Email content (write the HTML template):
  - Subject: "Your Learnora password was changed"
  - Body: "Hi [name], your password was successfully changed on [date/time]. If this wasn't you, contact support immediately at [support email] or click here to lock your account."
  - Branded with Learnora styles

### 3d. Supabase Configuration
Tell me exactly what to configure in the Supabase dashboard:
- Auth → Email Templates: customize the "Reset Password" email template (provide the HTML)
- Auth → URL Configuration: add `<site-url>/reset-password.html` to Redirect URLs
- Any other settings needed

---

## SECURITY REQUIREMENTS
- Reset links are single-use (Supabase handles this natively — confirm it's enabled)
- Link expires in 1 hour (configure in Supabase Auth settings)
- After password reset, all other sessions are invalidated: call `supabase.auth.signOut({ scope: 'others' })` after successful update
- The reset-password page must NOT allow reuse of the same link after it's been used

---

## DELIVERABLES
1. Updated settings page (full revamp)
2. `reset-password.html` (new file if needed)
3. Updated login page with "Forgot password?" link
4. Email HTML templates (reset request + post-reset notification)
5. Edge Function or email trigger code for the security notification
6. A `SUPABASE_SETUP.md` file listing every Supabase dashboard config change needed
7. All changes committed, PR created, and branch merged — use descriptive commit messages

## RULES
- Read all relevant existing files before changing anything
- Match existing code style exactly
- Don't break existing auth flow
- Test edge cases: expired link, already-used link, wrong token
- If a file doesn't exist (e.g., reset-password.html), create it
- Leave inline comments for any non-obvious logic