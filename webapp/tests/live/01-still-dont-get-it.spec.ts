import { test, expect, signIn, ask, LiveTranscript } from "./support/liveFixtures";

/* Live journey 1 — "I still don't get it."
 *
 * The adaptation criterion, which has no evidence behind it at all: a
 * stubbed model returns the same canned string however confused the student
 * says they are, so the mocked suites cannot tell a tutor that changes tack
 * from one that repeats itself louder.
 *
 * Three turns on one topic. The wording of turns two and three is
 * deliberately what a real 14-year-old types — vague, slightly rude, no
 * detail about which part lost them — because an answer that only adapts
 * when told precisely what to fix is not adapting.
 *
 * This asserts almost nothing. Whether the answers are any good is read
 * afterwards out of out/01-still-dont-get-it.md against the rubric in
 * README.md; the only hard failure is the tutor not answering at all.
 */

test("the tutor is asked the same thing three times, getting more lost", async ({
  page,
  live,
}) => {
  const transcript = new LiveTranscript("01-still-dont-get-it");

  await signIn(page, live);
  await page.getByRole("button", { name: /ask/i }).first().click();
  await page.waitForTimeout(1500);

  const turns = [
    {
      step: "first ask",
      question: "explain electromagnetic induction pls i dont get it",
    },
    {
      step: "still lost, no detail given",
      question: "bro i still dont get it",
    },
    {
      step: "asks for it simpler, third time",
      question: "can you say it way simpler like im 12",
    },
  ];

  const previous: string[] = [];
  for (const turn of turns) {
    const { answer, waitedMs } = await ask(page, turn.question);
    transcript.record({ step: turn.step, asked: turn.question, answered: answer, waitedMs });

    /* Guard against reading a stale bubble, which is how the first live run
       "found" a tutor that repeats itself verbatim: an unnoticed modal had
       swallowed the send. An identical answer is now a harness failure
       until proven otherwise, not a finding. */
    expect(
      previous.includes(answer),
      "identical to an earlier answer — the question probably never sent",
    ).toBe(false);
    previous.push(answer);

    /* The only real assertion: something came back. A refusal counts — if
       the daily allowance is spent, that is worth knowing and the recorded
       text will say so. */
    expect(answer.length, `no answer to: ${turn.question}`).toBeGreaterThan(0);
  }

  transcript.write({
    note:
      "Score turns 2 and 3 on the adaptation rubric: a new tack scores 4, " +
      "the same explanation shortened scores 3, a restatement scores 2.",
  });
});
