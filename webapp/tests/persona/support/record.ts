import type { Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

/* Evidence recorder for the student-persona pass.
 *
 * The point of this file is that the report written afterwards can only
 * contain things that actually happened. Every journey writes a log of what
 * the "student" did, what the screen said back, and everything the browser
 * complained about while it happened — console errors, uncaught exceptions,
 * failed requests, and endpoints the mock backend never implemented (which
 * are a signal about the app's calls, not only about the mock).
 */

export interface Note {
  t: number;
  kind: "do" | "see" | "think" | "console" | "pageerror" | "requestfail" | "timing";
  text: string;
}

const OUT_DIR =
  process.env.PERSONA_OUT ??
  path.join(process.cwd(), "tests", "persona", "out");

export class StudentLog {
  readonly notes: Note[] = [];
  private readonly started = Date.now();

  constructor(
    readonly name: string,
    private readonly page: Page,
  ) {
    page.on("console", (message) => {
      const type = message.type();
      if (type !== "error" && type !== "warning") return;
      this.add("console", `[${type}] ${message.text().slice(0, 400)}`);
    });
    page.on("pageerror", (error) => {
      this.add("pageerror", `${error.name}: ${error.message.slice(0, 400)}`);
    });
    page.on("requestfailed", (request) => {
      this.add(
        "requestfail",
        `${request.method()} ${request.url().slice(0, 200)} — ${request.failure()?.errorText ?? "?"}`,
      );
    });
  }

  private add(kind: Note["kind"], text: string): void {
    this.notes.push({ t: Date.now() - this.started, kind, text });
  }

  /** Something the student did. */
  did(text: string): void {
    this.add("do", text);
  }

  /** Something the screen showed back. */
  saw(text: string): void {
    this.add("see", text);
  }

  /** The student's in-the-moment reaction. Kept separate from observation so
   *  the report can tell interpretation from evidence. */
  thought(text: string): void {
    this.add("think", text);
  }

  /** Time an action, so "this felt slow" can be checked against a number. */
  async timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.add("timing", `${label}: ${Date.now() - start}ms`);
    }
  }

  /** Everything visible on screen right now, trimmed — what the student can
   *  actually read, used to judge whether a screen explains itself. */
  async visibleText(limit = 1500): Promise<string> {
    const text = await this.page
      .locator("body")
      .innerText()
      .catch(() => "");
    return text.replace(/\n{3,}/g, "\n\n").slice(0, limit);
  }

  /** Names of everything clickable on screen — the student's actual options. */
  async affordances(): Promise<string[]> {
    return this.page
      .evaluate(() => {
        const out: string[] = [];
        const nodes = document.querySelectorAll<HTMLElement>(
          "button, a[href], [role=button], [role=tab], input, textarea, select",
        );
        for (const node of nodes) {
          const box = node.getBoundingClientRect();
          if (box.width === 0 || box.height === 0) continue;
          const style = getComputedStyle(node);
          if (style.visibility === "hidden" || style.display === "none") continue;
          const label =
            node.getAttribute("aria-label") ||
            node.getAttribute("placeholder") ||
            node.textContent?.trim().replace(/\s+/g, " ").slice(0, 60) ||
            `<${node.tagName.toLowerCase()}>`;
          if (label) out.push(label);
        }
        return [...new Set(out)];
      })
      .catch(() => []);
  }

  async shot(label: string): Promise<void> {
    const dir = path.join(OUT_DIR, this.name);
    fs.mkdirSync(dir, { recursive: true });
    const safe = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    await this.page
      .screenshot({
        path: path.join(dir, `${String(this.notes.length).padStart(3, "0")}-${safe}.png`),
        fullPage: false,
      })
      .catch(() => {});
  }

  /** Console noise, deduplicated — repeated identical errors are one problem. */
  problems(): { console: string[]; pageErrors: string[]; requestFails: string[] } {
    const pick = (kind: Note["kind"]) => [
      ...new Set(this.notes.filter((n) => n.kind === kind).map((n) => n.text)),
    ];
    return {
      console: pick("console"),
      pageErrors: pick("pageerror"),
      requestFails: pick("requestfail"),
    };
  }

  write(extra: Record<string, unknown> = {}): void {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const body = {
      journey: this.name,
      durationMs: Date.now() - this.started,
      problems: this.problems(),
      ...extra,
      notes: this.notes,
    };
    fs.writeFileSync(
      path.join(OUT_DIR, `${this.name}.json`),
      JSON.stringify(body, null, 2),
      "utf8",
    );

    const lines = this.notes.map((n) => {
      const icon = {
        do: "DO  ",
        see: "SEE ",
        think: "HMM ",
        console: "CONS",
        pageerror: "CRSH",
        requestfail: "NET ",
        timing: "TIME",
      }[n.kind];
      return `${String(n.t).padStart(6)}ms ${icon} ${n.text}`;
    });
    fs.writeFileSync(
      path.join(OUT_DIR, `${this.name}.log`),
      lines.join("\n"),
      "utf8",
    );
  }
}
