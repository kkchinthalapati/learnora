import { test, expect, loginAs } from "./support/fixtures";

/* T12 of the UX rehaul: no signed-in screen may scroll sideways, and no
 * result or risk card may truncate its own text, at any of the four widths
 * the redesign was checked at. Driven against the mocked backend, so the
 * screens are the real app with a known, reproducible account behind them.
 *
 * The account is seeded with an upcoming exam, a ledger row and a Debugger
 * trace, so the dashboard's "Study this now" block renders — it is the
 * newest and least-seen piece of layout on the busiest screen. */

const WIDTHS = [1440, 1024, 768, 390] as const;

const ROUTES = [
  "",
  "dashboard",
  "library",
  "plan",
  "my-week",
  "tasks",
  "exams",
  "timer",
  "analytics",
  "study",
  "solver",
  "feynman",
  "viva",
  "exam-detective",
  "settings",
] as const;

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

test.describe("responsive layout", () => {
  test.beforeEach(async ({ page, backend }) => {
    backend.seed("folders", [
      { id: "f-physics", name: "Physics", color: null, created_at: "2026-09-01T00:00:00Z" },
    ]);
    backend.seed("exams", [
      {
        id: 1,
        exam_name: "Physics Paper 1",
        exam_date: inDays(4),
        difficulty: null,
        status: null,
        folder_id: "f-physics",
      },
    ]);
    backend.seed("misconceptions", [
      {
        id: "m-root",
        subject: "Physics",
        concept: "Vector addition",
        concept_key: "addition vector",
        summary: "Adds magnitudes and ignores direction.",
        status: "open",
        severity: "critical",
        origin_tool: "debugger",
        times_observed: 2,
        times_corrected: 0,
        first_seen_at: "2026-09-01T10:00:00Z",
        last_seen_at: "2026-09-20T10:00:00Z",
        resolved_at: null,
      },
    ]);

    await loginAs(page);

    /* Saved traces live in localStorage, per device. */
    await page.evaluate(() => {
      localStorage.setItem(
        "learnora_cognitive_traces_v1",
        JSON.stringify([
          {
            id: "t-1",
            failedQuestionOrTopic: "A 2D collision question",
            subject: "Physics",
            rootCauseSummary: "Direction is being dropped.",
            timestamp: "2026-09-20T10:00:00Z",
            layers: [
              { level: 1, concept: "Vector addition", status: "severed", explanation: "x" },
              { level: 2, concept: "Momentum", status: "shaky", explanation: "x" },
              { level: 3, concept: "2D collisions", status: "shaky", explanation: "x" },
            ],
          },
        ]),
      );
    });
  });

  for (const width of WIDTHS) {
    test(`no signed-in screen scrolls sideways at ${width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });

      const problems: string[] = [];

      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
          timeout: 15_000,
        });
        /* Let lazy panels and queries settle before measuring. */
        await page.waitForTimeout(600);

        const report = await page.evaluate(() => {
          const doc = document.documentElement;
          const overflowX = doc.scrollWidth - doc.clientWidth;

          /* Widest offender, so a failure names the element to fix. */
          let widest = "";
          if (overflowX > 0) {
            let max = doc.clientWidth;
            for (const el of Array.from(document.body.querySelectorAll("*"))) {
              const r = el.getBoundingClientRect();
              if (r.right > max + 1) {
                max = r.right;
                const cls = typeof el.className === "string" ? el.className : "";
                widest = `${el.tagName.toLowerCase()}.${cls.split(" ")[0]} (${Math.round(r.right)}px)`;
              }
            }
          }

          /* Text a card truncates on itself. Allowed only where the element
             carries the whole text in its title — a calendar cell is a
             seventh of the screen and cannot fit a name, but the name must
             still be reachable. */
          const clipped: string[] = [];
          for (const el of Array.from(document.body.querySelectorAll("*"))) {
            const h = el as HTMLElement;
            if (getComputedStyle(h).textOverflow !== "ellipsis") continue;
            const full = (h.textContent ?? "").trim();
            if (h.title && h.title.trim() === full) continue;
            if (h.scrollWidth > h.clientWidth + 1 && h.closest("[class*='ard']")) {
              clipped.push((h.textContent ?? "").trim().slice(0, 40));
            }
          }
          return { overflowX, widest, clipped };
        });

        if (report.overflowX > 0) {
          problems.push(`/${route}: ${report.overflowX}px sideways — ${report.widest}`);
        }
        for (const text of report.clipped) {
          problems.push(`/${route}: card text truncated — "${text}"`);
        }
      }

      expect(problems, problems.join("\n")).toEqual([]);
    });
  }

  test("the Study this now block renders from a real trace", async ({ page }) => {
    await page.goto("dashboard");
    const block = page.getByTestId("study-this-now");
    await expect(block).toBeVisible({ timeout: 15_000 });
    await expect(block.getByRole("heading", { name: "Vector addition" })).toBeVisible();
    await expect(block).toContainText("2 other topics on the paper sit on top of it");
  });
});
