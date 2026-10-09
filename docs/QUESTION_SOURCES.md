# Practice questions and past papers: what Learnora can use

Researched 2026-10-02. This doc decides what goes into `public.question_bank`, and why
Learnora links to past papers instead of hosting them. Re-check a source's terms before
widening how it's used.

## Verdict

| Source | Can Learnora use it in the app? | How it's used |
|--------|--------------------------------|---------------|
| **AQA** past papers | ❌ No. AQA "does not grant permission for the use of its material in apps" and forbids reproduction on third-party websites. | Linked: the exam page sends students to AQA's past-paper finder. |
| **OCR** past papers | ❌ Not without a licence. The free permission covers approved centres only, for internal use, with no charge. Publishers must apply to `ocr.copyright@ocr.org.uk`. | Linked. |
| **Pearson Edexcel** past papers | ❌ Not without permission. Its copyright policy forbids copying or making papers available electronically, except approved centres on a closed intranet. | Linked. |
| **IB** past papers and Questionbank | ❌ IB copyright. Public redistribution needs a paid licence (IB Permission Request Form). Papers are sold through the IB's official store (Follett). | Linked to the official store; students are told their IB coordinator may have them. |
| **NY State Regents** exams | ❌ Commercial use forbidden without written permission. | Not used. |
| **OpenStax** Biology 2e, Chemistry 2e, College Physics 2e | ❌ Now CC BY-NC-SA 4.0 (checked in each book's collection metadata on GitHub). Learnora sells Plus/Pro, so NonCommercial rules them out. | Not used. |
| **OpenStax** Physics (high school) | ✅ CC BY 4.0. | Not imported yet. A candidate for IB/GCSE physics with attribution. |
| **Oak National Academy** (Open Curriculum API) | ✅ Open Government Licence v3.0, built for edtech reuse. KS4 lessons carry exam board (AQA/Edexcel/OCR), tier and science child subject. Every lesson has a starter and an exit quiz with answers marked. The API withholds lessons that aren't OGL-compatible. | Imported by `webapp/scripts/question-bank/import-oak.mjs`, with an attribution on every question. |
| **Learnora-written** questions | ✅ Ours. | 228 questions seeded across every section of AQA GCSE Biology, Chemistry and Physics and every GCSE Maths strand; 132 more (added 2026-10-09) across every chapter of CBSE Class 10 Science (76) and Mathematics (56), each stating its kind (recall / apply) and, for 30 of them, which misconception each wrong option is. |
| **CBSE / NCERT** | Not copied. CBSE sample papers and previous years' papers are linked from the exam page (cbseacademic.nic.in, cbse.gov.in). The CBSE questions are original, written against the NCERT chapter list. NCERT's licence terms for derived questions have **not** been checked; do that before importing or adapting any NCERT or CBSE text. | Linked. |

Sources:
- [AQA copyright policy](https://www.aqa.org.uk/about-us/who-we-are/our-standards/copyright-and-intellectual-property-policy)
- [OCR copyright](https://ocr-live-prd95.cambridgeassessment.org.uk/about/our-policies/copyright/)
- [Pearson copyright policy](https://qualifications.pearson.com/en/support/support-topics/exams/past-papers/pearson-copyright-policy.html)
- [IB licensing](https://ibo.org/become-an-ib-school/ib-publishing/licensing/applying-for-a-license/)
- [NYSED Regents](https://nysedregents.org/)
- [Oak OpenAPI](https://open-api.thenational.academy/)
- [Oak curriculum API source (MIT; content OGL)](https://github.com/oaknational/oak-curriculum-api)
- [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)
- OpenStax book repos: [biology](https://github.com/openstax/osbooks-biology-bundle), [chemistry](https://github.com/openstax/osbooks-chemistry-bundle), [college physics](https://github.com/openstax/osbooks-college-physics-bundle), [physics](https://github.com/openstax/osbooks-physics)

## What's in the product

- **`question_bank`** (migration `20261002010000`). Every row carries `source`, `licence`
  and `attribution`. Signed-in students can read it; only the service role can write it.
  It holds no past papers.
- **Practice from the bank:**
  - On the exam page: "Practise top topics", and "Practise" on each topic.
  - In Practice mode, when the AI can't write problems.
  - An Oak question shows its OGL attribution under it.
- **Past papers:** the exam page links to the board's own page (`pastPapersUrl` in the
  syllabus catalogue). Students log their self-marked scores in `past_paper_attempts`
  (migration `20261002020000`).

## To do (needs a person)

1. **Oak API key: obtained 2026-10-07.** Only the `--apply` write is left. Note: Oak's API has no GCSE science (its science programmes end at Year 9), so the import is GCSE Maths only (1,050 questions at the last run). (Keys are free: https://open-api.thenational.academy.)
   Then run:
   ```bash
   cd webapp
   OAK_API_KEY=… node scripts/question-bank/import-oak.mjs --out oak.json   # review first
   OAK_API_KEY=… SUPABASE_URL=https://mlvgqwqiynpwpwzqufdf.supabase.co \
     SUPABASE_SERVICE_ROLE_KEY=… node scripts/question-bank/import-oak.mjs --apply
   ```
   - The import keeps text multiple-choice questions with exactly one correct answer, from
     AQA biology/chemistry/physics and every board's maths, mapped to a spec section by
     lesson title. It reports what it skipped and why.
   - Re-running is safe.
   - Spot-check a sample of `oak.json` before `--apply`.
2. **Click-check the past-paper links.** This environment's network blocks the exam-board
   domains, so the URLs come from search results, not a live click. Check:
   - AQA: https://www.aqa.org.uk/past-papers-and-mark-schemes-finder
   - Pearson: https://qualifications.pearson.com/en/support/support-topics/exams/past-papers.html (confirmed by search)
   - OCR: https://www.ocr.org.uk/qualifications/past-paper-finder/
   - IB: https://www.follettibstore.com/
3. **Optional: ask the boards for a licence.** Only worth it if Learnora wants real
   past-paper questions inside the app. The templates below are ready to send.
4. **Credit Oak on a public page.** OGL asks for an attribution statement. Each question
   already carries one; adding "Contains public sector information licensed under the
   Open Government Licence v3.0" to the About or Terms page is good practice once Oak
   content is imported.

## Permission request templates

AQA (copyright@aqa.org.uk; allow at least four working weeks):

> Subject: Permission request — use of past examination questions in a revision app
>
> We run Learnora (learnora.app), a revision app for GCSE students. We'd like permission
> to show selected questions and mark-scheme points from AQA GCSE Biology (8461),
> Chemistry (8462), Physics (8463) and Mathematics (8300) past papers, at least one year
> after the exam, inside the app as practice questions with full acknowledgement of
> AQA's copyright. The app has a free tier and a paid tier. We'd exclude any question
> containing third-party copyright material. Could you tell us whether a licence is
> available, and on what terms?

Use the same template for OCR (ocr.copyright@ocr.org.uk, Publisher Relationship Manager)
and Pearson (via their copyright permissions page), and for the IB through the IB
Permission Request Form.
