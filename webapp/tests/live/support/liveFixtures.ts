import { test as base, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

/* Fixtures for the live-account pass.
 *
 * The critical-path and persona suites intercept every call to the Supabase
 * origin and answer it from memory, which is what makes them deterministic
 * and safe. This suite is the opposite on purpose: it exists to answer the
 * three questions a mocked model cannot — is the teaching any good, does it
 * adapt when the student is still lost, and does it admit what it does not
 * know — and none of those survive a canned reply.
 *
 * What that costs, stated plainly because the safety of this suite rests on
 * the reader knowing it:
 *
 *   Real rows. Every session, quiz attempt, learning event and misconception
 *   this writes lands in the live project, under whichever account signs in.
 *   Use a throwaway student account. Never the owner's.
 *
 *   Real money and real quotas. Each turn is a model call billed to the
 *   project, and the free plan's per-tool daily allowances are small enough
 *   (two Solver runs, two Feynman, fifteen chat) that a single sweep will
 *   exhaust them. Plan the run around that, or put the test account on Pro.
 *
 *   Real slowness. A model round trip is seconds, not the 30ms a stub takes,
 *   so the timeouts here are generous and the suite runs one worker.
 *
 * Nothing runs without LEARNORA_LIVE=1 and a set of credentials. That is a
 * deliberate speed bump: it should not be possible to point this at
 * production by running `npx playwright test` in the wrong directory.
 */

export interface LiveConfig {
  email: string;
  password: string;
  /** Where the app is served. A deployed URL, or a local dev server that
   *  talks to the same live project (src/lib/supabase.ts hard-codes it). */
  baseUrl: string;
}

export function readLiveConfig(): LiveConfig {
  const missing: string[] = [];
  const need = (name: string) => {
    const value = process.env[name];
    if (!value) missing.push(name);
    return value ?? "";
  };

  if (process.env.LEARNORA_LIVE !== "1") {
    throw new Error(
      "Refusing to run: this suite talks to the live Supabase project and " +
        "spends real AI quota. Set LEARNORA_LIVE=1 to confirm you mean it.",
    );
  }

  const email = need("LEARNORA_TEST_EMAIL");
  const password = need("LEARNORA_TEST_PASSWORD");
  const baseUrl = process.env.LEARNORA_BASE_URL ?? "http://localhost:5199/app/";

  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(", ")}. Use a throwaway student account — this ` +
        "suite writes rows that stay in the account it signs into.",
    );
  }

  return { email, password, baseUrl };
}

/* ------------------------------------------------------------- recording */

export interface Exchange {
  at: string;
  /** Which journey step asked. */
  step: string;
  /** What the student typed. */
  asked: string;
  /** What came back, verbatim and untrimmed — the thing being judged. */
  answered: string;
  /** Seconds the student waited. */
  waitedMs: number;
}

/** Captures every real model answer to disk, because the assessment happens
 *  by reading them afterwards against the rubric in tests/live/README.md.
 *  An automated assertion cannot tell a good explanation from a fluent one;
 *  a person, or a model reading the transcript later, can. */
export class LiveTranscript {
  readonly exchanges: Exchange[] = [];
  private readonly outDir: string;

  constructor(readonly journey: string) {
    this.outDir =
      process.env.LIVE_OUT ?? path.join(process.cwd(), "tests", "live", "out");
  }

  record(entry: Omit<Exchange, "at">): void {
    this.exchanges.push({ at: new Date().toISOString(), ...entry });
  }

  write(extra: Record<string, unknown> = {}): void {
    fs.mkdirSync(this.outDir, { recursive: true });
    fs.writeFileSync(
      path.join(this.outDir, `${this.journey}.json`),
      JSON.stringify({ journey: this.journey, ...extra, exchanges: this.exchanges }, null, 2),
      "utf8",
    );

    /* A readable companion, because the point is that a human skims these. */
    const lines = this.exchanges.map(
      (e) =>
        `### ${e.step}  (${(e.waitedMs / 1000).toFixed(1)}s)\n\n` +
        `**Student:** ${e.asked}\n\n**Learnora:**\n\n${e.answered}\n`,
    );
    fs.writeFileSync(
      path.join(this.outDir, `${this.journey}.md`),
      `# ${this.journey}\n\n${lines.join("\n---\n\n")}`,
      "utf8",
    );
  }
}

/* -------------------------------------------------------------- fixtures */

export interface LiveFixtures {
  live: LiveConfig;
}

export const test = base.extend<LiveFixtures>({
  live: async ({}, provide) => {
    await provide(readLiveConfig());
  },
});

export { expect };

/** Sign in through the real form against the real auth service. */
export async function signIn(page: Page, live: LiveConfig): Promise<void> {
  await page.goto("login");
  await page.getByLabel("Email").fill(live.email);
  await page.getByLabel("Password", { exact: true }).fill(live.password);
  await page.getByRole("button", { name: /Log In|Sign In/i }).click();
  await expect(page.getByRole("navigation").first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Close any action-confirmation dialog the tutor has left on screen.
 *
 *  Returns what it dismissed, so a journey can report that the tutor chose
 *  to interrupt rather than answer — which is itself worth knowing. */
export async function dismissActionPrompt(page: Page): Promise<string | null> {
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog")).first();
  if (!(await dialog.isVisible({ timeout: 1500 }).catch(() => false))) return null;

  const text = (await dialog.innerText({ timeout: 2000 }).catch(() => "")).replace(/\s+/g, " ").trim();
  const decline = dialog.getByRole("button", { name: /cancel|no|not now|dismiss/i }).first();
  if (await decline.isVisible({ timeout: 1000 }).catch(() => false)) {
    await decline.click().catch(() => {});
  } else {
    await page.keyboard.press("Escape").catch(() => {});
  }
  await page.waitForTimeout(600);
  return text;
}

/** Ask the tutor and wait for a real answer to finish arriving.
 *
 *  Completion is the pending bubble's spinner going away, not the text
 *  settling. The first version watched for the transcript text to stop
 *  changing, which failed on the very first live question: the spinner
 *  carries its label in `aria-label` and contributes no text, so a model
 *  still generating after ninety seconds looked exactly like a finished
 *  answer of zero characters — and the call was spent either way.
 *
 *  The answer is then read from the last AI bubble rather than by slicing
 *  the feed around the question, which cannot tell the student's own echoed
 *  words from the reply. */
export async function ask(
  page: Page,
  question: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ answer: string; waitedMs: number }> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const started = Date.now();

  const aiBubbles = page.locator("[class*=aiBubble]");

  /* The tutor can end a turn by proposing an action — "AI wants to generate
     a formal interactive quiz on …" — which opens a confirmation dialog
     over the whole page. Left standing it swallows the next question: the
     first live run typed turns two and three into an input the modal was
     covering, sent neither, and read the first answer back three times,
     which looked exactly like a tutor repeating itself.

     Declined rather than accepted. The student asked a question and did
     not ask for a quiz, and accepting would spend a quiz generation out of
     a separate daily allowance. */
  await dismissActionPrompt(page);

  const before = await aiBubbles.count().catch(() => 0);

  const box = page.getByLabel("AI chat input");
  await box.fill(question);
  await box.press("Enter");

  /* A new bubble appears almost at once, pending. Wait for one more than
     there were, then for its spinner to clear. */
  await page
    .waitForFunction(
      ([count]) => document.querySelectorAll("[class*=aiBubble]").length > (count as number),
      [before] as const,
      { timeout: 30_000 },
    )
    .catch(() => {});

  const thinking = page.locator('[aria-label="Learnora AI is thinking"]');
  await thinking
    .last()
    .waitFor({ state: "detached", timeout: timeoutMs })
    .catch(() => {
      /* Still generating when we gave up. The bubble is read anyway, and
         the wait recorded, because "it never finished" is a finding. */
    });
  await page.waitForTimeout(500);

  const answer = await aiBubbles
    .last()
    .innerText({ timeout: 5000 })
    .catch(() => "");

  return { answer: answer.trim(), waitedMs: Date.now() - started };
}
