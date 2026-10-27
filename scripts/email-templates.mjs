#!/usr/bin/env node
/* Writes the Supabase auth email templates into email-templates/.
 *
 * Every auth email Supabase sends (signup confirmation, invite, magic link,
 * password reset, email change, reauthentication, and the password/email
 * changed notices) is one page here, built from one layout, so they all read
 * as the same exercise book as the app and the landing page (webapp/DESIGN.md
 * 0.8). Paste each file's body into Supabase → Authentication → Email
 * Templates, and its subject line from the table below (SUPABASE_SETUP.md).
 *
 * Email is not a browser: no CSS variables, no box-shadow, no gradients, and
 * tables for layout, so the layout uses inline values only. The design tokens
 * are copied in from landing.css by hand; keep them in step if the palette
 * changes.
 *
 * Usage: node scripts/email-templates.mjs */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "email-templates");

const C = {
  paper: "#fcfcf9",
  sheet: "#ffffff",
  ink: "#17202e",
  ink2: "#4a5465",
  ink3: "#636c7a",
  rule: "#d3e0ef",
  margin: "#e8a7a7",
  pen: "#b42f22",
  teal: "#0e6b5f",
  onTeal: "#ffffff",
  line: "#e1e3dc",
};

const SERIF = "Literata, Georgia, 'Times New Roman', serif";
const HAND = "Caveat, 'Segoe Print', 'Comic Sans MS', cursive";
const LOGO = "https://learnora-app.vercel.app/learnora.jpg";
const SITE = "{{ .SiteURL }}";

/* One row per template: file, subject, and the page's words. */
const TEMPLATES = [
  {
    file: "password-reset-request.html",
    subject: "Reset your Learnora password",
    eyebrow: "Password reset",
    title: "Choose a new password",
    body: [
      "Someone asked to reset the password on your Learnora account. Use the button to pick a new one.",
      "If it wasn't you, ignore this email. Your password stays the same.",
    ],
    cta: { label: "Reset password", href: "{{ .ConfirmationURL }}" },
    note: "the link works once",
  },
  {
    file: "confirmation.html",
    subject: "Confirm your Learnora email",
    eyebrow: "Almost there",
    title: "Confirm your email",
    body: [
      "One tap confirms this address and opens your account. Then you can add your first lesson.",
      "If you didn't sign up for Learnora, you can ignore this email.",
    ],
    cta: { label: "Confirm email", href: "{{ .ConfirmationURL }}" },
    note: "one tap and you're in",
  },
  {
    file: "magic-link.html",
    subject: "Your Learnora sign-in link",
    eyebrow: "Sign in",
    title: "Sign in to Learnora",
    body: [
      "Here's your sign-in link. It works once.",
      "If you didn't ask for it, ignore this email and nothing changes on your account.",
    ],
    cta: { label: "Sign in", href: "{{ .ConfirmationURL }}" },
    note: null,
  },
  {
    file: "invite.html",
    subject: "You're invited to Learnora",
    eyebrow: "Invitation",
    title: "Join Learnora",
    body: [
      "Someone has invited you to study on Learnora. Set up your account to accept.",
      "Your notes and lessons stay private to your account.",
    ],
    cta: { label: "Accept invitation", href: "{{ .ConfirmationURL }}" },
    note: null,
  },
  {
    file: "email-change.html",
    subject: "Confirm your new Learnora email",
    eyebrow: "Email change",
    title: "Confirm this address",
    body: [
      "You asked to change the sign-in email on your Learnora account to {{ .NewEmail }}.",
      "Confirm to make the change. If it wasn't you, ignore this email and nothing changes.",
    ],
    cta: { label: "Confirm new email", href: "{{ .ConfirmationURL }}" },
    note: null,
  },
  {
    file: "reauthentication.html",
    subject: "Your Learnora code",
    eyebrow: "Verification",
    title: "Your code",
    body: ["Enter this code to confirm it's you. Don't share it with anyone."],
    code: "{{ .Token }}",
    note: null,
  },
  {
    file: "password-changed.html",
    subject: "Your Learnora password was changed",
    eyebrow: "Security",
    title: "Your password was changed",
    body: [
      "The password on your Learnora account was just changed. If that was you, there's nothing else to do.",
      "If it wasn't, reset your password straight away.",
    ],
    cta: { label: "Reset password", href: `${SITE}/app/forgot-password` },
    note: null,
  },
  {
    file: "email-changed.html",
    subject: "Your Learnora email was changed",
    eyebrow: "Security",
    title: "Your sign-in email was changed",
    body: [
      "The sign-in email on your Learnora account was just changed.",
      "If that wasn't you, contact us right away so we can secure the account.",
    ],
    cta: { label: "Contact Learnora", href: `${SITE}/contact` },
    note: null,
  },
];

function button({ label, href }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
  <tr>
    <td bgcolor="${C.teal}" style="background: ${C.teal}; border: 1.5px solid ${C.ink}; border-radius: 999px; padding: 0;">
      <a href="${href}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: ${SERIF}; font-size: 16px; font-weight: 700; color: ${C.onTeal}; text-decoration: none; border-radius: 999px;">${label}</a>
    </td>
  </tr>
</table>`;
}

function code(value) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
  <tr>
    <td style="background: ${C.paper}; border: 1.5px solid ${C.ink}; border-radius: 10px; padding: 14px 26px; font-family: ${SERIF}; font-size: 30px; font-weight: 700; letter-spacing: 0.2em; color: ${C.ink};">${value}</td>
  </tr>
</table>`;
}

function page(t) {
  const paragraphs = t.body
    .map(
      (p) =>
        `<p style="margin: 0 0 14px; font-family: ${SERIF}; font-size: 16px; line-height: 1.6; color: ${C.ink2};">${p}</p>`,
    )
    .join("\n            ");
  const action = t.cta
    ? button(t.cta)
    : t.code
      ? code(t.code)
      : "";
  const note = t.note
    ? `<p style="margin: 22px 0 0; font-family: ${HAND}; font-size: 22px; line-height: 1.2; color: ${C.pen};">${t.note}</p>`
    : "";

  return `<!DOCTYPE html>
<!-- Generated by scripts/email-templates.mjs. Edit that file, not this one.
     Subject: ${t.subject} -->
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${t.subject}</title>
  <link href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400..700&family=Caveat:wght@500..600&display=swap" rel="stylesheet" />
</head>
<body style="margin: 0; padding: 0; background: ${C.paper};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: ${C.paper};">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width: 520px; width: 100%;">

          <!-- Masthead: the mark and wordmark, on the page, not in a box -->
          <tr>
            <td style="padding: 0 4px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right: 10px; vertical-align: middle;">
                    <img src="${LOGO}" width="30" height="30" alt="" style="display: block; border: 0; border-radius: 6px;" />
                  </td>
                  <td style="font-family: ${SERIF}; font-size: 20px; font-weight: 700; color: ${C.ink}; vertical-align: middle;">Learnora</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- The page: a white sheet with an ink edge and a red margin rule -->
          <tr>
            <td style="background: ${C.sheet}; border: 1.5px solid ${C.ink}; border-radius: 14px; padding: 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="border-left: 2px solid ${C.margin}; padding: 36px 36px 34px 28px;">

                    <p style="margin: 0 0 18px; display: inline-block; padding: 3px 10px; border: 1.5px solid ${C.ink}; border-radius: 999px; font-family: ${SERIF}; font-size: 12px; font-weight: 700; color: ${C.ink};">${t.eyebrow}</p>

                    <h1 style="margin: 0 0 16px; font-family: ${SERIF}; font-size: 30px; line-height: 1.1; font-weight: 700; letter-spacing: -0.01em; color: ${C.ink};">${t.title}</h1>

            ${paragraphs}

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 26px 0 0;">
                      <tr>
                        <td align="center">
                          ${action}
                          ${note}
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer: plain, and says who this is for -->
          <tr>
            <td style="padding: 22px 4px 0; font-family: ${SERIF}; font-size: 13px; line-height: 1.6; color: ${C.ink3};">
              You're getting this email because it was requested for a Learnora account, or about one.
              Learnora is a study app that keeps track of what you got wrong, and it's built by students.
              <br /><br />
              <a href="${SITE}" style="color: ${C.teal};">Learnora</a> &nbsp;·&nbsp;
              <a href="${SITE}/privacy" style="color: ${C.teal};">Privacy</a> &nbsp;·&nbsp;
              <a href="${SITE}/contact" style="color: ${C.teal};">Contact</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

mkdirSync(outDir, { recursive: true });
for (const t of TEMPLATES) {
  writeFileSync(join(outDir, t.file), page(t));
}
console.log(`wrote ${TEMPLATES.length} templates to ${outDir}`);
for (const t of TEMPLATES) console.log(`  ${t.file.padEnd(28)} ${t.subject}`);
