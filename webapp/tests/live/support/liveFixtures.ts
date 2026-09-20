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

/** Ask the tutor and wait for a real answer to finish arriving.
 *
 *  "Finished" is judged by the reply text going quiet rather than by a
 *  spinner: the panel renders one complete response, but a live call takes
 *  seconds and the DOM settles in stages. */
export async function ask(
  page: Page,
  question: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ answer: string; waitedMs: number }> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const started = Date.now();

  const box = page.getByLabel("AI chat input");
  await box.fill(question);
  await box.press("Enter");

  const transcript = page.locator("[class*=messageList], [role=log]").first();
  let previous = "";
  let stableFor = 0;

  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(1000);
    const now = await transcript.innerText().catch(() => "");
    if (now === previous && now.length > 0) {
      stableFor += 1;
      /* Three quiet seconds after something arrived. */
      if (stableFor >= 3 && now.includes(question)) break;
    } else {
      stableFor = 0;
      previous = now;
    }
  }

  const full = await transcript.innerText().catch(() => "");
  const afterQuestion = full.split(question).pop() ?? full;
  return { answer: afterQuestion.trim(), waitedMs: Date.now() - started };
}
