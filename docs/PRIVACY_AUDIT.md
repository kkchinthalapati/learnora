# Privacy audit — student data and third-party AI processing

**Status: audit, not policy.** This document describes what the code does
today and where `privacy.html` does not match it. The draft wording in
Part 4 is a *starting point for a human to review and rewrite*, not
approved copy. Nothing here has been published.

**Date:** 2026-09-01 · **Scope:** `main` at `6ba46e9` ·
**Author:** written by an AI agent from the source, not from legal advice.

---

## Part 0 — the short version

Learnora sends student-written and student-uploaded coursework to up to six
third-party AI providers. `privacy.html` mentions "AI" once, in a sentence
telling students to review AI output. It never says the content leaves
Learnora, never names a provider, never says what those providers may do
with it, and never distinguishes the provider that answers most requests
from the five that answer when it fails.

That is the central gap. Four smaller ones are listed in Part 3.

Everything in Parts 1–3 is verifiable from the repository. Part 4 is a
draft. Part 5 lists the questions that need a human — some of them a
lawyer — because they cannot be answered from the code.

---

## Part 1 — what the code actually does

### 1.1 One funnel, six destinations

Every model call in the app goes through `callEdge`
(`webapp/src/api/ai.ts:106`), which POSTs to the `learnora-ai` Supabase
edge function. The browser never contacts an AI provider directly — the
app's CSP (`vercel.json`, the `/app/(.*)` policy) restricts `connect-src`
to the Supabase project origin, so provider traffic is server-to-server
from the edge function. One practical consequence: **providers see
Supabase's egress, not the student's IP or browser.**

The edge function walks a provider chain until one returns usable text
(`supabase/functions/learnora-ai/index.ts:182-228` for the list,
`:644` onward for Gemini, `:751` onward for the rest):

| Order | Provider | Endpoint | Secret |
|---|---|---|---|
| 1 | Google Gemini | Google Generative AI SDK | `GEMINI_API_KEY` |
| 2 | Cerebras | `api.cerebras.ai` | `CEREBRAS_API_KEY` |
| 3 | Groq | `api.groq.com` | `GROQ_API_KEY` |
| 4 | Mistral | `api.mistral.ai` | `MISTRAL_API_KEY` |
| 5 | GitHub Models | `models.github.ai` | `GITHUB_MODELS_TOKEN` |
| 6 | OpenRouter | `openrouter.ai` | `OPENROUTER_API_KEY` |

A provider with no key set is skipped silently
(`index.ts:751-754`), so **which providers actually receive student data is a
deployment-time decision made in Supabase secrets, not something the code
fixes.** Any privacy statement has to be true of whichever set is enabled.

Gemini answers first and therefore handles the large majority of requests.
The other five are reached only when Gemini is unconfigured, times out,
errors, or has been exhausted — which is precisely why a policy cannot
name only Gemini.

### 1.2 What is in a request

Each provider call carries the full system instruction, the recent
conversation, and the current turn (`index.ts:356-378` builds the
OpenAI-dialect message array; `:657-670` the Gemini one). Concretely that
can include:

- **Chat turns** — up to the last 20 messages (`ai.ts:30`, `:191`).
- **Workspace state** — the student's pending task names with due dates and
  upcoming exam names with dates, interpolated into the system prompt
  (`webapp/src/lib/chatPrompt.ts:132-134`).
- **Open note content** — up to 3,000 characters of whatever note the
  student is reading, sent as "ACTIVE VIEW" context
  (`chatPrompt.ts:48`, `:60-68`).
- **Uploaded coursework**. A PDF, image, or audio file picked in Create or
  the chat uploader is read to base64 in the browser
  (`webapp/src/api/studyPackage.ts:612`) and sent as the `file` field of the
  edge payload (`ai.ts:39-46`). Limit 10 MB (`studyPackage.ts:70`).
  - To **Gemini** it goes inline, as the actual file bytes
    (`index.ts:665-668`).
  - To the **fallback providers** it does not: a `text/*` upload is decoded
    and pasted into the prompt as text (`index.ts:733-737`), and a binary
    upload is replaced by a note saying an attachment could not be read
    (`index.ts:738-745`). So a PDF's *bytes* only ever reach Gemini —
    but the AI-written notes derived from it are then re-sent to whichever
    provider answers the next request.
- **Derived notes** — generated notes are stored, then up to 6,000
  characters of them are fed back as the source for deck and quiz
  generation (`studyPackage.ts:66`, `:216`).
- **Free-text the student wrote themselves** — Feynman explanations,
  typed flashcard answers, notebook prompts. Same path.

Anything a student types or uploads into a study surface should be assumed
to reach a third-party provider.

### 1.3 What Learnora itself keeps

- **Uploaded files** are stored in the Supabase Storage bucket `materials`
  under `<user_id>/<random>_<timestamp>.<ext>`
  (`webapp/src/api/materials.ts:29-37`), with a `materials` row pointing at
  the path. They are kept until the student deletes them.
- **Notes, decks, cards, quizzes, tasks, exams, plans, notebooks,
  study sessions** are ordinary owner-scoped rows in Postgres, kept
  indefinitely.
- **AI request log** — one skinny row per accepted AI call: `user_id`,
  `mode`, `created_at`
  (`supabase/migrations/20260810000000_add_ai_rate_limiting.sql`). **No
  prompt or reply content is stored.** The migration explicitly declines to
  schedule a prune, so these rows accumulate for the life of the account.
  They cascade-delete with the user.
- **Account fields** — email, `full_name`, and **date of birth**, set at
  signup into Supabase auth user metadata (`webapp/src/api/auth.ts:147`).
- **Chat transcripts are not persisted server-side.** They live in React
  state for the session.

### 1.4 What is logged server-side

The edge function writes to Supabase's function logs on failure and on
safety events. Those entries carry `mode`, `user.id`, and provider error
messages (`index.ts:629`, `:690`, `:776`, `:795-799`). Provider error
messages are not sanitised before logging and some gateways echo part of a
request back in an error body, so **prompt fragments can reach the function
logs on a failed call**. The client only ever receives a generic
"AI is temporarily unavailable" (`index.ts:800-805`).

### 1.5 What is *not* sent anywhere

Worth stating because it is a genuinely good part of the design:

- No analytics, ad, or tag-manager script. The CSP allows `script-src
  'self'` on `/app/*` and Google Fonts for stylesheets only.
- No provider receives the student's email, name, date of birth, or user ID.
  The system prompt carries no identifiers.
- Friends features share study **statistics** (streak, minutes, dates)
  through owner-checked RPCs, not study content
  (`supabase/migrations/20260803000000_add_friends_feature.sql`).

### 1.6 Retention at the provider — not determinable from this repo

The code proves what is *sent*. It cannot prove what a provider *does*
with it. That depends on each provider's terms for the specific tier the
key belongs to, which is not in the repository and is not verified here.

`AI_PROVIDERS.md:88-104` records the maintainers' own understanding: free
tiers "usually train on your data", and Mistral's Experiment tier "requires
opting in to having your data used for training". **This audit does not
independently verify either claim, and no privacy statement should repeat
them as fact until someone has read the current terms of the tier each key
is actually on.** Terms also change; whatever is written needs a review
date.

---

## Part 2 — what `privacy.html` says

The whole document is three paragraphs under two headings. On AI it says
exactly one thing:

> "AI-generated output is intended for educational support; students should
> review it and avoid submitting confidential or unnecessary personal
> information in prompts or uploads."

Plus one adjacent sentence:

> "Learnora does not sell a student's study content or notes to third
> parties."

That is the complete AI disclosure.

---

## Part 3 — the gaps

### 3.1 Third-party AI processing is undisclosed *(most serious)*

Nothing in `privacy.html` tells a student that their coursework leaves
Learnora's infrastructure at all. The sentence that comes closest — "avoid
submitting confidential or unnecessary personal information in prompts or
uploads" — is advice about *content quality*; a reader would not infer from
it that the upload is transmitted to Google, Cerebras, Groq, Mistral,
GitHub, or OpenRouter. Missing entirely: that sub-processors exist, who
they are, what reaches them, and what they may do with it.

### 3.2 "Does not sell" is doing work it cannot do

The sentence is, as far as the code shows, true — there is no data-sale
path. But placed where it is, it reads as the reassurance about third
parties, and a student would reasonably take it to mean *study content
stays here*. If free-tier terms permit training on submitted data, then
content is being used by a third party for that third party's benefit
without payment changing hands. That is not a sale, and it is also not what
the sentence leads a reader to expect. **Flagged rather than resolved: how
far a "we don't sell" statement can carry is a question for a lawyer, not
for this audit.**

### 3.3 "Your choices" offers no actual choices

The section names one route — emailing support. It does not mention that
the app has a Wipe Data button and a Delete Account button, and it offers
no way to opt out of AI processing (there is none in the code: AI is not
optional per-feature, though a student can decline to use AI surfaces).

Two related accuracy points:

- **Wipe Data** deletes tasks, exams, study logs, weekly plans, and quizzes
  (`webapp/src/api/dataAdmin.ts:492-513`). It does **not** touch notes,
  materials, uploaded files in Storage, decks, notebooks, or
  `ai_request_log`. The in-app copy is accurate about this
  (`DangerTab.tsx:106-111`); the privacy notice does not mention it at all.
- **Delete Account** POSTs to a `delete-account` edge function
  (`webapp/src/api/auth.ts:269`). **That function's source is not in this
  repository** — `supabase/functions/` contains only `learnora-ai` and
  `send-push-reminders`, and `SUPABASE_SETUP.md:51-58` describes deploying
  it as an optional step with a sketch rather than an implementation.
  Whether it is deployed cannot be determined from the repo. **If it is
  not, the app's only account-deletion route returns an error**, which
  matters both to students and to any deletion-rights obligation. Someone
  with Supabase access should check this first — it is the most immediately
  actionable item in this document.

### 3.4 No retention statement

`privacy.html` gives no retention period for anything. Materials, notes and
`ai_request_log` rows are kept indefinitely by design.

### 3.5 No mention of age, and the app collects a date of birth

Signup requires a date of birth and refuses under-13s
(`webapp/src/api/auth.ts:12`, `:139-140`); the DOB is stored in auth
metadata (`:147`). `terms.html:247` states the 13+ rule and a
parent/guardian requirement for under-18s. `privacy.html` says nothing
about either, and does not disclose that a date of birth is collected and
retained. See Part 5 — this is the area most likely to carry real
obligations.

---

## Part 4 — DRAFT replacement section

> ### ⚠️ DRAFT — NOT APPROVED, NOT PUBLISHED
>
> Written by an AI agent as a starting point. It has not been reviewed by a
> lawyer and must not be published as-is. Two things in particular need a
> human before this goes anywhere:
>
> 1. **Every factual claim about a provider is left blank or hedged on
>    purpose.** Fill each one in only from that provider's current terms for
>    the tier the key is on. Do not copy the summary in `AI_PROVIDERS.md` —
>    it is a maintainer's note, not verified.
> 2. **The provider list must match the secrets actually set.** Naming a
>    provider that is not enabled, or omitting one that is, makes the notice
>    wrong in a way that is worse than the current silence.

---

**How Learnora uses AI, and who else sees your work**

Learnora's study features — chat, generated notes, flashcards, quizzes,
study plans, and the Feynman and Notebook tools — are powered by AI models
run by other companies. Learnora does not run its own models.

**What gets sent.** When you use an AI feature, we send that provider what
it needs to answer: your message, the recent conversation, the note or
material you are working on, and the names and dates of tasks and exams in
your workspace so the assistant can refer to them. If you upload a file, its
contents are sent too.

**What does not get sent.** We do not send your name, email address, date of
birth, or account ID. Providers do not see your IP address, because requests
are made by our servers rather than by your browser.

**Who the providers are.** We use the following, in order — a request goes
to the next one only if the one before it is unavailable:

> _[List only the providers whose keys are set in production. For each,
> state the company and, if relevant, the region of processing.]_

**What they may do with it.** _[For each provider, state whether its terms
for the tier we use permit the provider to retain submitted content, and
whether it may be used to train or improve their models. Where a free tier
permits training, say so plainly. Do not write "we do not allow it" unless
the tier's terms actually say so.]_

**What we keep.** Your account details, and everything you create or upload,
stay in your workspace until you delete them. We keep a record of when AI
requests were made — the date, time, and which feature — to protect the
service from abuse. That record does not contain your messages or the AI's
replies.

**Your choices.**

- You can delete individual notes, materials, decks and quizzes at any time.
- Settings → Danger Zone → **Wipe All Data** deletes your tasks, study logs,
  exams, weekly plans and quizzes. It does not delete notes, uploaded
  materials or flashcards.
- Settings → Danger Zone → **Delete Account** deletes your account and its
  data. _[Confirm this works before publishing — see 3.3.]_
- You can use Learnora without the AI features. Anything you never send to
  an AI feature is never sent to a provider.
- Once content has been sent to a provider, deleting it from Learnora does
  not delete any copy that provider may hold. _[Confirm against each
  provider's terms.]_

**A note for younger students.** Learnora is for students aged 13 and over,
and we ask for your date of birth at signup to check that. _[Under-16
handling: see Part 5. Do not publish wording here without advice.]_

**Please do not upload** medical records, financial documents, government ID,
or anything about another person that they would not want shared. Upload
coursework.

> ### ⚠️ END OF DRAFT

---

## Part 5 — for a human, including some for a lawyer

These are not resolved here and should not be resolved by an engineer alone.

1. **Under-16 users.** The gate is 13+. In much of the EU the age of digital
   consent is 16 (13–16 depending on the member state), and the UK ICO's
   Age Appropriate Design Code applies to services likely to be accessed by
   children. Sending a 13-year-old's coursework to a provider that may train
   on it is exactly the kind of processing those regimes look at. **Needs
   legal advice.** Related: `terms.html:247` requires parental permission
   for under-18s but nothing in the code checks or records it.

2. **Is the deletion path real?** Check whether `delete-account` is deployed
   (3.3). This is a one-command check and gates a rights claim.

3. **Which provider keys are actually set in production?** Run
   `supabase secrets list`. The disclosure has to match. If a provider's
   terms are unacceptable, the fix is to unset its key — the chain works
   without it (`AI_PROVIDERS.md:5-8`).

4. **Read each enabled provider's current terms** for the tier the key is on,
   and record the date. This audit deliberately asserts nothing about them.

5. **Retention.** Decide and state periods for materials, notes and
   `ai_request_log`. "Indefinitely" is a decision too, but it should be a
   stated one.

6. **Do the AI providers need naming as sub-processors** in a way that
   triggers anything under the terms of service? Legal question.

7. **Should there be an AI opt-out?** There is none today. Whether one is
   required, and whether "don't use the AI features" is a sufficient answer,
   is a product-plus-legal call.

8. **Provider error logging** (1.4) can put prompt fragments into Supabase
   function logs. Low severity, easy fix: truncate or redact provider error
   bodies before `console.error`. Not done here because it is a code change
   outside this audit's scope.

---

## What this audit did not do

- It did not change `privacy.html`. Publishing legal claims is not a call an
  agent should make unilaterally.
- It did not verify any provider's data-use terms. Every such statement is
  attributed to `AI_PROVIDERS.md` and marked unverified.
- It did not check the live Supabase project — which secrets are set, or
  whether `delete-account` is deployed. Both need access this session does
  not have.
